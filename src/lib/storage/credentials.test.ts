import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getCredentials, saveCredentials } from './credentials'

const blank = { openaiApiKey: '', anthropicApiKey: '', geminiApiKey: '', otherApiKey: '', tavilyApiKey: '' }

describe('session credentials', () => {
  const local = { get: vi.fn(), remove: vi.fn() }
  const session = { get: vi.fn(), set: vi.fn() }

  beforeEach(() => {
    local.get.mockReset()
    local.remove.mockReset()
    session.get.mockReset()
    session.set.mockReset()
    local.remove.mockResolvedValue(undefined)
    session.set.mockResolvedValue(undefined)
    vi.stubGlobal('chrome', { storage: { local, session } })
  })

  it('moves legacy local keys into session storage and removes the plaintext copy', async () => {
    local.get.mockResolvedValue({ openaiApiKey: 'legacy-key' })
    session.get.mockResolvedValue({})

    await expect(getCredentials()).resolves.toEqual({ ...blank, openaiApiKey: 'legacy-key' })
    expect(session.set).toHaveBeenCalledWith({ ...blank, openaiApiKey: 'legacy-key' })
    expect(local.remove).toHaveBeenCalledWith(['openaiApiKey', 'anthropicApiKey', 'geminiApiKey', 'otherApiKey', 'tavilyApiKey'])
  })

  it('keeps an active-session key over a legacy value', async () => {
    local.get.mockResolvedValue({ openaiApiKey: 'old-key' })
    session.get.mockResolvedValue({ openaiApiKey: 'current-key' })

    await expect(getCredentials()).resolves.toEqual({ ...blank, openaiApiKey: 'current-key' })
  })

  it('writes keys to session storage and removes any legacy local copy', async () => {
    await saveCredentials({ ...blank, geminiApiKey: 'session-key' })

    expect(session.set).toHaveBeenCalledWith({ ...blank, geminiApiKey: 'session-key' })
    expect(local.remove).toHaveBeenCalledWith(['openaiApiKey', 'anthropicApiKey', 'geminiApiKey', 'otherApiKey', 'tavilyApiKey'])
  })
})
