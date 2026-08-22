import { describe, expect, it, vi } from 'vitest'

import { imageUrlToDataUrl, isPrivateHost } from './imageUrl'

describe('isPrivateHost', () => {
  it('blocks loopback, private, link-local, and IPv6 ranges', () => {
    const blocked = [
      'localhost',
      'sub.localhost',
      '127.0.0.1',
      '10.0.0.5',
      '192.168.1.1',
      '172.16.0.1',
      '172.31.255.255',
      '169.254.169.254',
      '100.64.0.1',
      '192.0.0.1',
      '198.18.0.1',
      '224.0.0.1',
      '0.0.0.0',
      '[::1]',
      '[::]',
      '[fe80::1]',
      '[fc00::1]',
      '[fd12::1]',
    ]
    for (const host of blocked) {
      expect(isPrivateHost(host), host).toBe(true)
    }
  })

  it('allows public hosts', () => {
    const allowed = ['example.com', 'api.openai.com', '8.8.8.8', '172.15.0.1', '172.32.0.1']
    for (const host of allowed) {
      expect(isPrivateHost(host), host).toBe(false)
    }
  })
})

describe('imageUrlToDataUrl SSRF validation', () => {
  it('passes bounded image data URLs through unchanged', async () => {
    await expect(imageUrlToDataUrl('data:image/png;base64,AAAA')).resolves.toBe('data:image/png;base64,AAAA')
    await expect(imageUrlToDataUrl('data:text/html,hello')).resolves.toBeNull()
  })

  it('rejects non-http(s) schemes', async () => {
    await expect(imageUrlToDataUrl('file:///etc/passwd')).resolves.toBeNull()
    await expect(imageUrlToDataUrl('ftp://example.com/x.png')).resolves.toBeNull()
  })

  it('rejects private/loopback URLs without ever fetching', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    for (const url of [
      'http://localhost/admin',
      'http://127.0.0.1/admin',
      'http://192.168.1.1/admin',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/admin',
      'http://[fe80::1]/admin',
    ]) {
      await expect(imageUrlToDataUrl(url), url).resolves.toBeNull()
    }
    expect(fetchSpy).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })

  it('fetches and encodes a public HTTPS image', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['x'], { type: 'image/png' }), {
      headers: { 'content-type': 'image/png', 'content-length': '1' },
    })))
    vi.stubGlobal('FileReader', class {
      result: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsDataURL() {
        this.result = 'data:image/png;base64,eA=='
        this.onload?.()
      }
    } as unknown as typeof FileReader)

    await expect(imageUrlToDataUrl('https://example.com/image.png')).resolves.toBe('data:image/png;base64,eA==')

    vi.unstubAllGlobals()
  })

  it('rejects HTTP, non-images, oversized responses, and redirects to private hosts', async () => {
    await expect(imageUrlToDataUrl('http://example.com/image.png')).resolves.toBeNull()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('not an image', {
      headers: { 'content-type': 'text/html' },
    })).mockResolvedValueOnce(new Response(null, {
      headers: { location: 'https://127.0.0.1/admin' }, status: 302,
    })))

    await expect(imageUrlToDataUrl('https://example.com/page')).resolves.toBeNull()
    await expect(imageUrlToDataUrl('https://example.com/redirect')).resolves.toBeNull()
    vi.unstubAllGlobals()
  })

  it('rejects an oversized image before reading its body', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, {
      headers: { 'content-type': 'image/png', 'content-length': String(10 * 1024 * 1024 + 1) },
    }))
    vi.stubGlobal('fetch', fetchSpy)

    await expect(imageUrlToDataUrl('https://example.com/large.png')).resolves.toBeNull()
    expect(fetchSpy).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })
})
