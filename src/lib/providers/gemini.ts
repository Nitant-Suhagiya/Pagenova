import type { ChatMessage, ContentPart, LLMProvider, ModelInfo, StreamChunk } from './types'
import { providerErrorDetail } from './errors'

function toGeminiParts(content: ContentPart[]) {
  return content.map((part) => part.type === 'text'
    ? { text: part.text }
    : { inlineData: { mimeType: part.mimeType, data: part.base64 } })
}

function* parseGeminiEvent(event: string): Generator<StreamChunk> {
  const data = event.split('\n').find((line) => line.startsWith('data:'))?.replace(/^data:\s*/, '')
  if (!data) return
  try {
    const parsed = JSON.parse(data) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }> }
    const candidate = parsed.candidates?.[0]
    const delta = candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
    if (delta) yield { delta, done: false }
    if (candidate?.finishReason) yield { delta: '', done: true }
  } catch { /* Ignore malformed provider events. */ }
}

export async function* parseGeminiSSEStream(stream: ReadableStream): AsyncGenerator<StreamChunk> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let emittedText = false
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '')
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''
      for (const event of events) {
        for (const chunk of parseGeminiEvent(event)) {
          if (chunk.delta) emittedText = true
          if (chunk.done) {
            if (!emittedText) throw new Error('Gemini returned no text.')
            yield chunk
            return
          }
          yield chunk
        }
      }
    }
    buffer += decoder.decode().replace(/\r/g, '')
    for (const chunk of parseGeminiEvent(buffer)) {
      if (chunk.delta) emittedText = true
      if (chunk.done) {
        if (!emittedText) throw new Error('Gemini returned no text.')
        yield chunk
        return
      }
      yield chunk
    }
    if (!emittedText) throw new Error('Gemini returned no text.')
    yield { delta: '', done: true }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
}

export class GeminiProvider implements LLMProvider {
  id = 'gemini'
  readonly apiKey: string
  readonly baseUrl: string

  constructor(apiKey: string, baseUrl = 'https://generativelanguage.googleapis.com') {
    this.apiKey = apiKey
    this.baseUrl = baseUrl
  }

  async listModels(): Promise<ModelInfo[]> {
    if (!this.apiKey) return []
    const response = await fetch(`${this.baseUrl}/v1beta/models`, {
      headers: { 'x-goog-api-key': this.apiKey },
    })
    if (!response.ok) {
      throw new Error(`Unable to list Gemini models: ${response.status}${await providerErrorDetail(response)}`)
    }

    const payload = (await response.json()) as { models?: Array<{ name?: string }> }
    return (payload.models ?? [])
      .map((model) => (model.name ?? '').replace(/^models\//, ''))
      .filter((name) => name && !/(embedding|embed|aqa|imagen|veo)/i.test(name))
      .map((name) => ({
        name,
        supportsVision: /gemini/i.test(name),
      }))
  }

  async *chatStream(model: string, messages: ChatMessage[], signal: AbortSignal): AsyncGenerator<StreamChunk> {
    const system = messages.find((message) => message.role === 'system')
    const response = await fetch(`${this.baseUrl}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: toGeminiParts(system.content) } } : {}),
        contents: messages.filter((message) => message.role !== 'system').map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: toGeminiParts(message.content) })),
      }),
      signal,
    })
    if (!response.ok) throw new Error(`Gemini request failed: ${response.status}${await providerErrorDetail(response)}`)
    if (!response.body) throw new Error('Gemini stream body is missing')
    yield* parseGeminiSSEStream(response.body)
  }
}
