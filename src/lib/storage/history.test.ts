import { beforeEach, describe, expect, it } from 'vitest'

import { clearAllSessions, deleteSession, listSessions, saveSession } from './history'
import type { HistoryMessage, HistorySession } from './history'

const msg = (role: 'user' | 'assistant', content: string): HistoryMessage => ({ role, content })

function session(conversationId: string, updatedAt: number, messages: HistoryMessage[]): HistorySession {
  return { conversationId, title: 't', provider: 'ollama', model: 'llama3.1', messages, updatedAt }
}

beforeEach(async () => {
  await clearAllSessions()
})

describe('session storage', () => {
  it('persists a session with its full message history and assigns an id', async () => {
    const id = (await saveSession(session('c1', 1, [msg('user', 'hi'), msg('assistant', 'hello')]))) as number
    expect(id).toBeGreaterThan(0)

    const list = await listSessions()
    expect(list).toHaveLength(1)
    expect(list[0].messages.map((m) => m.content)).toEqual(['hi', 'hello'])
  })

  it('lists sessions newest-first', async () => {
    await saveSession(session('older', 1, [msg('user', 'a')]))
    await saveSession(session('newer', 2, [msg('user', 'b')]))

    const list = await listSessions()
    expect(list.map((s) => s.conversationId)).toEqual(['newer', 'older'])
  })

  it('deletes a session by id', async () => {
    const id = (await saveSession(session('c1', 1, [msg('user', 'a')]))) as number
    await deleteSession(id)

    expect(await listSessions()).toHaveLength(0)
  })
})

describe('chat → save → reload → continue flow', () => {
  it('reloads a conversation and continues it with complete history', async () => {
    const conversationId = 'conv-integration'
    await saveSession(session(conversationId, 1, [msg('user', 'first question'), msg('assistant', 'first answer')]))

    // reload
    const reloaded = (await listSessions()).find((s) => s.conversationId === conversationId)!
    expect(reloaded.messages).toHaveLength(2)

    // continue
    const continued = [
      ...reloaded.messages,
      msg('user', 'second question'),
      msg('assistant', 'second answer'),
    ]
    await saveSession(session(conversationId, 2, continued))

    // one row per conversation — continuing must not fragment into a new session
    const list = await listSessions()
    expect(list).toHaveLength(1)
    expect(list[0].messages).toHaveLength(4)
    expect(list[0].messages[2].content).toBe('second question')
    expect(list[0].messages[3].content).toBe('second answer')
  })
})
