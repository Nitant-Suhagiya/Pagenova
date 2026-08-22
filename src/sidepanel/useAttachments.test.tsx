import { afterEach, describe, expect, it, vi } from 'vitest'

import { requestScreenshotAccess } from './useAttachments'

describe('requestScreenshotAccess', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('asks for optional all-sites access when Screenshot is first used', async () => {
    const contains = vi.fn(async () => false)
    const request = vi.fn(async () => true)
    vi.stubGlobal('chrome', { permissions: { contains, request } })

    await expect(requestScreenshotAccess()).resolves.toBe(true)
    expect(request).toHaveBeenCalledWith({ origins: ['<all_urls>'] })
  })

  it('does not prompt again after access is granted', async () => {
    const contains = vi.fn(async () => true)
    const request = vi.fn()
    vi.stubGlobal('chrome', { permissions: { contains, request } })

    await expect(requestScreenshotAccess()).resolves.toBe(true)
    expect(request).not.toHaveBeenCalled()
  })
})
