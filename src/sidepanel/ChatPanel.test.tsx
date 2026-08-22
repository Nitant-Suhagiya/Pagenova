import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ChatPanel } from './ChatPanel'

function installChromeMock() {
  const port = {
    onMessage: { addListener: vi.fn() },
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onDisconnect: { addListener: vi.fn() },
  }
  const tabsQuery = vi.fn(async () => [])
  vi.stubGlobal('chrome', {
    storage: {
      local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
      session: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
    },
    tabs: {
      query: tabsQuery,
      create: vi.fn(async () => ({})),
      update: vi.fn(async () => ({})),
      get: vi.fn(async () => ({ url: 'https://example.com' })),
    },
    runtime: {
      connect: vi.fn(() => port),
      sendMessage: vi.fn(async () => ({})),
      getURL: vi.fn((p: string) => p),
      openOptionsPage: vi.fn(async () => {}),
    },
    windows: { getCurrent: vi.fn(async () => ({ id: 1 })) },
    sidePanel: { open: vi.fn(async () => {}) },
  })
  return { tabsQuery }
}

describe('ChatPanel', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders the empty state, input, and send controls', () => {
    installChromeMock()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('no network') }))
    Element.prototype.scrollIntoView = vi.fn()

    render(<ChatPanel />)

    expect(screen.getByPlaceholderText('Ask a question…')).toBeTruthy()
    expect(screen.getByText('Ask about the page, a selected passage, or anything on your mind.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Ollama' })).toBeTruthy()
  })

  it('gets consent before reading open-tab details', async () => {
    const { tabsQuery } = installChromeMock()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('no network') }))
    Element.prototype.scrollIntoView = vi.fn()

    render(<ChatPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Add attachments or context' }))

    expect(screen.getByRole('dialog', { name: 'Use page context?' })).toBeTruthy()
    expect(tabsQuery).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Allow page context' }))
    await waitFor(() => expect(tabsQuery).toHaveBeenCalledOnce())
  })
})
