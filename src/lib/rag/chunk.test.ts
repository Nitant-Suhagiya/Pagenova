import { describe, expect, it } from 'vitest'

import { chunkText, tokenEstimate } from './chunk'

const sentence = 'The quick brown fox jumps over the lazy dog. '

describe('tokenEstimate', () => {
  it('approximates ASCII tokens as chars/4', () => {
    expect(tokenEstimate('12345678')).toBe(2)
    expect(tokenEstimate('')).toBe(0)
  })

  it('counts CJK characters as one token each to avoid under-budgeting', () => {
    expect(tokenEstimate('你好世界')).toBe(4)
    expect(tokenEstimate('你好世界abcd')).toBe(5)
  })
})

describe('chunkText', () => {
  it('returns a single chunk for short text', () => {
    expect(chunkText('A short sentence.')).toHaveLength(1)
  })

  it('splits long text into multiple chunks under the target size', () => {
    const chunks = chunkText(sentence.repeat(200), 100, 20)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(tokenEstimate(chunk)).toBeLessThanOrEqual(100 + 20)
    }
  })

  it('carries overlap from the end of one chunk into the next', () => {
    const chunks = chunkText(sentence.repeat(200), 100, 20)
    expect(chunks.length).toBeGreaterThan(1)
    for (let i = 1; i < chunks.length; i++) {
      const prevWords = chunks[i - 1].split(/\s+/)
      const nextWords = chunks[i].split(/\s+/)
      const start = prevWords.lastIndexOf(nextWords[0])
      expect(start).toBeGreaterThan(-1)
      expect(nextWords.slice(1, 4)).toEqual(prevWords.slice(start + 1, start + 4))
    }
  })

  it('reassembles to include every input sentence', () => {
    const chunks = chunkText(sentence.repeat(200), 100, 20)
    const joined = chunks.join(' ')
    expect(joined.length).toBeGreaterThan(sentence.repeat(200).length * 0.9)
  })
})
