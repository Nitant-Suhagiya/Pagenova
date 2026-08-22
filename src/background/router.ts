import { getProvider, providerSupportsVision } from '../lib/providers/registry'
import type { ExtensionMessage } from '../lib/messaging'
import { prepareContext } from '../lib/rag/retrieve'
import { assembleMessages } from '../lib/assemble'
import { buildSessionHeader, getExactReply, resolveSystemPrompt } from '../lib/prompt'
import { searchWeb, shouldRunWebSearch } from '../lib/web/search'
import { clearController, registerController } from './ports'
import { extractActiveSelection, extractTabText } from './extract'
import { getCredentials } from '../lib/storage/credentials'

export async function routeChatRequest(message: Extract<ExtensionMessage, { type: 'CHAT_REQUEST' }>, port: chrome.runtime.Port, portId: string) {
  let controller: AbortController | undefined
  try {
    const prompt = message.text.trim() || 'Hello'
    const exactReply = getExactReply(prompt)
    if (exactReply) {
      port.postMessage({ type: 'CONTEXT_INFO', mode: 'full', sources: [], truncated: false })
      port.postMessage({ type: 'CHAT_CHUNK', delta: exactReply })
      port.postMessage({ type: 'CHAT_DONE' })
      return
    }

    const [settings, credentials] = await Promise.all([
      chrome.storage.local.get(['ollamaBaseUrl', 'otherBaseUrl', 'systemPrompt', 'webSearchProvider']),
      getCredentials(),
    ])
    const providerId = message.provider ?? 'ollama'
    const provider = getProvider(message.provider ?? 'ollama', {
      baseUrl: providerId === 'ollama'
        ? String(settings.ollamaBaseUrl ?? 'http://localhost:11434')
        : providerId === 'other'
          ? String(settings.otherBaseUrl ?? '')
          : undefined,
      apiKey: String(credentials[`${providerId}ApiKey` as keyof typeof credentials] ?? ''),
    })

    const model = message.model ?? 'llama3.1'
    const systemPrompt = resolveSystemPrompt(providerId, settings.systemPrompt as string | undefined)

    const tabs = await Promise.all((message.tabIds ?? []).map(async (tabId) => {
      const tab = await chrome.tabs.get(tabId).catch(() => null)
      if (!tab?.url || !/^https?:/i.test(tab.url)) return null
      const text = await extractTabText(tabId)
      if (!text) return null
      return {
        id: tabId,
        title: text.title,
        url: text.url,
        text: text.text,
      }
    }))
    const contextTabs = tabs.filter((t): t is NonNullable<typeof t> => t !== null)

    const docs = message.docs ?? []
    const selection = await extractActiveSelection()

    const { context, mode, sources, truncated } = await prepareContext({
      question: prompt,
      tabs: contextTabs,
      docs,
      provider: providerId,
      model,
    })

    // Web search results are untrusted context. Include the recent user turns
    // so follow-ups such as "search it" retain the subject of the request.
    const selectionSources = selection ? ['Selected text'] : []
    const webSources: string[] = []
    let contextWithWeb = selection ? `${context}${context ? '\n\n' : ''}[Selected text]\n${selection}` : context
    if (shouldRunWebSearch(providerId, message.webSearch ?? false)) {
      const recentQuestions = (message.history ?? [])
        .filter((turn) => turn.role === 'user')
        .slice(-2)
        .map((turn) => turn.content)
      const web = await searchWeb([...recentQuestions, prompt].join(' '), {
        provider: settings.webSearchProvider === 'tavily' ? 'tavily' : 'duckduckgo',
        apiKey: credentials.tavilyApiKey,
      }).catch(() => [])
      if (web.length) {
        webSources.push(...web.map((r) => r.title))
        const block = web
          .map((r, i) => `[Web ${i + 1}: ${r.title}]\n${r.snippet}${r.url ? `\n${r.url}` : ''}`)
          .join('\n\n')
        contextWithWeb += `\n\nWeb search results:\n${block}`
      }
    }

    const contextSources = [...sources, ...selectionSources, ...webSources]
    port.postMessage({ type: 'CONTEXT_INFO', mode, sources: contextSources, truncated })

    controller = new AbortController()
    registerController(portId, controller)
    // The system prompt stays provider-level; page and document content remain
    // untrusted data in the current user turn. See assembleMessages.
    const sessionHeader = buildSessionHeader({
      mode,
      sources: contextSources,
      hasImages: (message.images ?? []).length > 0,
      visionSupported: message.visionSupported ?? providerSupportsVision(providerId, model),
      webSearch: shouldRunWebSearch(providerId, message.webSearch ?? false),
      truncated,
    })
    const messages = assembleMessages({
      systemPrompt,
      context: contextWithWeb,
      sessionHeader,
      questionBlock: prompt,
      images: message.images ?? [],
      history: message.history ?? [],
    })

    for await (const chunk of provider.chatStream(model, messages, controller.signal)) {
      port.postMessage({ type: 'CHAT_CHUNK', delta: chunk.delta })
      if (chunk.done) {
        port.postMessage({ type: 'CHAT_DONE' })
        break
      }
    }
  } catch (error) {
    if (controller?.signal.aborted) return
    const messageText = error instanceof Error ? error.message : 'Unknown error'
    port.postMessage({ type: 'CHAT_ERROR', error: messageText })
  } finally {
    if (controller) clearController(portId, controller)
  }
}
