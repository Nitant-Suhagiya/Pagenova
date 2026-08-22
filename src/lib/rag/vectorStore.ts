import { openDB } from 'idb'
import type { Chunk, RetrievedChunk } from './types'

const dbPromise = openDB('pagenova-rag', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('chunks')) {
      const store = db.createObjectStore('chunks', { keyPath: 'id' })
      store.createIndex('sourceId', 'sourceId')
    }
    if (!db.objectStoreNames.contains('tabMeta')) {
      db.createObjectStore('tabMeta', { keyPath: 'tabId' })
    }
  },
})

export async function putChunks(chunks: Chunk[]): Promise<void> {
  const db = await dbPromise
  const tx = db.transaction('chunks', 'readwrite')
  for (const chunk of chunks) tx.store.put(chunk)
  await tx.done
}

export async function getChunksBySource(sourceId: string): Promise<Chunk[]> {
  const db = await dbPromise
  return db.getAllFromIndex('chunks', 'sourceId', sourceId)
}

export async function deleteChunksBySource(sourceId: string): Promise<void> {
  const db = await dbPromise
  const keys = await db.getAllKeysFromIndex('chunks', 'sourceId', sourceId)
  const tx = db.transaction('chunks', 'readwrite')
  for (const key of keys) tx.store.delete(key)
  await tx.done
}

export async function clearAllChunks(): Promise<void> {
  const db = await dbPromise
  await db.clear('chunks')
  await db.clear('tabMeta')
}

export async function getTabMeta(tabId: number): Promise<{ tabId: number; url: string } | undefined> {
  const db = await dbPromise
  return db.get('tabMeta', tabId)
}

export async function setTabMeta(tabId: number, url: string): Promise<void> {
  const db = await dbPromise
  await db.put('tabMeta', { tabId, url })
}

export function cosineSim(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

export function topK(queryEmbedding: Float32Array, chunks: Chunk[], k = 6): RetrievedChunk[] {
  const matching = chunks.filter((chunk) => chunk.embedding.length === queryEmbedding.length)
  if (matching.length !== chunks.length) {
    console.warn(`Skipped ${chunks.length - matching.length} chunks with mismatched embedding dimensions — re-index your content after switching embedding backend.`)
  }
  return matching
    .map((chunk) => ({ chunk, score: cosineSim(queryEmbedding, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}
