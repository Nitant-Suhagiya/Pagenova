import { openDB } from 'idb'

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
  images?: string[]
  sources?: string[]
  mode?: 'full' | 'retrieval'
}

export interface HistorySession {
  id?: number
  conversationId: string
  title: string
  provider: string
  model: string
  messages: HistoryMessage[]
  updatedAt: number
}

const dbPromise = openDB('pagenova-history', 2, {
  upgrade(db, _oldVersion, _newVersion, transaction) {
    const store = db.objectStoreNames.contains('sessions')
      ? transaction.objectStore('sessions')
      : db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true })
    if (!store.indexNames.contains('conversationId')) {
      store.createIndex('conversationId', 'conversationId')
    }
  },
})

export async function saveSession(session: HistorySession) {
  const db = await dbPromise
  const existing = await db.getFromIndex('sessions', 'conversationId', session.conversationId)
  if (existing) session.id = existing.id
  return db.put('sessions', session)
}

export async function clearAllSessions(): Promise<void> {
  const db = await dbPromise
  await db.clear('sessions')
}

export async function listSessions(): Promise<HistorySession[]> {
  try {
    const db = await dbPromise
    const all = await db.getAll('sessions')
    return all.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    // Corrupted/unavailable IndexedDB should not crash the history panel.
    return []
  }
}

export async function deleteSession(id: number): Promise<void> {
  try {
    const db = await dbPromise
    await db.delete('sessions', id)
  } catch {
    // Ignore a missing/corrupted store — the session is already gone.
  }
}
