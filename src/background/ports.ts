import type { ExtensionMessage } from '../lib/messaging'
import { routeChatRequest } from './router'

const activeControllers = new Map<string, AbortController>()

export function registerController(portName: string, controller: AbortController) {
  activeControllers.get(portName)?.abort()
  activeControllers.set(portName, controller)
}

export function clearController(portName: string, controller: AbortController) {
  if (activeControllers.get(portName) === controller) activeControllers.delete(portName)
}

export function abortAndClearController(portName: string) {
  const controller = activeControllers.get(portName)
  activeControllers.delete(portName)
  controller?.abort()
}

export function setupChatPortConnection() {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'chat') {
      return
    }

    const portId = `chat-${Math.random()}`

    port.onMessage.addListener((message: ExtensionMessage) => {
      if (message.type === 'CHAT_REQUEST') {
        void routeChatRequest(message, port, portId)
      }
      if (message.type === 'STOP_GENERATION') {
        abortAndClearController(portId)
      }
    })

    port.onDisconnect.addListener(() => {
      abortAndClearController(portId)
    })
  })
}

async function pullModel(model: string, port: chrome.runtime.Port) {
  try {
    const { ollamaBaseUrl } = await chrome.storage.local.get(['ollamaBaseUrl'])
    const base = String(ollamaBaseUrl ?? 'http://localhost:11434').replace(/\/$/, '')
    const response = await fetch(`${base}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
    })
    if (!response.ok || !response.body) {
      const hint = response.status === 403
        ? ` Ollama blocked the request (CORS). Quit the running Ollama app, then restart it with $env:OLLAMA_ORIGINS="chrome-extension://${chrome.runtime.id}"; ollama serve.`
        : ''
      throw new Error(`Pull failed (${response.status}).${hint}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const p = JSON.parse(trimmed) as { status?: string; completed?: number; total?: number }
          if (!p.status) continue
          port.postMessage({ type: 'PULL_MODEL_PROGRESS', status: p.status, completed: p.completed, total: p.total })
          if (p.status === 'success') {
            port.postMessage({ type: 'PULL_MODEL_DONE' })
            return
          }
        } catch {
          // skip malformed lines
        }
      }
    }
    port.postMessage({ type: 'PULL_MODEL_DONE' })
  } catch (error) {
    port.postMessage({ type: 'PULL_MODEL_ERROR', error: error instanceof Error ? error.message : 'Pull failed' })
  } finally {
    port.disconnect()
  }
}

export function setupPullPortConnection() {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'pull') return
    port.onMessage.addListener((message: ExtensionMessage) => {
      if (message.type === 'PULL_MODEL') {
        void pullModel(message.model, port)
      }
    })
  })
}
