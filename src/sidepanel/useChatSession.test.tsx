import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useChatSession } from './useChatSession'
import type { HistorySession } from '../lib/storage/history'

type Listener = (m: unknown) => void

function makePort() {
  let listeners: Listener[] = []
  let disconnectListeners: Array<() => void> = []
  const port = {
    onMessage: { addListener: (l: Listener) => { listeners.push(l) } },
    onDisconnect: { addListener: (l: () => void) => { disconnectListeners.push(l) } },
    postMessage: vi.fn(),
    disconnect: vi.fn(() => { listeners = []; disconnectListeners.forEach((l) => l()) }),
  }
  const emit = (m: unknown) => { listeners.forEach((l) => l(m)) }
  const emitDisconnect = () => { listeners = []; disconnectListeners.forEach((l) => l()) }
  return { port, emit, emitDisconnect }
}

function installChrome(port: ReturnType<typeof makePort>['port'], tabs: Array<{ id?: number }> = []) {
  const query = vi.fn(async () => tabs)
  vi.stubGlobal('chrome', {
    storage: {
      local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
      session: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
    },
    tabs: { query },
    runtime: {
      connect: vi.fn(() => port),
      sendMessage: vi.fn(async () => ({})),
    },
  })
  // Satisfy OllamaProvider.listModels so the hook sets a model, which sendMessage
  // requires. The fetch mock is intentionally permissive: only /api/tags matters.
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ models: [{ name: 'llama3.1' }] }),
  })))
  return query
}

const send = (result: { current: ReturnType<typeof useChatSession> }) =>
  result.current.sendMessage({ images: [], docs: [], clearAttachments: vi.fn() })

describe('useChatSession streaming races', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('drops late chunks after starting a new chat mid-stream', async () => {
    const { port, emit } = makePort()
    installChrome(port)
    const { result } = renderHook(() => useChatSession())
    await waitFor(() => expect(result.current.model).toBe('llama3.1'))

    await act(async () => { result.current.setInput('hello') })
    await act(async () => { await send(result) })
    expect(result.current.isStreaming).toBe(true)

    await act(async () => { emit({ type: 'CHAT_CHUNK', delta: 'hi' }) })
    expect(result.current.messages).toHaveLength(2) // user + assistant

    act(() => { result.current.newChat() })
    expect(result.current.messages).toHaveLength(0)
    expect(result.current.isStreaming).toBe(false)
    expect(port.disconnect).toHaveBeenCalled()

    // The old port is disconnected, so its late chunk must not resurrect a message.
    await act(async () => { emit({ type: 'CHAT_CHUNK', delta: 'phantom' }); emit({ type: 'CHAT_DONE' }) })
    expect(result.current.messages).toHaveLength(0)
  })

  it('does not select the active tab until the user opts in', async () => {
    const { port } = makePort()
    const query = installChrome(port, [{ id: 99 }])
    const { result } = renderHook(() => useChatSession())

    await waitFor(() => expect(result.current.model).toBe('llama3.1'))

    expect(query).not.toHaveBeenCalled()
    expect(result.current.selectedTabIds).toEqual([])
  })

  it('stops mid-stream and ignores late chunks', async () => {
    const { port, emit } = makePort()
    installChrome(port)
    const { result } = renderHook(() => useChatSession())
    await waitFor(() => expect(result.current.model).toBe('llama3.1'))

    await act(async () => { result.current.setInput('hello') })
    await act(async () => { await send(result) })
    await act(async () => { emit({ type: 'CHAT_CHUNK', delta: 'hi' }) })
    expect(result.current.messages).toHaveLength(2)

    act(() => { result.current.stopGeneration() })
    expect(result.current.isStreaming).toBe(false)
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'STOP_GENERATION' })
    expect(port.disconnect).toHaveBeenCalled()

    const before = result.current.messages.length
    await act(async () => { emit({ type: 'CHAT_CHUNK', delta: 'more' }) })
    expect(result.current.messages).toHaveLength(before)
  })

  it('does not post a stop message after Chrome disconnects the port', async () => {
    const { port, emitDisconnect } = makePort()
    installChrome(port)
    const { result } = renderHook(() => useChatSession())
    await waitFor(() => expect(result.current.model).toBe('llama3.1'))

    await act(async () => { result.current.setInput('hello') })
    await act(async () => { await send(result) })
    emitDisconnect()
    act(() => { result.current.stopGeneration() })

    expect(port.postMessage).toHaveBeenCalledTimes(1)
    expect(result.current.isStreaming).toBe(false)
  })

  it('forwards the most recent prior image with a follow-up request', async () => {
    const { port, emit } = makePort()
    installChrome(port)
    const { result } = renderHook(() => useChatSession())
    await waitFor(() => expect(result.current.model).toBe('llama3.1'))

    await act(async () => { result.current.setInput('describe this') })
    await act(async () => { await result.current.sendMessage({ images: [{ name: 'image.png', dataUrl: 'data:image/png;base64,image-data' }], docs: [], clearAttachments: vi.fn() }) })
    await act(async () => { emit({ type: 'CHAT_DONE' }) })
    await act(async () => { result.current.setInput('what is in the image?') })
    await act(async () => { await send(result) })

    expect(port.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      history: expect.arrayContaining([expect.objectContaining({ images: [{ base64: 'image-data', mimeType: 'image/png' }] })]),
    }))
  })

  it('keeps attached documents as context for a follow-up', async () => {
    const { port, emit } = makePort()
    installChrome(port)
    const { result } = renderHook(() => useChatSession())
    await waitFor(() => expect(result.current.model).toBe('llama3.1'))

    await act(async () => { result.current.setInput('Whose resume is this?') })
    await act(async () => {
      await result.current.sendMessage({
        images: [],
        docs: [{ name: 'resume.txt', text: 'Nitant studies at TMU.' }],
        clearAttachments: vi.fn(),
      })
    })
    await act(async () => { emit({ type: 'CHAT_DONE' }) })
    await act(async () => { result.current.setInput('Where is he studying?') })
    await act(async () => { await send(result) })

    expect(port.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      docs: [{ name: 'resume.txt', text: 'Nitant studies at TMU.' }],
    }))
  })

  it('clears transient state and tears down the stream when reopening history', async () => {
    const { port } = makePort()
    installChrome(port)
    const { result } = renderHook(() => useChatSession())
    await waitFor(() => expect(result.current.model).toBe('llama3.1'))

    // Drive the hook into a streaming + error state first.
    await act(async () => { result.current.setInput('hello') })
    await act(async () => { await send(result) })
    act(() => { result.current.setError('boom') })
    expect(result.current.isStreaming).toBe(true)

    const session: HistorySession = {
      id: 1,
      conversationId: 'conv-1',
      title: 'older chat',
      provider: 'ollama',
      model: 'llama3.1',
      messages: [{ role: 'user', content: 'old question' }],
      updatedAt: Date.now(),
    }

    act(() => { result.current.loadHistorySession(session) })

    expect(result.current.messages).toEqual(session.messages)
    expect(result.current.historyOpen).toBe(false)
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.isIndexing).toBe(false)
    expect(result.current.error).toBe('')
    expect(result.current.contextInfo).toBeNull()
    expect(port.disconnect).toHaveBeenCalled()
  })
})
