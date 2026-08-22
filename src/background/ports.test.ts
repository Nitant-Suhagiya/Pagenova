import { afterEach, describe, expect, it, vi } from 'vitest'

import { abortAndClearController, registerController, setupChatPortConnection } from './ports'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('abort controller map', () => {
  it('aborts and clears a controller by name', () => {
    const controller = new AbortController()
    const abortSpy = vi.spyOn(controller, 'abort')
    registerController('x', controller)
    abortAndClearController('x')
    abortAndClearController('x')
    expect(abortSpy).toHaveBeenCalledTimes(1)
  })
})

describe('setupChatPortConnection STOP_GENERATION', () => {
  it('aborts the in-flight controller when STOP_GENERATION is received', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const onConnect = vi.fn()
    vi.stubGlobal('chrome', { runtime: { onConnect: { addListener: onConnect } } })

    setupChatPortConnection()
    const connectHandler = onConnect.mock.calls[0][0] as (port: {
      name: string
      onMessage: { addListener: (cb: (m: { type?: string }) => void) => void }
      onDisconnect: { addListener: (cb: () => void) => void }
    }) => void

    let onMessage: ((m: { type?: string }) => void) | undefined
    connectHandler({
      name: 'chat',
      onMessage: { addListener: (cb) => { onMessage = cb } },
      onDisconnect: { addListener: vi.fn() },
    })

    const controller = new AbortController()
    registerController('chat-0.5', controller)
    const abortSpy = vi.spyOn(controller, 'abort')

    onMessage!({ type: 'STOP_GENERATION' })

    expect(abortSpy).toHaveBeenCalledTimes(1)
    abortAndClearController('chat-0.5')
    expect(abortSpy).toHaveBeenCalledTimes(1)
  })

  it('aborts the in-flight controller when the port disconnects', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.75)
    const onConnect = vi.fn()
    vi.stubGlobal('chrome', { runtime: { onConnect: { addListener: onConnect } } })

    setupChatPortConnection()
    const connectHandler = onConnect.mock.calls[0][0] as (port: {
      name: string
      onMessage: { addListener: (cb: (m: { type?: string }) => void) => void }
      onDisconnect: { addListener: (cb: () => void) => void }
    }) => void

    let onDisconnect: (() => void) | undefined
    connectHandler({
      name: 'chat',
      onMessage: { addListener: vi.fn() },
      onDisconnect: { addListener: (cb) => { onDisconnect = cb } },
    })

    const controller = new AbortController()
    registerController('chat-0.75', controller)
    const abortSpy = vi.spyOn(controller, 'abort')

    onDisconnect!()

    expect(abortSpy).toHaveBeenCalledTimes(1)
    abortAndClearController('chat-0.75')
    expect(abortSpy).toHaveBeenCalledTimes(1)
  })
})
