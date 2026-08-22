type ScreenshotResult = { ok: boolean; dataUrl?: string; error?: string }

const captureBlockedMessage = 'Pagenova cannot capture this tab. Use a normal webpage and allow screenshot access when prompted.'

function isWebPage(url: string | undefined): boolean {
  return !!url && /^https?:/i.test(url)
}

export function screenshotFailureMessage(error?: string): string {
  return /activeTab|<all_urls>/i.test(error ?? '') ? captureBlockedMessage : (error ?? 'Could not capture screenshot')
}

function captureWindow(windowId: number): Promise<ScreenshotResult> {
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
      const error = chrome.runtime.lastError?.message
      resolve(error
        ? { ok: false, error: screenshotFailureMessage(error) }
        : dataUrl ? { ok: true, dataUrl } : { ok: false, error: 'Empty screenshot' })
    })
  })
}

export async function captureVisibleScreenshot(sourceTabId?: number): Promise<ScreenshotResult> {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  let targetTab = activeTab
  if (sourceTabId != null && sourceTabId !== activeTab?.id) {
    const sourceTab = await chrome.tabs.get(sourceTabId).catch(() => undefined)
    if (sourceTab?.id != null) targetTab = sourceTab
  }
  if (!targetTab?.id || targetTab.windowId == null || !isWebPage(targetTab.url)) {
    return { ok: false, error: captureBlockedMessage }
  }

  const [previousTab] = await chrome.tabs.query({ active: true, windowId: targetTab.windowId })
  const switchedTabs = targetTab.id !== previousTab?.id
  if (switchedTabs) await chrome.tabs.update(targetTab.id!, { active: true })
  try {
    return await captureWindow(targetTab.windowId!)
  } finally {
    if (switchedTabs && previousTab?.id != null) void chrome.tabs.update(previousTab.id, { active: true }).catch(() => undefined)
  }
}
