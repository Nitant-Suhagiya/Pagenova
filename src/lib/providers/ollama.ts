import type { ChatMessage, ContentPart, LLMProvider, ModelInfo, StreamChunk } from './types'
import { providerErrorDetail } from './errors'

export function isMoondream(model: string): boolean {
  return /^moondream(?::|$)/i.test(model)
}

function inferredVisionSupport(name: string): boolean {
  return /(llava|bakllava|llama3\.2-vision|gemma3|qwen2-vl|qwen3\.5|moondream|vision)/i.test(name)
}

export function toOllamaPayload(messages: ChatMessage[]) {
  return messages.map((message) => {
    const text = message.content
      .filter((part) => part.type === 'text')
      .map((part) => (part.type === 'text' ? part.text : ''))
      .join('\n')
      .trim() || 'Please analyze the provided content.'

    const images = message.content
      .filter((part): part is Extract<ContentPart, { type: 'image' }> => part.type === 'image')
      .map((part) => part.base64)

    return {
      role: message.role,
      content: text,
      ...(images.length > 0 ? { images } : {}),
    }
  })
}

export async function* parseOllamaStream(stream: ReadableStream): AsyncGenerator<StreamChunk> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let sawDone = false

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        try {
          const parsed = JSON.parse(trimmed) as {
            message?: { content?: string }
            done?: boolean
          }

          const delta = parsed.message?.content ?? ''
          if (delta) {
            yield { delta, done: false }
          }

          if (parsed.done) {
            sawDone = true
            yield { delta: '', done: true }
            return
          }
        } catch {
          // Ignore malformed chunks while streaming.
        }
      }
    }

    const finalLine = buffer.trim()
    if (finalLine) {
      try {
        const parsed = JSON.parse(finalLine) as {
          message?: { content?: string }
          done?: boolean
        }

        const delta = parsed.message?.content ?? ''
        if (delta) {
          yield { delta, done: false }
        }

        if (parsed.done) {
          sawDone = true
          yield { delta: '', done: true }
          return
        }
      } catch {
        // Ignored malformed final JSON from Ollama.
      }
    }

    if (!sawDone) {
      yield { delta: '', done: true }
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

export class OllamaProvider implements LLMProvider {
  id = 'ollama'

  readonly baseUrl: string

  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl
  }

  async listModels(): Promise<ModelInfo[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`)
    if (!response.ok) {
      throw new Error(`Unable to fetch Ollama models: ${response.status}${await providerErrorDetail(response)}`)
    }

    const payload = (await response.json()) as { models?: Array<{ name?: string }> }
    const names = (payload.models ?? []).map((model) => model.name ?? '').filter(Boolean)
    return Promise.all(names.map(async (name) => {
      const details = await fetch(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: name }),
      }).then(async (res) => res.ok ? res.json() as Promise<{ capabilities?: string[] }> : null).catch(() => null)
      return { name, supportsVision: details?.capabilities?.includes('vision') ?? inferredVisionSupport(name) }
    }))
  }

  async *chatStream(
    model: string,
    messages: ChatMessage[],
    signal: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages: toOllamaPayload(messages), stream: true, options: { temperature: 0, num_predict: 512 } }),
      signal,
    })

    if (!response.ok) {
      throw new Error(`Ollama response failed: ${response.status}${await providerErrorDetail(response)}`)
    }

    if (!response.body) {
      throw new Error('Ollama stream body is missing')
    }

    for await (const chunk of parseOllamaStream(response.body)) {
      yield chunk
      if (chunk.done) break
    }
  }
}
