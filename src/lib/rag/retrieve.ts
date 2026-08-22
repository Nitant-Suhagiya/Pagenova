import { chunkText, tokenEstimate } from './chunk'
import { embedTexts } from './embed'
import { isMoondream } from '../providers/ollama'
import {
  putChunks, getChunksBySource, getTabMeta, setTabMeta, deleteChunksBySource, topK,
} from './vectorStore'
import type { Chunk } from './types'

const CONTEXT_WINDOWS: Record<string, number> = {
  'llama3.1:8b': 8192, 'llama3.1:70b': 32768, 'gemma3:4b': 8192,
  'qwen2.5:7b': 32768, 'gpt-4o': 128000, 'gpt-4o-mini': 128000,
  'claude-3-5-sonnet': 200000, 'gemini-1.5-pro': 1000000,
}

export interface ContextSource {
  id: number
  title: string
  url: string
  text: string
}

export interface ContextDoc {
  name: string
  text: string
}

export interface ContextInput {
  question: string
  tabs: ContextSource[]
  docs: ContextDoc[]
  provider: string
  model: string
}

export interface ContextResult {
  // User-selected page and RAG content, deliberately excluding the question.
  context: string
  mode: 'full' | 'retrieval'
  sources: string[]
  // True when the aggregate source cap silently dropped text before the model
  // ever saw it. Full mode must not claim completeness over truncated content.
  truncated: boolean
}

// ponytail: the per-tab cap (250k chars) times many selected tabs can exceed the
// service worker's comfort before chunking/embedding. Cap the aggregate so
// multi-tab selection degrades gracefully instead of stalling. Raise if real
// workloads need more than ~500KB of source text per request.
const MAX_TOTAL_CHARS = 500_000

function applyAggregateCap(input: ContextInput): boolean {
  const all = [...input.tabs, ...input.docs]
  const total = all.reduce((sum, s) => sum + s.text.length, 0)
  if (total <= MAX_TOTAL_CHARS) return false
  const perSource = Math.max(1, Math.floor(MAX_TOTAL_CHARS / all.length))
  for (const s of all) s.text = s.text.slice(0, perSource)
  return true
}

async function hashContent(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function indexSource(sourceId: string, title: string, text: string): Promise<Chunk[]> {
  const existing = await getChunksBySource(sourceId)
  const currentHash = await hashContent(text)

  // Return existing chunks if they match the current content hash
  if (existing.length > 0) {
    const existingMeta = await chrome.storage.local.get([`chunk-hash-${sourceId}`])
    if (existingMeta[`chunk-hash-${sourceId}`] === currentHash) {
      return existing
    }
    // Content changed, delete old chunks and re-index
    await deleteChunksBySource(sourceId)
  }

  const pieces = chunkText(text)
  const embeddings = await embedTexts(pieces)
  const chunks: Chunk[] = pieces.map((p, i) => ({
    id: `${sourceId}:${i}`, sourceId, title, text: p, embedding: embeddings[i],
  }))
  await putChunks(chunks)
  await chrome.storage.local.set({ [`chunk-hash-${sourceId}`]: currentHash })
  return chunks
}

async function indexTab(tab: ContextSource): Promise<void> {
  const sourceId = `tab:${tab.id}`
  const meta = await getTabMeta(tab.id)
  if (meta?.url && meta.url !== tab.url) await deleteChunksBySource(sourceId)
  await indexSource(sourceId, tab.title, tab.text)
  await setTabMeta(tab.id, tab.url)
}

function buildFullPrompt(sources: { title: string; text: string }[], maxCharsPerSource: number | null): string {
  const blocks = sources.map((s) => `[Source: ${s.title}]\n${maxCharsPerSource != null ? s.text.slice(0, maxCharsPerSource) : s.text}`).join('\n---\n')
  const body = blocks || 'No shared content.'
  return `Shared content selected by the user:\n${body}`
}

function buildRetrievalPrompt(retrieved: { chunk: Chunk; score: number }[]): string {
  const blocks = retrieved.map((r, i) => `[${r.chunk.title}, excerpt ${i + 1}]\n${r.chunk.text}`).join('\n---\n')
  return `Relevant excerpts from the user's shared content:\n${blocks}`
}

function fitRetrievedContext(retrieved: { chunk: Chunk; score: number }[], tokenBudget: number) {
  let remaining = tokenBudget
  return retrieved.flatMap((result) => {
    if (remaining <= 0) return []
    let text = result.chunk.text
    if (tokenEstimate(text) > remaining) {
      let low = 0
      let high = text.length
      while (low < high) {
        const mid = Math.ceil((low + high) / 2)
        if (tokenEstimate(text.slice(0, mid)) <= remaining) low = mid
        else high = mid - 1
      }
      text = text.slice(0, low)
    }
    remaining -= tokenEstimate(text)
    return text ? [{ ...result, chunk: { ...result.chunk, text } }] : []
  })
}

export async function prepareContext(input: ContextInput): Promise<ContextResult> {
  const truncated = applyAggregateCap(input)
  const sources = [
    ...input.tabs.map((t) => ({ title: t.title, text: t.text })),
    ...input.docs.map((d) => ({ title: d.name, text: d.text })),
  ]
  const totalTokens = sources.reduce((sum, s) => sum + tokenEstimate(s.text), 0) + tokenEstimate(input.question)
  const window = isMoondream(input.model) ? 2048 : CONTEXT_WINDOWS[input.model] ?? (input.provider === 'ollama' ? 4096 : 128000)

  // No source means no context block. Sending a placeholder makes small vision
  // models repeat the wrapper instead of answering the image question.
  if (sources.length === 0) {
    return { context: '', mode: 'full', sources: [], truncated }
  }

  // Gemini-style fast path: small context fits, inject full text, skip embedding.
  if (totalTokens < window * 0.6) {
    return { context: buildFullPrompt(sources, null), mode: 'full', sources: sources.map((s) => s.title), truncated }
  }

  // RAG path: chunk + embed + retrieve only the relevant excerpts.
  try {
    await Promise.all(input.tabs.map((tab) => indexTab(tab)))
    for (const doc of input.docs) {
      await indexSource(`doc:${doc.name}`, doc.name, doc.text)
    }
    const [qEmb] = await embedTexts([input.question])
    const sourceIds = [
      ...input.tabs.map((t) => `tab:${t.id}`),
      ...input.docs.map((d) => `doc:${d.name}`),
    ]
    const chunks = (await Promise.all(sourceIds.map((id) => getChunksBySource(id)))).flat()
    const top = fitRetrievedContext(topK(qEmb, chunks, 6), Math.floor(window * 0.5))
    return {
      context: buildRetrievalPrompt(top),
      mode: 'retrieval',
      sources: [...new Set(top.map((r) => r.chunk.title))],
      truncated,
    }
  } catch (error) {
    console.error('RAG pipeline error, falling back to truncated full-text:', error)
    const maxCharsPerSource = Math.max(1, Math.floor((window * 0.6) / Math.max(sources.length, 1))) * 4
    return { context: buildFullPrompt(sources, maxCharsPerSource), mode: 'full', sources: sources.map((s) => s.title), truncated: true }
  }
}
