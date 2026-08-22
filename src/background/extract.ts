export interface TabText {
  title: string
  url: string
  text: string
}

export interface PageImageInfo {
  src: string
  alt: string
  width: number
  height: number
  isProminent: boolean
}

// Self-contained functions injected on demand via chrome.scripting.executeScript.
// They must not close over anything: `func` is serialized into the page's
// isolated world, so only browser globals (document, window) are available.
// This replaces the old manifest content script, so the extension no longer
// injects into every page it visits — it only touches a page when the user
// explicitly asks for its text or images.

const EXTRACT_TEXT = () => {
  const title = document.title || document.querySelector('h1')?.textContent || 'Untitled page'
  const clone = document.body.cloneNode(true) as HTMLElement
  clone.querySelectorAll('script, style, noscript, nav, footer, aside, iframe, svg').forEach((node) => node.remove())
  // ponytail: 250k chars (~60k tokens) exceeds every supported model window, so
  // retrieval actually engages for a single long page. Kept as a cap to bound
  // pathological auto-generated DOMs; raise only if real pages hit it.
  const text = (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 250000)
  return { title, url: window.location.href, text }
}

const EXTRACT_IMAGES = () => {
  const candidates: Array<{ src: string; alt: string; width: number; height: number; isProminent: boolean }> = []
  const elements = Array.from(document.querySelectorAll('img, canvas'))
  elements.forEach((element) => {
    const rect = element.getBoundingClientRect()
    if (element instanceof HTMLImageElement) {
      const src = element.currentSrc || element.src
      if (!src || src.startsWith('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP')) return
      const width = element.naturalWidth || rect.width || 0
      const height = element.naturalHeight || rect.height || 0
      const score = Math.min(width * height, 1600000)
      candidates.push({ src, alt: element.alt || '', width, height, isProminent: score > 25000 })
    }
    if (element instanceof HTMLCanvasElement) {
      const width = element.width || rect.width || 0
      const height = element.height || rect.height || 0
      candidates.push({ src: element.toDataURL('image/png'), alt: 'Canvas capture', width, height, isProminent: width * height > 25000 })
    }
  })
  return candidates
    .filter((candidate) => candidate.width >= 50 && candidate.height >= 50)
    .sort((a, b) => b.width * b.height - a.width * a.height)
    .slice(0, 9)
}

// ponytail: 12k chars keeps an accidental whole-page highlight from crowding
// the prompt; raise it only if real selection workflows need more.
const EXTRACT_SELECTION = () => window.getSelection()?.toString().replace(/\s+/g, ' ').trim().slice(0, 12_000) ?? ''

export async function extractTabText(tabId: number): Promise<TabText | null> {
  let injected: chrome.scripting.InjectionResult<TabText>[]
  try {
    injected = await chrome.scripting.executeScript({ target: { tabId }, func: EXTRACT_TEXT })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'The browser did not return page text.'
    throw new Error(`Pagenova could not read the selected tab: ${detail}`)
  }
  const result = injected?.[0]?.result as TabText | undefined
  if (!result || typeof result.text !== 'string') {
    throw new Error('Pagenova could not read the selected tab: The browser returned no page text.')
  }
  return result
}

export async function extractPageImageInfos(tabId: number): Promise<PageImageInfo[]> {
  const injected = await chrome.scripting.executeScript({
    target: { tabId },
    func: EXTRACT_IMAGES,
  }).catch(() => null)
  const result = injected?.[0]?.result as PageImageInfo[] | undefined
  return Array.isArray(result) ? result : []
}

export async function extractActiveSelection(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (!tab?.id || !/^https?:/i.test(tab.url ?? '')) return ''
  const injected = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: EXTRACT_SELECTION }).catch(() => null)
  const text = injected?.[0]?.result
  return typeof text === 'string' ? text : ''
}
