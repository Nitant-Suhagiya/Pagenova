export interface WebResult {
  title: string
  url: string
  snippet: string
}

export type WebSearchProvider = 'duckduckgo' | 'tavily'

export interface WebSearchOptions {
  provider?: WebSearchProvider
  apiKey?: string
}

// Tavily — full LLM-optimized web search (title/url/content + extracted answer).
async function searchTavily(query: string, apiKey: string): Promise<WebResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: 6,
      include_answer: true,
    }),
  })
  if (!res.ok) throw new Error(`Tavily search failed (${res.status})`)
  const data = (await res.json()) as {
    answer?: string
    results?: Array<{ title?: string; url?: string; content?: string }>
  }
  const results: WebResult[] = []
  if (data.answer) results.push({ title: 'Answer', url: '', snippet: data.answer })
  for (const r of data.results ?? []) {
    if (r.title && r.url) results.push({ title: r.title, url: r.url, snippet: r.content ?? '' })
  }
  return results
}

function htmlText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|quot|#(?:x27|39)|lt|gt|nbsp);/gi, (_match, entity: string) => ({ amp: '&', quot: '"', '#x27': "'", '#39': "'", lt: '<', gt: '>', nbsp: ' ' })[entity.toLowerCase()] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function duckDuckGoResultUrl(href: string): string {
  const encoded = /(?:\?|&)uddg=([^&]+)/.exec(href.replaceAll('&amp;', '&'))?.[1]
  try {
    return encoded ? decodeURIComponent(encoded) : ''
  } catch {
    return ''
  }
}

// The instant-answer API often returns no result for ordinary searches. The
// HTML endpoint gives the same keyless DuckDuckGo result pages users expect.
async function searchDuckDuckGo(query: string): Promise<WebResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Web search failed (${res.status})`)
  const html = await res.text()
  const links = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
  const snippets = [...html.matchAll(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g)]
  return links.slice(0, 6).flatMap((link, index) => {
    const url = duckDuckGoResultUrl(link[1])
    const title = htmlText(link[2])
    return url && title ? [{ title, url, snippet: htmlText(snippets[index]?.[1] ?? '') }] : []
  })
}

export async function searchWeb(query: string, opts: WebSearchOptions = {}): Promise<WebResult[]> {
  if (opts.provider === 'tavily' && opts.apiKey) return searchTavily(query, opts.apiKey)
  // Fall back to keyless DuckDuckGo results when no Tavily key is configured.
  return searchDuckDuckGo(query)
}

export function shouldRunWebSearch(_providerId: string, webSearch: boolean): boolean {
  return webSearch
}
