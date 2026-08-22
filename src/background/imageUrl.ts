export const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_DATA_URL_CHARS = Math.ceil(MAX_REMOTE_IMAGE_BYTES * 4 / 3) + 1024

export function isPrivateHost(hostname: string): boolean {
  // URL.hostname wraps IPv6 literals in brackets, e.g. "[::1]" — strip them so
  // the IPv6 checks below actually match.
  const host = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '0.0.0.0' || host === '::') return true
  if (host.includes(':')) {
    if (host === '::1') return true
    if (host.startsWith('fe80:')) return true
    if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true
    if (host.startsWith('::ffff:')) return isPrivateHost(host.slice(7))
    return false
  }
  const octets = host.split('.').map(Number)
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = octets
  if (a === 127 || a === 10 || a >= 224) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 192 && (b === 0 || b === 168)) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  return false
}

function isSafeImageDataUrl(url: string): boolean {
  return url.length <= MAX_DATA_URL_CHARS && /^data:image\/[\w.+-]+(?:;[^,]*)?,/i.test(url)
}

function parsePublicImageUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' || url.username || url.password || isPrivateHost(url.hostname)) return null
    return url
  } catch {
    return null
  }
}

async function fetchPublicImage(rawUrl: string): Promise<Blob | null> {
  let url = parsePublicImageUrl(rawUrl)
  for (let redirects = 0; url && redirects <= 3; redirects++) {
    const response = await fetch(url, { credentials: 'omit', redirect: 'manual', referrerPolicy: 'no-referrer' })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      url = location ? parsePublicImageUrl(new URL(location, url).href) : null
      continue
    }
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('image/')) return null
    const length = Number(response.headers.get('content-length'))
    if (Number.isFinite(length) && length > MAX_REMOTE_IMAGE_BYTES) return null

    const reader = response.body?.getReader()
    if (!reader) return null
    const chunks: ArrayBuffer[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_REMOTE_IMAGE_BYTES) {
        await reader.cancel().catch(() => undefined)
        return null
      }
      const copy = new Uint8Array(value.byteLength)
      copy.set(value)
      chunks.push(copy.buffer)
    }
    return new Blob(chunks, { type: response.headers.get('content-type') ?? '' })
  }
  return null
}

export async function imageUrlToDataUrl(url: string): Promise<string | null> {
  try {
    if (url.startsWith('data:')) return isSafeImageDataUrl(url) ? url : null
    const blob = await fetchPublicImage(url)
    if (!blob) return null
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
