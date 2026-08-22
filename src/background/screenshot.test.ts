import { beforeEach, describe, expect, it, vi } from 'vitest'
import { captureVisibleScreenshot, screenshotFailureMessage } from './screenshot'

describe('screenshotFailureMessage', () => {
  it('replaces Chrome permission internals with a usable recovery step', () => {
    expect(screenshotFailureMessage("Either the '<all_urls>' or 'activeTab' permission is required.")).toContain('allow screenshot access')
  })

  it('keeps unrelated capture errors intact', () => {
    expect(screenshotFailureMessage('Empty screenshot')).toBe('Empty screenshot')
  })
})

describe('captureVisibleScreenshot', () => {
  const query = vi.fn()
  const get = vi.fn()
  const update = vi.fn()
  const captureVisibleTab = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
    ;(globalThis as { chrome: unknown }).chrome = {
      tabs: { query, get, update, captureVisibleTab },
      runtime: {},
    }
  })

  it('captures a selected webpage even when Pagenova is focused in another window', async () => {
    query.mockImplementation((details: chrome.tabs.QueryInfo) => {
      if (details.lastFocusedWindow) return Promise.resolve([{ id: 1, windowId: 10, url: 'chrome-extension://id/sidepanel.html' }])
      return Promise.resolve([{ id: 7, windowId: 20, url: 'https://github.com/Nitant-Suhagiya' }])
    })
    get.mockResolvedValue({ id: 8, windowId: 20, url: 'https://github.com/Nitant-Suhagiya' })
    update.mockResolvedValue(undefined)
    captureVisibleTab.mockImplementation((_windowId: number, _options: unknown, callback: (dataUrl?: string) => void) => callback('data:image/png;base64,test'))

    await expect(captureVisibleScreenshot(8)).resolves.toEqual({ ok: true, dataUrl: 'data:image/png;base64,test' })
    expect(captureVisibleTab).toHaveBeenCalledWith(20, { format: 'png' }, expect.any(Function))
    expect(update).toHaveBeenNthCalledWith(1, 8, { active: true })
    expect(update).toHaveBeenNthCalledWith(2, 7, { active: true })
  })

  it('captures the current webpage when no source tab is selected', async () => {
    query.mockResolvedValue([{ id: 7, windowId: 20, url: 'https://github.com/Nitant-Suhagiya' }])
    captureVisibleTab.mockImplementation((_windowId: number, _options: unknown, callback: (dataUrl?: string) => void) => callback('data:image/png;base64,test'))

    await expect(captureVisibleScreenshot()).resolves.toEqual({ ok: true, dataUrl: 'data:image/png;base64,test' })
    expect(captureVisibleTab).toHaveBeenCalledWith(20, { format: 'png' }, expect.any(Function))
    expect(update).not.toHaveBeenCalled()
  })
})
