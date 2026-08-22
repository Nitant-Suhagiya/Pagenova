import { afterEach, describe, expect, it, vi } from 'vitest'

import { isMoondream, OllamaProvider, parseOllamaStream } from './ollama'

afterEach(() => vi.unstubAllGlobals())

describe('parseOllamaStream', () => {
  it('recognizes Moondream model tags', () => {
    expect(isMoondream('moondream:latest')).toBe(true)
    expect(isMoondream('llama3.2:latest')).toBe(false)
  })

  it('parses streamed NDJSON chunks and marks the final chunk as done', async () => {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(
          encoder.encode('{"message":{"content":"Hello"}}\n{"message":{"content":" world"},"done":true}\n'),
        )
        controller.close()
      },
    })

    const chunks: Array<{ delta: string; done: boolean }> = []

    for await (const chunk of parseOllamaStream(stream)) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { delta: 'Hello', done: false },
      { delta: ' world', done: false },
      { delta: '', done: true },
    ])
  })

  it('uses Ollama model capabilities instead of inferring vision from the model name', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: 'oamazonsgabriel/qwen3.5-0.8b:q8_8gbC' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ capabilities: ['completion', 'vision'] })))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new OllamaProvider().listModels()).resolves.toEqual([{
      name: 'oamazonsgabriel/qwen3.5-0.8b:q8_8gbC',
      supportsVision: true,
    }])
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:11434/api/show')
  })

  it('recognizes Qwen3.5 vision models if older Ollama metadata is unavailable', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ models: [{ name: 'oamazonasgabriel/qwen3.5-0.8b:q8-8gbGPU' }] })))
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new OllamaProvider().listModels()).resolves.toEqual([{
      name: 'oamazonasgabriel/qwen3.5-0.8b:q8-8gbGPU',
      supportsVision: true,
    }])
  })

})
