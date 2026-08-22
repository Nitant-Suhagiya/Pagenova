export async function providerErrorDetail(response: Response): Promise<string> {
  const body = await response.text().catch(() => '')
  try {
    const payload = JSON.parse(body) as { error?: { message?: unknown } | unknown; message?: unknown }
    const error = payload?.error
    const message = typeof error === 'object' && error !== null && 'message' in error
      ? error.message
      : typeof error === 'string' ? error : payload?.message
    return typeof message === 'string' ? `: ${message.replace(/\s+/g, ' ').slice(0, 240)}` : ''
  } catch {
    return ''
  }
}
