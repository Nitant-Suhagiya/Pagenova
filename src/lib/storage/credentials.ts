export const CREDENTIAL_KEYS = ['openaiApiKey', 'anthropicApiKey', 'geminiApiKey', 'otherApiKey', 'tavilyApiKey'] as const

export type Credentials = Record<(typeof CREDENTIAL_KEYS)[number], string>

export async function getCredentials(): Promise<Credentials> {
  const [local, session] = await Promise.all([
    chrome.storage.local.get([...CREDENTIAL_KEYS]),
    chrome.storage.session.get([...CREDENTIAL_KEYS]),
  ])
  const credentials = Object.fromEntries(CREDENTIAL_KEYS.map((key) => [
    key,
    Object.hasOwn(session, key) ? String(session[key] ?? '') : String(local[key] ?? ''),
  ])) as Credentials

  if (CREDENTIAL_KEYS.some((key) => local[key])) {
    await chrome.storage.session.set(credentials)
    await chrome.storage.local.remove([...CREDENTIAL_KEYS])
  }
  return credentials
}

export async function saveCredentials(credentials: Credentials) {
  await chrome.storage.session.set(credentials)
  await chrome.storage.local.remove([...CREDENTIAL_KEYS])
}
