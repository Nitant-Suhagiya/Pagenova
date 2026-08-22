import { describe, expect, it, vi } from 'vitest'

import { cosineSim, topK } from './vectorStore'
import type { Chunk } from './types'

const v = (n: number[]) => Float32Array.from(n)

describe('cosineSim', () => {
  it('returns ~1 for identical vectors', () => {
    expect(cosineSim(v([1, 2, 3]), v([1, 2, 3]))).toBeCloseTo(1, 5)
  })

  it('returns ~0 for orthogonal vectors', () => {
    expect(cosineSim(v([1, 0, 0]), v([0, 1, 0]))).toBeCloseTo(0, 5)
  })

  it('returns 0 on dimension mismatch instead of a corrupt score', () => {
    expect(cosineSim(v([1, 2, 3]), v([1, 2, 3, 4]))).toBe(0)
  })
})

describe('topK', () => {
  it('returns the k most similar chunks in descending score order', () => {
    const query = v([1, 0, 0])
    const chunks: Chunk[] = [
      { id: 'a', sourceId: 's', title: 'a', text: 'a', embedding: v([0.9, 0.1, 0]) },
      { id: 'b', sourceId: 's', title: 'b', text: 'b', embedding: v([0.1, 0.9, 0]) },
      { id: 'c', sourceId: 's', title: 'c', text: 'c', embedding: v([0.5, 0, 0.9]) },
    ]

    const top = topK(query, chunks, 2)
    expect(top.map((r) => r.chunk.id)).toEqual(['a', 'c'])
    expect(top[0].score).toBeGreaterThanOrEqual(top[1].score)
  })

  it('skips chunks with mismatched embedding dimensions and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const query = v([1, 0, 0])
    const chunks: Chunk[] = [
      { id: 'a', sourceId: 's', title: 'a', text: 'a', embedding: v([0.9, 0.1, 0]) },
      { id: 'b', sourceId: 's', title: 'b', text: 'b', embedding: v([0.1, 0.9, 0, 0]) },
    ]

    const top = topK(query, chunks, 2)
    expect(top).toHaveLength(1)
    expect(top[0].chunk.id).toBe('a')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('mismatched'))
    warn.mockRestore()
  })
})
