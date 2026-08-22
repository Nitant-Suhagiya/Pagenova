const DEFAULTS = { maxEdge: 1568, quality: 0.8, alwaysCompress: false }

async function getImageSettings() {
  try {
    const s = await chrome.storage.local.get(['imageMaxEdge', 'imageQuality', 'alwaysCompress'])
    return {
      maxEdge: typeof s.imageMaxEdge === 'number' ? s.imageMaxEdge : DEFAULTS.maxEdge,
      quality: typeof s.imageQuality === 'number' ? s.imageQuality : DEFAULTS.quality,
      alwaysCompress: s.alwaysCompress === true,
    }
  } catch {
    return DEFAULTS
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
  })
}

async function toDataUrl(input: File | Blob | string): Promise<string> {
  if (typeof input === 'string') return input
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(input)
  })
}

function scale(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width, height }
  const ratio = maxEdge / longest
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) }
}

// Downscales images over the configured max edge to JPEG at the configured
// quality. Smaller images pass through unchanged unless "always compress" is on.
export async function encodeImage(input: File | Blob | string): Promise<string> {
  const { maxEdge, quality, alwaysCompress } = await getImageSettings()
  const dataUrl = await toDataUrl(input)
  const img = await loadImage(dataUrl)
  const { width, height } = scale(img.naturalWidth, img.naturalHeight, maxEdge)
  const needsResize = width !== img.naturalWidth || height !== img.naturalHeight
  if (!needsResize && !alwaysCompress) return dataUrl

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', quality)
}
