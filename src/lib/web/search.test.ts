import { afterEach, describe, expect, it, vi } from 'vitest'

import { searchWeb, shouldRunWebSearch } from './search'

afterEach(() => vi.unstubAllGlobals())

describe('web search', () => {
  it('runs for Ollama when the user turns it on', () => {
    expect(shouldRunWebSearch('ollama', true)).toBe(true)
  })

  it('runs for every provider when enabled', () => {
    for (const provider of ['openai', 'anthropic', 'gemini', 'other', 'ollama']) {
      expect(shouldRunWebSearch(provider, true), provider).toBe(true)
    }
  })

  it('never runs web search when disabled', () => {
    expect(shouldRunWebSearch('openai', false)).toBe(false)
    expect(shouldRunWebSearch('ollama', false)).toBe(false)
  })

  it('reads regular DuckDuckGo results', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`
      <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.torontomu.ca%2F&amp;rut=x">Toronto Metropolitan University Home</a>
      <a class="result__snippet" href="#">Toronto Metropolitan University is in Toronto.</a>
    `)))

    await expect(searchWeb('TMU university')).resolves.toEqual([{
      title: 'Toronto Metropolitan University Home',
      url: 'https://www.torontomu.ca/',
      snippet: 'Toronto Metropolitan University is in Toronto.',
    }])
  })
})
