import { useEffect, useRef, useState } from 'react'

import { getProvider, providerSupportsVision } from '../lib/providers/registry'
import { saveSession, listSessions, deleteSession } from '../lib/storage/history'
import type { HistorySession } from '../lib/storage/history'
import { getCredentials } from '../lib/storage/credentials'

export interface ChatMessageItem {
  role: 'user' | 'assistant'
  content: string
  images?: string[]
  sources?: string[]
  mode?: 'full' | 'retrieval'
}

export interface ContextInfo {
  mode: 'full' | 'retrieval'
  sources: string[]
  truncated: boolean
}

export interface SendContext {
  images: { name: string; dataUrl: string }[]
  docs: { name: string; text: string | null }[]
  clearAttachments: () => void
}

export interface ModelState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  list: string[]
  vision: Record<string, boolean>
  selected: string
  error: string
}

interface PortMessage {
  type?: string
  delta?: string
  error?: string
  mode?: 'full' | 'retrieval'
  sources?: string[]
  truncated?: boolean
}

const SESSION_KEY = 'pagenovaSession'

// Lazy so the random id is generated when a chat actually starts, not during
// render — generating during render is a StrictMode double-invoke hazard and
// trips the react(purity) rule.
function newConversationId(): string {
  return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

const INITIAL_MODEL_STATE: ModelState = { status: 'idle', list: [], vision: {}, selected: '', error: '' }
const MAX_HISTORY_IMAGES = 1

// Preserve a restored selection only when the freshly loaded list still contains
// it; otherwise fall back to the first model.
function pickModel(list: string[], restored: string): string {
  return restored && list.includes(restored) ? restored : list[0] ?? ''
}

function imagePart(dataUrl: string): { base64: string; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  return { mimeType: match?.[1] ?? 'image/png', base64: match?.[2] ?? '' }
}

export function useChatSession() {
  const [messages, setMessages] = useState<ChatMessageItem[]>([])
  const [input, setInput] = useState('')
  const [provider, setProvider] = useState('ollama')
  const [availableProviders, setAvailableProviders] = useState<string[]>(['ollama'])
  // Model list, selection, and loading/error status collapse into one object so
  // a provider switch transitions atomically (list, selection, and status can
  // never paint out of sync) and the reset can live inside the async loader
  // instead of firing synchronously in the effect body.
  const [modelState, setModelState] = useState<ModelState>(INITIAL_MODEL_STATE)
  const model = modelState.selected
  const models = modelState.list
  const modelSupportsVision = !!model && (modelState.vision[model] ?? providerSupportsVision(provider, model))
  const isLoadingModels = modelState.status === 'loading'
  const modelError = modelState.error
  const setModel = (selected: string) => setModelState((m) => ({ ...m, selected }))
  const [selectedTabIds, setSelectedTabIds] = useState<number[]>([])
  const [webSearchOn, setWebSearchOn] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isIndexing, setIsIndexing] = useState(false)
  const [error, setError] = useState('')
  const [contextInfo, setContextInfo] = useState<ContextInfo | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyList, setHistoryList] = useState<HistorySession[]>([])
  const [hydrated, setHydrated] = useState(false)

  const portRef = useRef<chrome.runtime.Port | null>(null)
  const messagesRef = useRef(messages)
  const restoredModelRef = useRef('')
  const persistTimer = useRef<number | undefined>(undefined)
  const conversationIdRef = useRef<string>('')
  const contextDocsRef = useRef<{ name: string; text: string }[]>([])

  const ensureConversationId = (): string => {
    if (!conversationIdRef.current) conversationIdRef.current = newConversationId()
    return conversationIdRef.current
  }

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => () => portRef.current?.disconnect(), [])

  useEffect(() => {
    void getCredentials().then((stored) => {
      const providers = ['ollama']
      if (stored.openaiApiKey) providers.push('openai')
      if (stored.anthropicApiKey) providers.push('anthropic')
      if (stored.geminiApiKey) providers.push('gemini')
      if (stored.otherApiKey) providers.push('other')
      setAvailableProviders(providers)
      setProvider((current) => (providers.includes(current) ? current : 'ollama'))
    })
  }, [])

  useEffect(() => {
    void chrome.storage.local.get('pendingSelectionSummary').then((stored) => {
      const pending = stored.pendingSelectionSummary as { text: string } | undefined
      if (pending?.text) {
        setInput(`Summarize this: ${pending.text}`)
        void chrome.storage.local.remove('pendingSelectionSummary')
      }
    })
  }, [])

  useEffect(() => {
    void chrome.storage.session.get(SESSION_KEY).then((stored) => {
      const sess = stored[SESSION_KEY] as Partial<{ provider: string; model: string; selectedTabIds: number[]; messages: ChatMessageItem[] }> | undefined
      if (sess?.provider) setProvider(sess.provider)
      if (sess?.model) {
        restoredModelRef.current = sess.model
        setModel(sess.model)
      }
      if (Array.isArray(sess?.messages) && sess.messages.length) setMessages(sess.messages)
      if (Array.isArray(sess?.selectedTabIds) && sess.selectedTabIds.length) {
        setSelectedTabIds(sess.selectedTabIds)
      }
      setHydrated(true)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      chrome.storage.local.get(['ollamaBaseUrl', 'otherBaseUrl']),
      getCredentials(),
    ]).then(async ([stored, credentials]) => {
      // Reset inside the async callback, not the effect body: this avoids the
      // synchronous setState-in-effect render cascade and lets every provider
      // switch collapse to a single atomic transition.
      setModelState({ status: 'loading', list: [], vision: {}, selected: '', error: '' })
      try {
        const prov = getProvider(provider, {
          baseUrl: provider === 'ollama'
            ? String(stored.ollamaBaseUrl ?? 'http://localhost:11434')
            : provider === 'other'
              ? String(stored.otherBaseUrl ?? '')
              : undefined,
          apiKey: String(credentials[`${provider}ApiKey` as keyof typeof credentials] ?? ''),
        })
        const list = await prov.listModels()
        if (cancelled) return
        const names = list.map((m) => m.name)
        setModelState({ status: 'ready', list: names, vision: Object.fromEntries(list.map((m) => [m.name, m.supportsVision])), selected: pickModel(names, restoredModelRef.current), error: '' })
      } catch {
        if (cancelled) return
        setModelState({
          status: 'error',
          list: [],
          vision: {},
          selected: '',
          error: provider === 'ollama'
            ? 'Could not load Ollama models. Start Ollama, then refresh.'
            : `Could not load ${provider} models. Check your API key.`,
        })
      }
    })

    return () => { cancelled = true }
  }, [provider])

  useEffect(() => {
    if (!hydrated) return
    window.clearTimeout(persistTimer.current)
    const timer = window.setTimeout(() => {
      void chrome.storage.session.set({
        [SESSION_KEY]: { provider, model, selectedTabIds, messages: messagesRef.current },
      })
    }, 300)
    persistTimer.current = timer
    return () => window.clearTimeout(timer)
  }, [provider, model, selectedTabIds, messages, hydrated])

  const stopGeneration = () => {
    if (portRef.current) {
      portRef.current.postMessage({ type: 'STOP_GENERATION' })
      portRef.current.disconnect()
      portRef.current = null
    }
    setIsStreaming(false)
    setIsIndexing(false)
  }

  const toggleTab = (id: number) => {
    setSelectedTabIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }

  const sendMessage = async (ctx: SendContext) => {
    const text = input.trim()
    if (!text || isStreaming || !model) return
    setError('')
    const attachedImages = ctx.images.map((img) => img.dataUrl)
    const imageParts = attachedImages.map(imagePart)
    const attachedDocs = ctx.docs.filter((d): d is { name: string; text: string } => d.text != null)
    if (attachedDocs.length) {
      const docsByName = new Map(contextDocsRef.current.map((doc) => [doc.name, doc]))
      attachedDocs.forEach((doc) => docsByName.set(doc.name, doc))
      contextDocsRef.current = [...docsByName.values()]
    }
    const docs = contextDocsRef.current
    setMessages((current) => [...current, { role: 'user', content: text, ...(attachedImages.length ? { images: attachedImages } : {}) }])
    ctx.clearAttachments()
    setInput('')
    setIsStreaming(true)
    setIsIndexing(true)
    setContextInfo(null)
    const port = chrome.runtime.connect({ name: 'chat' })
    portRef.current = port
    port.onDisconnect.addListener(() => {
      if (portRef.current !== port) return
      portRef.current = null
      setIsStreaming(false)
      setIsIndexing(false)
    })
    let responseText = ''
    let contextMode: 'full' | 'retrieval' = 'full'
    let contextSources: string[] = []
    port.onMessage.addListener((message: PortMessage) => {
      if (message.type === 'CHAT_CHUNK') {
        responseText += message.delta ?? ''
        setMessages((current) => current[current.length - 1]?.role === 'assistant'
          ? [...current.slice(0, -1), { role: 'assistant', content: responseText }]
          : [...current, { role: 'assistant', content: responseText }])
      }
      if (message.type === 'CONTEXT_INFO') {
        contextMode = message.mode ?? 'full'
        contextSources = message.sources ?? []
        setContextInfo({ mode: contextMode, sources: contextSources, truncated: message.truncated ?? false })
        setIsIndexing(false)
      }
      if (message.type === 'CHAT_ERROR') {
        setError(message.error ?? 'The provider returned an error.')
        setIsStreaming(false)
        setIsIndexing(false)
        port.disconnect()
        portRef.current = null
      }
      if (message.type === 'CHAT_DONE') {
        setMessages((current) => {
          const last = current[current.length - 1]
          if (last?.role === 'assistant') {
            return [...current.slice(0, -1), { ...last, sources: contextSources, mode: contextMode }]
          }
          return current
        })
        setIsStreaming(false)
        setIsIndexing(false)
        port.disconnect()
        portRef.current = null
        const firstUserMessage = messagesRef.current.find((m) => m.role === 'user')?.content ?? text
        void saveSession({
          conversationId: ensureConversationId(),
          title: firstUserMessage.slice(0, 60),
          provider,
          model,
          messages: messagesRef.current,
          updatedAt: Date.now(),
        })
      }
    })
    let remainingHistoryImages = MAX_HISTORY_IMAGES
    const historyImages = new Map<number, { base64: string; mimeType: string }[]>()
    for (let index = messagesRef.current.length - 1; index >= 0 && remainingHistoryImages > 0; index -= 1) {
      const images = messagesRef.current[index].images?.map(imagePart).slice(-remainingHistoryImages) ?? []
      if (images.length) {
        historyImages.set(index, images)
        remainingHistoryImages -= images.length
      }
    }
    const priorMessages = messagesRef.current.map((m, index) => {
      const images = historyImages.get(index) ?? []
      return { role: m.role, content: m.content, ...(images.length ? { images } : {}) }
    })
    port.postMessage({
      type: 'CHAT_REQUEST', text, provider, model, tabIds: selectedTabIds, visionSupported: modelSupportsVision,
      ...(webSearchOn ? { webSearch: true } : {}),
      ...(imageParts.length ? { images: imageParts } : {}),
      ...(docs.length ? { docs } : {}),
      ...(priorMessages.length ? { history: priorMessages } : {}),
    })
  }

  const changeProvider = (nextProvider: string) => {
    setProvider(nextProvider)
    // Reset atomically in the event handler (not the effect) so the dropdown never
    // renders the new provider alongside the previous provider's model list.
    setModelState({ status: 'loading', list: [], vision: {}, selected: '', error: '' })
  }

  const newChat = () => {
    if (portRef.current) {
      portRef.current.disconnect()
      portRef.current = null
    }
    conversationIdRef.current = newConversationId()
    contextDocsRef.current = []
    setMessages([])
    setContextInfo(null)
    setError('')
    setInput('')
    setIsStreaming(false)
    setIsIndexing(false)
  }

  const exportMarkdown = () => {
    const md = messages.map((m) => {
      const imgs = m.images?.length
        ? '\n\n' + m.images.map((src, j) => `![image ${j + 1}](${src})`).join('\n')
        : ''
      return `## ${m.role}\n\n${m.content}${imgs}`
    }).join('\n\n---\n\n')
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pagenova-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggleHistory = async () => {
    if (!historyOpen) setHistoryList(await listSessions())
    setHistoryOpen((o) => !o)
  }

  const loadHistorySession = (s: HistorySession) => {
    // Tear down any in-flight stream so its late chunks don't leak into the
    // restored conversation, and reset the transient per-request state.
    if (portRef.current) {
      portRef.current.disconnect()
      portRef.current = null
    }
    conversationIdRef.current = s.conversationId
    contextDocsRef.current = []
    setMessages(s.messages)
    if (s.provider) setProvider(s.provider)
    if (s.model) {
      restoredModelRef.current = s.model
      setModel(s.model)
    }
    setHistoryOpen(false)
    setContextInfo(null)
    setError('')
    setIsStreaming(false)
    setIsIndexing(false)
  }

  const removeHistorySession = async (id: number) => {
    await deleteSession(id)
    setHistoryList(await listSessions())
  }

  return {
    messages, input, setInput, provider, changeProvider, model, setModel,
    availableProviders, models, modelSupportsVision, isLoadingModels, modelError,
    selectedTabIds, toggleTab, webSearchOn, setWebSearchOn,
    isStreaming, isIndexing, error, setError, contextInfo,
    historyOpen, historyList, setHistoryOpen, toggleHistory, loadHistorySession, removeHistorySession,
    sendMessage, stopGeneration, newChat, exportMarkdown,
  }
}
