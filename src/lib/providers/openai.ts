import type { ChatMessage, ContentPart, LLMProvider, ModelInfo, StreamChunk } from './types'
import { providerErrorDetail } from './errors'

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  const octets = host.split('.').map(Number)
  return host === 'localhost' || host.endsWith('.localhost') || host === '::1'
    || (octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255) && octets[0] === 127)
}

export function normalizeOpenAIBaseUrl(baseUrl: string): string {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new Error('Provider URL must be a valid HTTPS URL.')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Provider URL must not contain credentials, a query, or a fragment.')
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopbackHost(url.hostname))) {
    throw new Error('Provider URL must use HTTPS. HTTP is allowed only for localhost.')
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '').replace(/\/v1$/, '')
}

export function toOpenAIContent(content: ContentPart[]) {
  return content.map((part) => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text }
    }

    return {
      type: 'image_url',
      image_url: {
        url: `data:${part.mimeType};base64,${part.base64}`,
      },
    }
  })
}

export async function* parseOpenAISSEStream(stream: ReadableStream): AsyncGenerator<StreamChunk> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        const trimmed = part.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue

        const data = trimmed.replace(/^data:\s*/, '').trim()
        if (!data || data === '[DONE]') {
          yield { delta: '', done: true }
          return
        }

        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{
              delta?: { content?: string }
            }>
          }

          const delta = parsed.choices?.[0]?.delta?.content ?? ''
          yield { delta, done: false }
        } catch {
          // Ignore malformed SSE chunks.
        }
      }
    }

    if (buffer.trim()) {
      const trimmed = buffer.trim()
      if (trimmed.startsWith('data:')) {
        const data = trimmed.replace(/^data:\s*/, '').trim()
        if (data && data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{
                delta?: { content?: string }
              }>
            }

            const delta = parsed.choices?.[0]?.delta?.content ?? ''
            yield { delta, done: false }
          } catch {
            // Ignore malformed final SSE payload.
          }
        }
      }
    }

    yield { delta: '', done: true }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

export class OpenAIProvider implements LLMProvider {
  id = 'openai'

  readonly apiKey: string
  readonly baseUrl: string

  constructor({ apiKey, baseUrl = 'https://api.openai.com' }: { apiKey: string; baseUrl?: string }) {
    this.apiKey = apiKey
    this.baseUrl = normalizeOpenAIBaseUrl(baseUrl)
  }

  async listModels(): Promise<ModelInfo[]> {
    if (!this.apiKey) return []
    const response = await fetch(`${this.baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
    if (!response.ok) {
      throw new Error(`Unable to list OpenAI models: ${response.status}${await providerErrorDetail(response)}`)
    }

    const payload = (await response.json()) as { data?: Array<{ id?: string }> }
    return (payload.data ?? [])
      .map((model) => model.id ?? '')
      .filter((id) => id && !/(embedding|whisper|tts|audio|dall-e|moderation|realtime|transcribe|speech|search)/i.test(id))
      .map((name) => ({
        name,
        supportsVision: /gpt-4o|gpt-4\.1|o1|o3|o4|vision|vl|qwen|llava/i.test(name),
      }))
  }

  async *chatStream(
    model: string,
    messages: ChatMessage[],
    signal: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages.map((message) => ({
          role: message.role,
          content: toOpenAIContent(message.content),
        })),
        stream: true,
      }),
      signal,
    })

    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.status}${await providerErrorDetail(response)}`)
    }

    if (!response.body) {
      throw new Error('OpenAI stream body is missing')
    }

    for await (const chunk of parseOpenAISSEStream(response.body)) {
      yield chunk
      if (chunk.done) break
    }
  }
}
