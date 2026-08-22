import { beforeEach, describe, expect, it, vi } from 'vitest'

import { extractActiveSelection, extractTabText } from './extract'

describe('extractTabText', () => {
  const executeScript = vi.fn()
  const query = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
    ;(globalThis as { chrome: unknown }).chrome = { scripting: { executeScript }, tabs: { query } }
  })

  it('surfaces a browser injection failure instead of silently dropping context', async () => {
    executeScript.mockRejectedValue(new Error('Cannot access contents of url "brave://settings".'))

    await expect(extractTabText(1)).rejects.toThrow('Pagenova could not read the selected tab: Cannot access contents of url "brave://settings".')
  })

  it('reads the current webpage selection only when a chat request asks for it', async () => {
    query.mockResolvedValue([{ id: 7, url: 'https://example.com' }])
    executeScript.mockResolvedValue([{ result: 'Selected paragraph' }])

    await expect(extractActiveSelection()).resolves.toBe('Selected paragraph')
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 7 } }))
  })
})
