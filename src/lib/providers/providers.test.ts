import { describe, expect, it, vi } from 'vitest'

import { OllamaProvider } from './ollama'
import { OpenAIProvider } from './openai'
import { AnthropicProvider, parseAnthropicSSEStream } from './anthropic'
import { GeminiProvider, parseGeminiSSEStream } from './gemini'

describe('provider streaming parsers', () => {
  it('parses Ollama NDJSON stream chunks and uses deterministic sampling', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"message":{"content":"Hello"}}\n'))
        controller.enqueue(new TextEncoder().encode('{"message":{"content":" world"},"done":true}\n'))
        controller.close()
      },
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    }))

    const provider = new OllamaProvider('http://localhost:11434')
    const chunks: Array<{ delta: string; done: boolean }> = []

    for await (const chunk of provider.chatStream('llama3.1', [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], new AbortController().signal)) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { delta: 'Hello', done: false },
      { delta: ' world', done: false },
      { delta: '', done: true },
    ])
    expect(JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string).options).toEqual({ temperature: 0, num_predict: 512 })

    vi.unstubAllGlobals()
  })

  it('parses OpenAI SSE stream chunks and final done state', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: [DONE]\n\n',
    ].join('')

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(sse))
          controller.close()
        },
      }),
    }))

    const provider = new OpenAIProvider({ apiKey: 'test-key' })
    const chunks: Array<{ delta: string; done: boolean }> = []

    for await (const chunk of provider.chatStream('gpt-4o-mini', [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], new AbortController().signal)) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { delta: 'Hello', done: false },
      { delta: ' world', done: false },
      { delta: '', done: true },
    ])

    vi.unstubAllGlobals()
  })
})

describe('parseAnthropicSSEStream', () => {
  it('emits text deltas and a terminal done', async () => {
    const sse = [
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"Hi"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":" there"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ].join('')

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse))
        controller.close()
      },
    })

    const chunks: Array<{ delta: string; done: boolean }> = []
    for await (const chunk of parseAnthropicSSEStream(stream)) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { delta: 'Hi', done: false },
      { delta: ' there', done: false },
      { delta: '', done: true },
    ])
  })

  it('skips malformed chunks and keeps streaming', async () => {
    const sse = [
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"ok"}}\n\n',
      'event: content_block_delta\ndata: {this is not valid json}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"!"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ].join('')

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse))
        controller.close()
      },
    })

    const chunks: Array<{ delta: string; done: boolean }> = []
    for await (const chunk of parseAnthropicSSEStream(stream)) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { delta: 'ok', done: false },
      { delta: '!', done: false },
      { delta: '', done: true },
    ])
  })
})

describe('parseGeminiSSEStream', () => {
  it('joins candidate parts and terminates on finishReason', async () => {
    const sse = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Hello"},{"text":" world"}]}}]}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"!"}]},"finishReason":"STOP"}]}\n\n',
    ].join('')

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse))
        controller.close()
      },
    })

    const chunks: Array<{ delta: string; done: boolean }> = []
    for await (const chunk of parseGeminiSSEStream(stream)) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { delta: 'Hello world', done: false },
      { delta: '!', done: false },
      { delta: '', done: true },
    ])
  })

  it('accepts CRLF-delimited events and rejects an empty answer', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]},"finishReason":"STOP"}]}\r\n\r\n'))
        controller.close()
      },
    })

    const chunks: Array<{ delta: string; done: boolean }> = []
    for await (const chunk of parseGeminiSSEStream(stream)) chunks.push(chunk)
    expect(chunks).toEqual([{ delta: 'Hello', done: false }, { delta: '', done: true }])

    const empty = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":""}]},"finishReason":"STOP"}]}\n\n'))
        controller.close()
      },
    })
    await expect(async () => { for await (const _ of parseGeminiSSEStream(empty)) { /* drain */ } }).rejects.toThrow('Gemini returned no text.')
  })
})

describe('OpenAI-compatible base URLs', () => {
  it('requires HTTPS outside loopback', () => {
    expect(() => new OpenAIProvider({ apiKey: 'test', baseUrl: 'http://example.com' })).toThrow('must use HTTPS')
    expect(() => new OpenAIProvider({ apiKey: 'test', baseUrl: 'http://localhost:8080' })).not.toThrow()
    expect(() => new OpenAIProvider({ apiKey: 'test', baseUrl: 'http://127.0.0.2:8080' })).not.toThrow()
  })

  it('recognizes vision models from compatible provider catalogs', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'deepseek-v4-flash-vision-exp' }] }),
    }))

    const provider = new OpenAIProvider({ apiKey: 'test', baseUrl: 'https://api.deepseek.com/v1' })
    await expect(provider.listModels()).resolves.toEqual([
      { name: 'deepseek-v4-flash-vision-exp', supportsVision: true },
    ])

    vi.unstubAllGlobals()
  })
})

describe('GeminiProvider system instructions', () => {
  it('sends system content through systemInstruction', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"ok"}]} ,"finishReason":"STOP"}]}\n\n'))
          controller.close()
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = new GeminiProvider('test-key')
    const messages = [
      { role: 'system' as const, content: [{ type: 'text' as const, text: 'rules' }] },
      { role: 'user' as const, content: [{ type: 'text' as const, text: 'question' }] },
    ]
    for await (const _ of provider.chatStream('gemini-2.0-flash', messages, new AbortController().signal)) { /* drain */ }

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'rules' }] })
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'question' }] }])
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ 'x-goog-api-key': 'test-key' })

    vi.unstubAllGlobals()
  })

  it('uses Ollama\'s chat endpoint for Moondream images', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({ start(controller) { controller.close() } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = new OllamaProvider('http://localhost:11434')
    for await (const _ of provider.chatStream('moondream:latest', [{ role: 'user', content: [{ type: 'text', text: 'describe this image' }, { type: 'image', base64: 'image-data', mimeType: 'image/png' }] }], new AbortController().signal)) { /* drain */ }

    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:11434/api/chat')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      model: 'moondream:latest',
      messages: [{ role: 'user', content: 'describe this image', images: ['image-data'] }],
      options: { num_predict: 512, temperature: 0 },
    })
    vi.unstubAllGlobals()
  })
})

describe('AnthropicProvider max_tokens', () => {
  it('sends system content through the top-level system field', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({ start(c) { c.close() } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('test-key')
    const messages = [
      { role: 'system' as const, content: [{ type: 'text' as const, text: 'rules', cache: true }] },
      { role: 'user' as const, content: [{ type: 'text' as const, text: 'question' }] },
    ]
    for await (const _ of provider.chatStream('claude-3-5-sonnet', messages, new AbortController().signal)) { /* drain */ }

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.system).toEqual([{ type: 'text', text: 'rules', cache_control: { type: 'ephemeral' } }])
    expect(body.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: 'question' }] }])
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ 'anthropic-dangerous-direct-browser-access': 'true' })

    vi.unstubAllGlobals()
  })

  it('sets a per-model output cap in the request body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({ start(c) { c.close() } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('test-key')
    const messages = [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'hi' }] }]

    for await (const _ of provider.chatStream('claude-3-5-sonnet', messages, new AbortController().signal)) { /* drain */ }

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.max_tokens).toBe(8192)

    vi.unstubAllGlobals()
  })

  it('raises the cap for newer models with larger ceilings', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream({ start(c) { c.close() } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = new AnthropicProvider('test-key')
    const messages = [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'hi' }] }]

    for await (const _ of provider.chatStream('claude-sonnet-4', messages, new AbortController().signal)) { /* drain */ }

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.max_tokens).toBe(64000)

    vi.unstubAllGlobals()
  })

  it('includes Anthropic’s error message when a request is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'CORS requests must set the browser access header' } }),
    }))

    const provider = new AnthropicProvider('test-key')
    const stream = provider.chatStream('claude-haiku-4-5-20251001', [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }], new AbortController().signal)
    await expect(stream.next()).rejects.toThrow('Anthropic request failed: 401: CORS requests must set the browser access header')

    vi.unstubAllGlobals()
  })
})
