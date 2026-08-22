import type { EmbeddingBackend } from './types'

let offscreenReady: Promise<void> | null = null

function ensureOffscreenDocument(): Promise<void> {
  if (offscreenReady) return offscreenReady
  offscreenReady = (async () => {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] })
    if (contexts.length > 0) return

    const ready = new Promise<void>((resolve) => {
      const cleanup = () => {
        clearTimeout(timeout)
        chrome.runtime.onMessage.removeListener(listener)
      }
      const timeout = setTimeout(() => { cleanup(); resolve() }, 5000)
      const listener = (msg: { type?: string }) => {
        if (msg?.type === 'OFFSCREEN_READY') { cleanup(); resolve() }
      }
      chrome.runtime.onMessage.addListener(listener)
    })

    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS'],
      justification: 'Run the on-device Transformers.js embedding model for cross-tab and document RAG retrieval.',
    })
    await ready
  })()
  offscreenReady.catch(() => { offscreenReady = null })
  return offscreenReady
}

async function browserEmbed(texts: string[]): Promise<Float32Array[]> {
  const attempt = async () => {
    const res = await chrome.runtime.sendMessage({ type: 'EMBED_TEXTS', texts })
    if (!res || res.error) throw new Error(res.error ?? 'Embedding failed')
    return (res.embeddings as number[][]).map((r) => Float32Array.from(r))
  }

  await ensureOffscreenDocument()
  try {
    return await attempt()
  } catch {
    // Offscreen doc likely closed or raced during creation; recreate once and retry.
    offscreenReady = null
    await ensureOffscreenDocument()
    return await attempt()
  }
}

async function ollamaEmbed(texts: string[], baseUrl: string, model: string): Promise<Float32Array[]> {
  const base = baseUrl.replace(/\/$/, '')
  const out: Float32Array[] = []
  for (const text of texts) {
    const res = await fetch(`${base}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: text }),
    })
    if (!res.ok) throw new Error(`Ollama embedding failed (${res.status}). Pull an embedding model like nomic-embed-text.`)
    const json = (await res.json()) as { embedding?: number[] }
    if (!json.embedding) throw new Error('Ollama returned no embedding')
    out.push(Float32Array.from(json.embedding))
  }
  return out
}

export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  const { embeddingBackend, ollamaBaseUrl, ollamaEmbeddingModel } = await chrome.storage.local.get([
    'embeddingBackend', 'ollamaBaseUrl', 'ollamaEmbeddingModel',
  ])
  const backend: EmbeddingBackend = embeddingBackend === 'ollama' ? 'ollama' : 'browser'
  if (backend === 'ollama') {
    return ollamaEmbed(texts, String(ollamaBaseUrl ?? 'http://localhost:11434'), String(ollamaEmbeddingModel ?? 'nomic-embed-text'))
  }
  return browserEmbed(texts)
}
