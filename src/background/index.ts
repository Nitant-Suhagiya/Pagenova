import { setupChatPortConnection, setupPullPortConnection } from './ports'
import { captureVisibleScreenshot } from './screenshot'
import { deleteChunksBySource } from '../lib/rag/vectorStore'
import { imageUrlToDataUrl } from './imageUrl'
import { extractPageImageInfos } from './extract'

async function fetchPageImages(): Promise<{ dataUrl: string; alt: string }[]> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return []
  const list = await extractPageImageInfos(tab.id)
  const results = await Promise.all(list.map(async (item) => {
    const dataUrl = item.src.startsWith('data:') ? item.src : await imageUrlToDataUrl(item.src)
    return dataUrl ? { dataUrl, alt: item.alt } : null
  }))
  return results.filter((r): r is { dataUrl: string; alt: string } => r !== null)
}

function configureSidePanel() {
  chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: true }).catch((error) => {
    console.error('Failed to configure side panel options', error)
  })

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => {
    console.error('Failed to configure side panel behavior', error)
  })
}

chrome.runtime.onInstalled.addListener(() => {
  configureSidePanel()
})

configureSidePanel()

// Fallback: open side panel directly on action click if behavior not supported/active
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id })
    } catch {
      await chrome.sidePanel.open({ windowId: tab.windowId })
    }
  }
})

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'summarize-selection',
    title: 'Summarize with AI',
    contexts: ['selection'],
  })
  chrome.contextMenus.create({
    id: 'analyze-image',
    title: 'Ask AI about this image',
    contexts: ['image'],
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'summarize-selection' && tab?.id && info.selectionText) {
    void (async () => {
      await chrome.storage.local.set({ pendingSelectionSummary: { text: info.selectionText } })
      try {
        await chrome.sidePanel.open({ tabId: tab.id! })
      } catch {
        await chrome.sidePanel.open({ windowId: tab.windowId })
      }
    })()
  }
  if (info.menuItemId === 'analyze-image' && info.srcUrl && tab) {
    void (async () => {
      const dataUrl = await imageUrlToDataUrl(info.srcUrl!)
      if (!dataUrl) return
      await chrome.storage.local.set({ pendingImage: { name: 'image', dataUrl } })
      try {
        await chrome.sidePanel.open({ tabId: tab.id! })
      } catch {
        await chrome.sidePanel.open({ windowId: tab.windowId })
      }
    })()
  }
})

chrome.runtime.onMessage.addListener((message: { type?: string; sourceTabId?: number }, _sender, sendResponse) => {
  if (message.type === 'CAPTURE_SCREENSHOT') {
    void (async () => { sendResponse(await captureVisibleScreenshot(message.sourceTabId)) })()
    return true
  }
  if (message.type === 'FETCH_PAGE_IMAGES') {
    void (async () => { sendResponse(await fetchPageImages()) })()
    return true
  }
  return undefined
})

chrome.runtime.onMessage.addListener((message: { type?: string }) => {
  if (message.type !== 'CLOSE_SIDE_PANEL') return

  // Chrome has no direct close API for side panels, so toggle global enablement.
  void chrome.sidePanel.setOptions({ enabled: false }).then(() => {
    setTimeout(() => {
      void chrome.sidePanel.setOptions({ path: 'sidepanel.html', enabled: true })
    }, 150)
  }).catch((error) => {
    console.error('Failed to close side panel', error)
  })
})

setupChatPortConnection()
setupPullPortConnection()

// Invalidate cached chunks when a tab closes or navigates to a new URL.
chrome.tabs.onRemoved.addListener((tabId) => {
  void deleteChunksBySource(`tab:${tabId}`)
})
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) void deleteChunksBySource(`tab:${tabId}`)
})

