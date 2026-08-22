import type { ChatMessage, ContentPart, LLMProvider, ModelInfo, StreamChunk } from './types'
import { providerErrorDetail } from './errors'

// Anthropic requires max_tokens and rejects values above a model's ceiling, so
// unlike the other providers we must set a per-model output cap.
const MAX_OUTPUT_TOKENS: Array<[string, number]> = [
  ['claude-opus-4', 32000],
  ['claude-sonnet-4', 64000],
  ['claude-haiku-4', 64000],
  ['claude-3-7', 64000],
  ['claude-3-5', 8192],
  ['claude-3-opus', 4096],
  ['claude-3-haiku', 4096],
]

function maxOutputTokens(model: string): number {
  return MAX_OUTPUT_TOKENS.find(([prefix]) => model.startsWith(prefix))?.[1] ?? 8192
}

function toAnthropicContent(content: ContentPart[]) {
  return content.map((part) => part.type === 'text'
    ? {
        type: 'text',
        text: part.text,
        // Ephemeral prompt caching lets the stable system prompt be reused
        // across requests. Below the model's minimum cacheable prefix this is a no-op —
        // Anthropic silently skips the write, so it's safe to mark unconditionally.
        ...(part.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
      }
    : { type: 'image', source: { type: 'base64', media_type: part.mimeType, data: part.base64 } })
}

export async function* parseAnthropicSSEStream(stream: ReadableStream): AsyncGenerator<StreamChunk> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const event of events) {
        const data = event.split('\n').find((line) => line.startsWith('data:'))?.replace(/^data:\s*/, '')
        if (!data) continue
        try {
          const parsed = JSON.parse(data) as { type?: string; delta?: { text?: string } }
          if (parsed.type === 'content_block_delta') yield { delta: parsed.delta?.text ?? '', done: false }
          if (parsed.type === 'message_stop') { yield { delta: '', done: true }; return }
        } catch { /* Ignore incomplete provider events. */ }
      }
    }
    yield { delta: '', done: true }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

export class AnthropicProvider implements LLMProvider {
  id = 'anthropic'
  readonly apiKey: string
  readonly baseUrl: string

  constructor(apiKey: string, baseUrl = 'https://api.anthropic.com') {
    this.apiKey = apiKey
    this.baseUrl = baseUrl
  }

  async listModels(): Promise<ModelInfo[]> {
    if (!this.apiKey) return []
    const response = await fetch(`${this.baseUrl}/v1/models`, {
      headers: { 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    })
    if (!response.ok) {
      throw new Error(`Unable to list Anthropic models: ${response.status}${await providerErrorDetail(response)}`)
    }

    const payload = (await response.json()) as { data?: Array<{ id?: string }> }
    return (payload.data ?? [])
      .map((model) => ({ name: model.id ?? '', supportsVision: true }))
      .filter((model) => model.name)
  }

  async *chatStream(model: string, messages: ChatMessage[], signal: AbortSignal): AsyncGenerator<StreamChunk> {
    const system = messages.find((message) => message.role === 'system')
    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model,
        max_tokens: maxOutputTokens(model),
        ...(system ? { system: toAnthropicContent(system.content) } : {}),
        messages: messages.filter((message) => message.role !== 'system').map((message) => ({ role: message.role, content: toAnthropicContent(message.content) })),
        stream: true,
      }),
      signal,
    })
    if (!response.ok) {
      throw new Error(`Anthropic request failed: ${response.status}${await providerErrorDetail(response)}`)
    }
    if (!response.body) throw new Error('Anthropic stream body is missing')
    yield* parseAnthropicSSEStream(response.body)
  }
}
