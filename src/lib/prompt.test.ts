import { describe, expect, it } from 'vitest'

import { buildSessionHeader, getExactReply, resolveSystemPrompt, DEFAULT_SYSTEM_PROMPT, TRIMMED_SYSTEM_PROMPT } from './prompt'

describe('buildSessionHeader', () => {
  it('labels full mode and counts selected sources, web search, and date', () => {
    const header = buildSessionHeader({
      mode: 'full',
      sources: ['Stripe API reference', 'spec.pdf'],
      hasImages: false,
      visionSupported: false,
      webSearch: false,
      date: '2026-08-20',
    })
    expect(header).toContain('Mode: FULL CONTEXT (complete)')
    expect(header).toContain('Sources selected: 2')
    expect(header).toContain('Web search: off')
    expect(header).toContain('Date: 2026-08-20')
    expect(header).not.toContain('Vision:')
  })

  it('labels retrieval mode and includes vision line only when images are attached', () => {
    const header = buildSessionHeader({
      mode: 'retrieval',
      sources: ['billing.ts'],
      hasImages: true,
      visionSupported: false,
      webSearch: true,
      date: '2026-08-20',
    })
    expect(header).toContain('Mode: RETRIEVED EXCERPTS (partial)')
    expect(header).toContain('Vision: unsupported by the selected model')
    expect(header).toContain('Web search: on')
  })

  it('marks full mode as truncated when the aggregate cap dropped content', () => {
    const header = buildSessionHeader({
      mode: 'full',
      sources: ['a', 'b'],
      hasImages: false,
      visionSupported: false,
      webSearch: false,
      truncated: true,
      date: '2026-08-20',
    })
    expect(header).toContain('Mode: FULL CONTEXT (truncated - some content omitted)')
  })
})

describe('resolveSystemPrompt', () => {
  it('extracts exact-reply requests', () => {
    expect(getExactReply('Reply exactly: Pagenova provider smoke test.')).toBe('Pagenova provider smoke test.')
    expect(getExactReply('Summarize this page.')).toBeNull()
  })

  it('uses the full prompt for cloud providers by default', () => {
    expect(resolveSystemPrompt('openai', undefined)).toBe(DEFAULT_SYSTEM_PROMPT)
  })

  it('uses a trimmed prompt for ollama by default', () => {
    expect(resolveSystemPrompt('ollama', undefined)).toBe(TRIMMED_SYSTEM_PROMPT)
  })

  it('keeps a user-customized prompt verbatim for all providers', () => {
    const custom = 'Be terse.'
    expect(resolveSystemPrompt('ollama', custom)).toBe(custom)
    expect(resolveSystemPrompt('openai', custom)).toBe(custom)
  })

  it('treats the legacy placeholder as unset and migrates to the full prompt', () => {
    expect(resolveSystemPrompt('openai', 'You are a concise, helpful browser assistant.')).toBe(DEFAULT_SYSTEM_PROMPT)
    expect(resolveSystemPrompt('ollama', 'You are a concise, helpful browser assistant.')).toBe(TRIMMED_SYSTEM_PROMPT)
  })

  it('migrates the previous built-in Ollama prompt without replacing custom prompts', () => {
    const previousBuiltIn = "You are Pagenova, a browser-native AI assistant. Answer the user's question using the supplied context (page text, document excerpts, images, or web search results).\n\n## Core behavior"
    expect(resolveSystemPrompt('ollama', previousBuiltIn)).toBe(TRIMMED_SYSTEM_PROMPT)
    expect(resolveSystemPrompt('openai', previousBuiltIn)).toBe(DEFAULT_SYSTEM_PROMPT)
    expect(resolveSystemPrompt('ollama', 'You are Pagenova. Be concise.')).toBe('You are Pagenova. Be concise.')
  })
})
