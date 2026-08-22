import { beforeEach, describe, expect, it, vi } from 'vitest'

const { embedTexts } = vi.hoisted(() => ({ embedTexts: vi.fn() }))
vi.mock('./embed', () => ({ embedTexts }))

import { prepareContext } from './retrieve'
import type { ContextInput } from './retrieve'
import { tokenEstimate } from './chunk'

function makeChromeStorage() {
  const store = new Map<string, unknown>()
  return {
    local: {
      get: vi.fn(async (keys?: string | string[] | Record<string, unknown>) => {
        if (keys == null) return Object.fromEntries(store)
        if (Array.isArray(keys)) {
          const out: Record<string, unknown> = {}
          for (const k of keys) if (store.has(k)) out[k] = store.get(k)
          return out
        }
        if (typeof keys === 'string') return store.has(keys) ? { [keys]: store.get(keys) } : {}
        const out: Record<string, unknown> = {}
        for (const k of Object.keys(keys)) if (store.has(k)) out[k] = store.get(k)
        return out
      }),
      set: vi.fn(async (obj: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(obj)) store.set(k, v)
      }),
      remove: vi.fn(async () => {}),
    },
  }
}

const baseInput: ContextInput = {
  question: 'what is this about?',
  tabs: [],
  docs: [{ name: 'notes.txt', text: 'hello world' }],
  provider: 'ollama',
  model: 'llama3.1:8b',
}

beforeEach(() => {
  embedTexts.mockReset()
  embedTexts.mockImplementation(async (texts: string[]) => texts.map(() => Float32Array.from([1, 0.5, 0.25])))
  vi.stubGlobal('chrome', { storage: makeChromeStorage() })
})

describe('prepareContext', () => {
  it('does not send a placeholder context when no source was selected', async () => {
    const result = await prepareContext({ ...baseInput, tabs: [], docs: [] })
    expect(result).toMatchObject({ context: '', mode: 'full', sources: [] })
  })

  it('uses full context and skips embedding when content is small', async () => {
    const result = await prepareContext(baseInput)
    expect(result.mode).toBe('full')
    expect(result.sources).toEqual(['notes.txt'])
    expect(embedTexts).not.toHaveBeenCalled()
  })

  it('enters retrieval mode for content that exceeds the model window', async () => {
    const result = await prepareContext({ ...baseInput, docs: [{ name: 'notes.txt', text: 'word '.repeat(5000) }] })
    expect(result.mode).toBe('retrieval')
    expect(result.sources).toContain('notes.txt')
  })

  it('keeps Moondream retrieval inside its 2K context window', async () => {
    const text = Array.from({ length: 10 }, () => `${'word '.repeat(350)}.`).join(' ')
    const result = await prepareContext({ ...baseInput, model: 'moondream:latest', docs: [{ name: 'notes.txt', text }] })
    expect(result.mode).toBe('retrieval')
    expect(tokenEstimate(result.context)).toBeLessThanOrEqual(1_100)
  })

  it('reuses cached chunks on re-index (no re-embed) and re-embeds on changed content', async () => {
    const input = { ...baseInput, docs: [{ name: 'notes.txt', text: 'word '.repeat(5000) }] }

    await prepareContext(input)
    expect(embedTexts).toHaveBeenCalledTimes(2) // chunks + question

    await prepareContext(input) // same content -> cache hit
    expect(embedTexts).toHaveBeenCalledTimes(3) // question only, no chunk re-embed

    await prepareContext({ ...input, docs: [{ name: 'notes.txt', text: 'changed '.repeat(5000) }] })
    expect(embedTexts).toHaveBeenCalledTimes(5) // re-index chunks + question
  })

  it('re-indexes a same-URL tab when its extracted content changes', async () => {
    const first = {
      ...baseInput,
      tabs: [{ id: 901, title: 'Live page', url: 'https://example.com/live', text: 'word '.repeat(5000) }],
      docs: [],
    }

    await prepareContext(first)
    await prepareContext({
      ...first,
      tabs: [{ ...first.tabs[0], text: 'changed '.repeat(5000) }],
    })

    expect(embedTexts).toHaveBeenCalledTimes(4) // chunks + question for each version
  })

  it('caps the aggregate source text so many long sources degrade instead of stalling', async () => {
    const big = 'x'.repeat(300_000)
    const input: ContextInput = {
      ...baseInput,
      tabs: [
        { id: 1, title: 'a', url: 'https://a', text: big },
        { id: 2, title: 'b', url: 'https://b', text: big },
      ],
      docs: [],
    }
    const result = await prepareContext(input)
    // Two 300k sources exceed 500k, so each is truncated to ~250k before embedding.
    expect(input.tabs[0].text.length).toBeLessThanOrEqual(250_000)
    expect(input.tabs[1].text.length).toBeLessThanOrEqual(250_000)
    expect(result.truncated).toBe(true)
  })

  it('reports not truncated when the aggregate cap is not hit', async () => {
    const result = await prepareContext(baseInput)
    expect(result.truncated).toBe(false)
  })
})
