import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('embedTexts browser retry', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  it('retries once when the offscreen embedding call fails, then succeeds', async () => {
    const listeners: Array<(msg: { type?: string }) => void> = []
    let calls = 0

    const chrome = {
      storage: {
        local: {
          get: vi.fn(async () => ({
            embeddingBackend: 'browser',
            ollamaBaseUrl: 'http://localhost:11434',
            ollamaEmbeddingModel: 'nomic-embed-text',
          })),
        },
      },
      runtime: {
        getContexts: vi.fn(async () => []),
        onMessage: {
          addListener: vi.fn((l: (msg: { type?: string }) => void) => listeners.push(l)),
          removeListener: vi.fn(),
        },
        sendMessage: vi.fn(async (msg: { type: string; texts: string[] }) => {
          if (msg.type !== 'EMBED_TEXTS') return {}
          calls++
          if (calls === 1) throw new Error('offscreen doc raced')
          return { embeddings: [[1, 2, 3]] }
        }),
      },
      offscreen: {
        createDocument: vi.fn(async () => {
          listeners[listeners.length - 1]?.({ type: 'OFFSCREEN_READY' })
        }),
      },
    }

    vi.stubGlobal('chrome', chrome)

    const { embedTexts } = await import('./embed')
    const result = await embedTexts(['hello'])

    expect(result).toHaveLength(1)
    expect(Array.from(result[0])).toEqual([1, 2, 3])
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2)
    expect(chrome.offscreen.createDocument).toHaveBeenCalledTimes(2)
  })
})
