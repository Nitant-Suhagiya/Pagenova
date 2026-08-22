import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import { useChatSession } from './useChatSession'
import { useAttachments } from './useAttachments'

const providerLabels: Record<string, string> = {
  ollama: 'Ollama',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  other: 'Other compatible',
}

export function ChatPanel() {
  const isWebUi = window.location.pathname.includes('webui')
  const session = useChatSession()
  const attachments = useAttachments()

  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([])
  const [plusOpen, setPlusOpen] = useState(false)
  const [contextConsent, setContextConsent] = useState(false)
  const [contextConsentOpen, setContextConsentOpen] = useState(false)
  const [hoverItem, setHoverItem] = useState<'image' | 'doc' | 'screenshot' | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [expandedSourceTabId, setExpandedSourceTabId] = useState<number | undefined>()
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const docInputRef = useRef<HTMLInputElement | null>(null)
  const plusMenuRef = useRef<HTMLDivElement | null>(null)
  const plusButtonRef = useRef<HTMLButtonElement | null>(null)
  const contextConsentRef = useRef(false)

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [session.messages, session.isStreaming])

  useEffect(() => {
    if (!plusOpen) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (target && !plusMenuRef.current?.contains(target) && !plusButtonRef.current?.contains(target)) {
        setPlusOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [plusOpen])

  useEffect(() => {
    void chrome.storage.local.get(['uiTheme', 'contextConsent']).then((stored) => {
      if (stored.uiTheme === 'light' || stored.uiTheme === 'dark') {
        setTheme(stored.uiTheme)
      }
      if (stored.contextConsent === true) {
        contextConsentRef.current = true
        setContextConsent(true)
      }
    })
  }, [])

  useEffect(() => {
    if (!isWebUi) return
    void chrome.storage.session.get('expandedSourceTabId').then((stored) => {
      const tabId = stored.expandedSourceTabId
      if (typeof tabId === 'number') setExpandedSourceTabId(tabId)
    })
  }, [isWebUi])

  const loadTabs = () => {
    if (!contextConsentRef.current) return
    void chrome.tabs.query({}).then((found) => {
      setTabs(found.filter((t) => t.id != null && !!t.url && /^https?:/i.test(t.url)))
    })
  }

  const openAddMenu = () => {
    if (!contextConsent) {
      setContextConsentOpen(true)
      return
    }
    const next = !plusOpen
    setPlusOpen(next)
    if (next) loadTabs()
  }

  const acceptContextConsent = () => {
    contextConsentRef.current = true
    setContextConsent(true)
    setContextConsentOpen(false)
    setPlusOpen(true)
    void chrome.storage.local.set({ contextConsent: true })
    loadTabs()
  }

  const handleNewChat = () => {
    session.newChat()
    attachments.clearAttachments()
  }

  const handleSend = () => {
    void session.sendMessage({
      images: attachments.pendingImages,
      docs: attachments.pendingDocs,
      clearAttachments: attachments.clearAttachments,
    })
  }

  const handleAddDocs = async (files: Iterable<File> | null) => {
    const err = await attachments.addDocs(files)
    if (err) session.setError(err)
  }

  const handleCaptureScreenshot = () => {
    setPlusOpen(false)
    session.setError('')
    const sourceTabId = isWebUi ? expandedSourceTabId : undefined
    void attachments.captureScreenshot(sourceTabId).then((err) => { if (err) session.setError(err) })
  }

  const openExpandedView = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.id != null) await chrome.storage.session.set({ expandedSourceTabId: tab.id })
    await chrome.tabs.create({ url: chrome.runtime.getURL('webui.html') })
    await chrome.runtime.sendMessage({ type: 'CLOSE_SIDE_PANEL' })
    window.close()
  }

  const collapseToSidePanel = async () => {
    const lastId = session.selectedTabIds[session.selectedTabIds.length - 1]
    if (lastId != null) {
      await chrome.tabs.update(lastId, { active: true }).catch(() => undefined)
    }
    const win = await chrome.windows.getCurrent()
    if (win.id != null) await chrome.sidePanel.open({ windowId: win.id })
    window.close()
  }

  const openSettingsView = async () => {
    await chrome.runtime.openOptionsPage()
    window.close() // close the side panel
  }

  const toggleTheme = async () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    await chrome.storage.local.set({ uiTheme: nextTheme })
  }

  const isDark = theme === 'dark'

  // ─── Colour tokens (all inline — no Tailwind for structural layout) ──────────
  const bg = isDark
    ? 'radial-gradient(circle at 0 0, rgba(255,255,255,0.11), transparent 38%), radial-gradient(circle at 100% 100%, rgba(255,255,255,0.05), transparent 46%), #0d0d0d'
    : 'radial-gradient(circle at 0 0, rgba(255,255,255,0.98), transparent 38%), radial-gradient(circle at 100% 100%, rgba(176,176,176,0.32), transparent 48%), #e7e7e7'
  const cardBg = isDark ? 'rgba(29,29,29,0.72)' : 'rgba(255,255,255,0.58)'
  const cardBorder = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.74)'
  const cardShadow = isDark
    ? '26px 26px 34px rgba(0,0,0,0.66), inset -10px -10px 20px rgba(0,0,0,0.8), inset 0 16px 32px rgba(255,255,255,0.14)'
    : '24px 24px 38px rgba(67,67,67,0.24), inset -10px -10px 20px rgba(145,145,145,0.32), inset 0 16px 32px rgba(255,255,255,0.98)'
  const titleColor = isDark ? '#ffffff' : '#0f0f0f'
  const btnBg = isDark ? 'rgba(32,32,32,0.66)' : 'rgba(255,255,255,0.5)'
  const btnBorder = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.72)'
  const btnShadow = isDark
    ? '6px 6px 12px rgba(0,0,0,0.62), inset -4px -4px 8px rgba(0,0,0,0.76), inset 0 7px 14px rgba(255,255,255,0.11)'
    : '6px 6px 12px rgba(67,67,67,0.2), inset -4px -4px 8px rgba(154,154,154,0.26), inset 0 7px 14px rgba(255,255,255,0.98)'
  const inputBg = isDark ? 'rgba(12,12,12,0.66)' : 'rgba(255,255,255,0.56)'
  const inputBorder = isDark ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.72)'
  const inputColor = isDark ? '#f2f2f2' : '#111111'
  const softTextColor = isDark ? '#b0b0b0' : '#555555'
  const sendBg = '#c2410c'
  const sendColor = '#ffffff'
  const sendDisabledBg = isDark ? '#2a2a2a' : '#fed7aa'
  const sendDisabledColor = isDark ? '#777777' : '#9a3412'
  const errorBg = isDark ? '#1a0808' : '#fff1f1'
  const errorBorder = isDark ? '#7f1d1d' : '#fca5a5'
  const errorColor = isDark ? '#fca5a5' : '#b91c1c'
  const glassEffect: React.CSSProperties = { backdropFilter: 'blur(16px) saturate(110%)' }

  // ─── Inline style objects for guaranteed layout ──────────────────────────────
  const shellStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    minHeight: '100vh',
    overflow: 'hidden',
    background: bg,
    fontFamily: "'Noto Sans', 'Segoe UI', system-ui, -apple-system, sans-serif",
    position: 'relative',
    boxSizing: 'border-box',
  }

  const headerStyle: React.CSSProperties = {
    flexShrink: 0,
    padding: isWebUi ? '16px 24px 0' : '10px 10px 0',
    zIndex: 20,
  }

  const headerCardStyle: React.CSSProperties = {
    backgroundColor: cardBg,
    border: `1px solid ${cardBorder}`,
    borderRadius: '28px',
    padding: '14px',
    boxShadow: cardShadow,
    ...glassEffect,
    maxWidth: isWebUi ? '880px' : undefined,
    margin: isWebUi ? '0 auto' : undefined,
  }

  const titleRowStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
    minHeight: '44px',
  }

  const titleGroupStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '10px',
  }

  const assistantTitleStyle: React.CSSProperties = {
    fontSize: '20px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: titleColor,
    lineHeight: 1.2,
    margin: 0,
    padding: 0,
  }

  const iconRowStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  }

  const iconBtnStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    borderRadius: '12px',
    border: `1px solid ${btnBorder}`,
    backgroundColor: btnBg,
    boxShadow: btnShadow,
    cursor: 'pointer',
    flexShrink: 0,
    padding: 0,
    transition: 'opacity 0.2s',
  }

  const plusIconBtnStyle: React.CSSProperties = {
    ...iconBtnStyle,
    width: '36px',
    height: '36px',
    flex: '0 0 auto',
  }

  const selectsRowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    marginTop: '12px',
  }

  const selectStyle: React.CSSProperties = {
    backgroundColor: inputBg,
    border: `1px solid ${inputBorder}`,
    borderRadius: '12px',
    color: inputColor,
    fontSize: '12px',
    fontWeight: 500,
    padding: '7px 10px',
    outline: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
  }

  const messagesStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: isWebUi ? '16px 24px' : '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    minHeight: 0,
    width: '100%',
    maxWidth: isWebUi ? '880px' : undefined,
    alignSelf: isWebUi ? 'center' : undefined,
  }

  const footerStyle: React.CSSProperties = {
    flexShrink: 0,
    margin: isWebUi ? '0 auto 16px' : '0 10px 10px',
    backgroundColor: cardBg,
    border: `1px solid ${cardBorder}`,
    borderRadius: '28px',
    padding: '10px',
    boxShadow: cardShadow,
    ...glassEffect,
    width: isWebUi ? 'calc(100% - 48px)' : undefined,
    maxWidth: isWebUi ? '880px' : undefined,
  }

  const textareaStyle: React.CSSProperties = {
    flex: 1,
    resize: 'none',
    minHeight: isWebUi ? '50px' : '54px',
    width: '100%',
    borderRadius: '14px',
    border: `1px solid ${inputBorder}`,
    backgroundColor: inputBg,
    color: inputColor,
    fontSize: '13px',
    padding: '8px 12px',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  const menuItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '9px 12px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: inputColor,
    fontSize: '12px',
    fontFamily: "'Noto Sans', 'Segoe UI', system-ui, -apple-system, sans-serif",
    textAlign: 'left',
  }

  const tooltipStyle: React.CSSProperties = {
    position: 'absolute',
    left: '50%',
    bottom: '100%',
    transform: 'translateX(calc(-50% + 50px))',
    marginBottom: '6px',
    backgroundColor: cardBg,
    border: `1px solid ${cardBorder}`,
    borderRadius: '8px',
    padding: '6px 12px',
    fontSize: '13px',
    color: inputColor,
    fontFamily: "'Noto Sans', 'Segoe UI', system-ui, -apple-system, sans-serif",
    whiteSpace: 'nowrap',
    boxShadow: cardShadow,
    ...glassEffect,
    pointerEvents: 'none',
    zIndex: 40,
  }

  const msgCardStyle = (role: 'user' | 'assistant'): React.CSSProperties => ({
    maxWidth: '92%',
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    backgroundColor: role === 'user'
      ? (isDark ? 'rgba(35,35,35,0.76)' : 'rgba(255,247,237,0.72)')
      : cardBg,
    border: `1px solid ${role === 'user' ? (isDark ? '#3b3b3b' : '#fed7aa') : cardBorder}`,
    borderRadius: '22px',
    padding: '10px 14px',
    fontSize: '13px',
    lineHeight: 1.6,
    color: inputColor,
    boxShadow: cardShadow,
    ...glassEffect,
  })

  const imgFilter = isDark ? 'invert(1) brightness(2)' : 'none'
  // Thickens thin line icons by adding a same-colour halo around each stroke.
  const plusIconFilter = isDark
    ? 'invert(1) brightness(2) drop-shadow(0 0 0.9px rgba(255,255,255,0.85))'
    : 'drop-shadow(0 0 0.9px rgba(0,0,0,0.85))'

  const modelSupportsVision = session.modelSupportsVision
  const visionWarning = attachments.pendingImages.length > 0 && !!session.model && !modelSupportsVision

  const canSend = !session.isStreaming && !!session.input.trim() && !!session.model
  const isDisabled = !session.isStreaming && !canSend

  return (
    <main
      className={isDark ? 'theme-dark' : 'theme-light'}
      style={shellStyle}
      onPaste={attachments.handlePaste}
      onDrop={attachments.handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* ── HEADER ── */}
      <header style={headerStyle} aria-label="Pagenova chat controls">
        <div style={headerCardStyle}>
          {/* Title row */}
          <div style={titleRowStyle}>
            <div style={titleGroupStyle}>
              <img src="/icons/logo.png" alt="Pagenova" style={{ height: '34px', width: 'auto', objectFit: 'contain' }} />
              {isWebUi && <h1 style={assistantTitleStyle}>Pagenova</h1>}
            </div>
            <div style={iconRowStyle}>
              {/* New chat */}
              <button type="button" onClick={handleNewChat} title="New chat" aria-label="New chat" style={iconBtnStyle}>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={inputColor} strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                </svg>
              </button>
              {/* Web search toggle */}
              <button
                type="button"
                onClick={() => session.setWebSearchOn((v) => !v)}
                title={session.webSearchOn ? 'Web search: on' : 'Web search: off'}
                aria-label="Toggle web search"
                aria-pressed={session.webSearchOn}
                style={{
                  ...iconBtnStyle,
                  backgroundColor: session.webSearchOn ? sendBg : btnBg,
                  borderColor: session.webSearchOn ? sendBg : btnBorder,
                }}
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={session.webSearchOn ? sendColor : inputColor} strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path strokeLinecap="round" d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
                </svg>
              </button>
              {/* History */}
              <button type="button" onClick={() => void session.toggleHistory()} title="History" aria-label="History" style={iconBtnStyle}>
                <img src="/icons/history.png" alt="History" width="16" height="16" style={{ objectFit: 'contain', filter: imgFilter }} />
              </button>
              {/* Export markdown */}
              <button type="button" onClick={() => session.exportMarkdown()} title="Export conversation as Markdown" aria-label="Export conversation as Markdown" style={iconBtnStyle}>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={inputColor} strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                </svg>
              </button>
              {/* Theme toggle */}
              <button
                type="button"
                onClick={() => void toggleTheme()}
                title={isDark ? 'Switch to Light mode' : 'Switch to Dark mode'}
                aria-label={isDark ? 'Switch to Light mode' : 'Switch to Dark mode'}
                style={iconBtnStyle}
              >
                {isDark ? (
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#334155" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
              {/* Settings */}
              <button type="button" onClick={() => void openSettingsView()} title="Settings" aria-label="Settings" style={iconBtnStyle}>
                <img src="/icons/setting.png" alt="Settings" width="16" height="16" style={{ objectFit: 'contain', filter: imgFilter }} />
              </button>
              {/* Expand / collapse */}
              <button
                type="button"
                onClick={() => void (isWebUi ? collapseToSidePanel() : openExpandedView())}
                title={isWebUi ? 'Back to side panel' : 'Expand to full tab'}
                aria-label={isWebUi ? 'Back to side panel' : 'Expand to full tab'}
                style={iconBtnStyle}
              >
                <img
                  src={isWebUi ? '/icons/sidebar.png' : '/icons/expand.png'}
                  alt={isWebUi ? 'Side panel' : 'Expand'}
                  width="16"
                  height="16"
                  style={{ objectFit: 'contain', filter: imgFilter, ...(isWebUi ? { transform: 'scaleX(-1)' } : {}) }}
                />
              </button>
              {/* GitHub — web UI only */}
              {isWebUi && (
                <button
                  type="button"
                  onClick={() => void chrome.tabs.create({ url: 'https://github.com' })}
                  title="GitHub"
                  aria-label="Open GitHub"
                  style={iconBtnStyle}
                >
                  <img src="/icons/github.png" alt="GitHub" width="16" height="16" style={{ objectFit: 'contain', filter: imgFilter }} />
                </button>
              )}
            </div>
          </div>

          {/* Provider + Model selects */}
          <div style={selectsRowStyle}>
            <select
              value={session.provider}
              onChange={(e) => session.changeProvider(e.target.value)}
              aria-label="Provider"
              style={selectStyle}
            >
              {session.availableProviders.map((p) => (
                <option key={p} value={p}>{providerLabels[p]}</option>
              ))}
            </select>
            <select
              value={session.model}
              onChange={(e) => session.setModel(e.target.value)}
              disabled={session.isLoadingModels || session.models.length === 0}
              aria-label="Model"
              style={selectStyle}
            >
              <option value="">
                {session.isLoadingModels ? 'Loading...' : session.modelError ? 'Unavailable' : 'Select model'}
              </option>
              {session.models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {session.modelError && (
            <p style={{ fontSize: '11px', color: '#f59e0b', marginTop: '6px', marginBottom: 0 }}>
              {session.modelError}
            </p>
          )}
          {session.model && modelSupportsVision && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px' }}>
              <span style={{ fontSize: '10px', color: softTextColor, border: `1px solid ${inputBorder}`, borderRadius: '999px', padding: '2px 8px' }}>
                vision
              </span>
            </div>
          )}
          {visionWarning && (
            <p style={{ fontSize: '11px', color: '#f59e0b', marginTop: '6px', marginBottom: 0 }}>
              This model doesn't support images. Switch to a vision model (e.g. gpt-4o, claude, or llava).
            </p>
          )}
        </div>
      </header>

      {/* ── MESSAGES ── */}
      <section style={messagesStyle} aria-label="Conversation" role="log" aria-live="polite" aria-relevant="additions text">
        {session.contextInfo && (
          <div style={{
            alignSelf: 'center',
            fontSize: '10px',
            color: softTextColor,
            backgroundColor: cardBg,
            border: `1px solid ${cardBorder}`,
            borderRadius: '999px',
            padding: '3px 10px',
          }}>
            {session.contextInfo.sources.length === 0
              ? 'No page or document context selected. Image attachments are sent separately.'
              : session.contextInfo.mode === 'retrieval'
                ? `Retrieved excerpts from ${session.contextInfo.sources.length} source${session.contextInfo.sources.length === 1 ? '' : 's'}.`
                : session.contextInfo.truncated
                  ? `Truncated to fit (${session.contextInfo.sources.length} source${session.contextInfo.sources.length === 1 ? '' : 's'})`
                  : `Using full page context (${session.contextInfo.sources.length} source${session.contextInfo.sources.length === 1 ? '' : 's'})`}
          </div>
        )}
        {session.isIndexing && (
          <div style={{
            alignSelf: 'center',
            fontSize: '10px',
            color: softTextColor,
            backgroundColor: cardBg,
            border: `1px solid ${cardBorder}`,
            borderRadius: '999px',
            padding: '3px 10px',
          }}>
            Indexing context…
          </div>
        )}
        {session.messages.length === 0 && (
          <div style={{
            backgroundColor: cardBg,
            border: `1px solid ${cardBorder}`,
            borderRadius: '18px',
            padding: '14px',
            fontSize: '13px',
            color: softTextColor,
            boxShadow: cardShadow,
          }}>
            Ask about the page, a selected passage, or anything on your mind.
          </div>
        )}

        {session.messages.map((msg, i) => (
          <div key={`${msg.role}-${i}`} style={msgCardStyle(msg.role)}>
            {msg.images && msg.images.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                {msg.images.map((src, j) => (
                  <img
                    key={j}
                    src={src}
                    alt=""
                    onClick={() => setLightboxSrc(src)}
                    style={{ width: '72px', height: '72px', objectFit: 'cover', borderRadius: '8px', border: `1px solid ${cardBorder}`, cursor: 'zoom-in' }}
                  />
                ))}
              </div>
            )}
            <div style={{ fontSize: '13px', lineHeight: 1.6, wordBreak: 'break-word' }}>
              <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{msg.content}</ReactMarkdown>
            </div>
            {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
              <details style={{ marginTop: '8px' }}>
                <summary style={{ fontSize: '11px', fontWeight: 600, color: softTextColor, cursor: 'pointer' }}>
                  Sources ({msg.sources.length})
                </summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: '16px', fontSize: '11px', color: softTextColor }}>
                  {msg.sources.map((s, k) => <li key={k}>{s}</li>)}
                </ul>
              </details>
            )}
          </div>
        ))}

        {session.error && (
          <div role="alert" aria-live="assertive" style={{ backgroundColor: errorBg, border: `1px solid ${errorBorder}`, borderRadius: '14px', padding: '10px 14px', fontSize: '12px', color: errorColor }}>
            {session.error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </section>

      {/* ── FOOTER ── */}
      <footer style={footerStyle}>
        {/* Attachments */}
        {(attachments.pendingImages.length > 0 || attachments.pendingDocs.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            {attachments.pendingImages.map((img, i) => (
              <div key={`img-${i}`} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: inputBg, border: `1px solid ${inputBorder}`, borderRadius: '10px', padding: '4px 8px' }}>
                <img src={img.dataUrl} alt={img.name} style={{ width: '28px', height: '28px', objectFit: 'cover', borderRadius: '6px' }} />
                <span style={{ fontSize: '11px', color: softTextColor, maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.name}</span>
                <button type="button" onClick={() => attachments.removeImage(i)} aria-label={`Remove ${img.name}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: softTextColor, fontSize: '14px', lineHeight: 1, padding: 0 }}>×</button>
              </div>
            ))}
            {attachments.pendingDocs.map((doc, i) => (
              <div key={`doc-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: inputBg, border: `1px solid ${inputBorder}`, borderRadius: '10px', padding: '4px 8px' }}>
                <span style={{ fontSize: '11px', color: softTextColor, maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
                <button type="button" onClick={() => attachments.removeDoc(i)} aria-label={`Remove ${doc.name}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: softTextColor, fontSize: '14px', lineHeight: 1, padding: 0 }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Plus menu */}
        <div style={{ position: 'relative', marginBottom: '8px' }}>
          {plusOpen && (
            <div ref={plusMenuRef} style={{
              position: 'absolute', bottom: '100%', left: 0, marginBottom: '4px',
              backgroundColor: inputBg, border: `1px solid ${inputBorder}`, borderRadius: '14px',
              zIndex: 30, boxShadow: cardShadow, minWidth: '220px', maxHeight: '280px', overflowY: 'auto',
            }}>
              {tabs.length === 0 && (
                <div style={{ padding: '10px 12px', fontSize: '12px', color: softTextColor }}>No open tabs</div>
              )}
              {tabs.map((tab) => (
                <label key={tab.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', fontSize: '12px', color: inputColor, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={session.selectedTabIds.includes(tab.id!)}
                    onChange={() => session.toggleTab(tab.id!)}
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{tab.title || tab.url}</span>
                </label>
              ))}
              <div style={{ height: '1px', backgroundColor: inputBorder, margin: '4px 0' }} />

              {/* Page image thumbnails */}
              <button type="button" onClick={() => void attachments.loadPageImages()} style={menuItemStyle}>
                <span style={{ flex: 1 }}>From this page</span>
              </button>
              {attachments.pageImagesOpen && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '0 12px 8px' }}>
                  {attachments.pageImages.length === 0 && (
                    <span style={{ fontSize: '11px', color: softTextColor }}>No images found</span>
                  )}
                  {attachments.pageImages.map((img, j) => (
                    <button
                      key={j}
                      type="button"
                      title={img.alt || 'Attach image'}
                      aria-label={img.alt ? `Attach ${img.alt}` : 'Attach image'}
                      onClick={() => {
                        attachments.addPageImage(`page-${j + 1}.png`, img.dataUrl)
                        setPlusOpen(false)
                      }}
                      style={{ padding: 0, border: `1px solid ${inputBorder}`, borderRadius: '6px', background: 'none', cursor: 'pointer' }}
                    >
                      <img src={img.dataUrl} alt={img.alt} style={{ width: '44px', height: '44px', objectFit: 'cover', borderRadius: '6px', display: 'block' }} />
                    </button>
                  ))}
                </div>
              )}

              {/* Empty spacer line for tooltip */}
              <div style={{ height: '24px' }} />
              <div style={{ display: 'flex', gap: '10px', padding: '0 12px 8px' }}>
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  onMouseEnter={() => setHoverItem('image')}
                  onMouseLeave={() => setHoverItem(null)}
                  style={{ ...plusIconBtnStyle, position: 'relative' }}
                >
                  <img src="/icons/image.png" alt="Upload Image" width="20" height="20" style={{ objectFit: 'contain', filter: plusIconFilter }} />
                  {hoverItem === 'image' && <span style={tooltipStyle}>Upload Image</span>}
                </button>
                <button
                  type="button"
                  onClick={() => docInputRef.current?.click()}
                  onMouseEnter={() => setHoverItem('doc')}
                  onMouseLeave={() => setHoverItem(null)}
                  style={{ ...plusIconBtnStyle, position: 'relative' }}
                >
                  <img src="/icons/doc.png" alt="Upload Document" width="20" height="20" style={{ objectFit: 'contain', filter: plusIconFilter }} />
                  {hoverItem === 'doc' && <span style={tooltipStyle}>Upload Document</span>}
                </button>
                <button
                  type="button"
                  onClick={handleCaptureScreenshot}
                  onMouseEnter={() => setHoverItem('screenshot')}
                  onMouseLeave={() => setHoverItem(null)}
                  style={{ ...plusIconBtnStyle, position: 'relative' }}
                >
                  <img src="/icons/camera.png" alt="Screenshot" width="20" height="20" style={{ objectFit: 'contain', filter: plusIconFilter }} />
                  {hoverItem === 'screenshot' && <span style={tooltipStyle}>Screenshot</span>}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Input row */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <textarea
              value={session.input}
              onChange={(e) => session.setInput(e.target.value)}
              aria-label="Message"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Ask a question…"
              style={{ ...textareaStyle, paddingLeft: '40px' }}
            />
            <button
              ref={plusButtonRef}
              type="button"
              onClick={openAddMenu}
              title="Add attachments or context"
              aria-label="Add attachments or context"
              aria-expanded={plusOpen}
              style={{
                position: 'absolute', left: '8px', top: '8px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '24px', height: '24px', borderRadius: '8px',
                border: 'none', background: 'none', cursor: 'pointer', padding: 0,
              }}
            >
              <img src="/icons/plus.png" alt="Add" width="16" height="16" style={{ objectFit: 'contain', filter: imgFilter }} />
            </button>
          </div>
          <button
            type="button"
            onClick={session.isStreaming ? session.stopGeneration : handleSend}
            disabled={isDisabled}
            style={{
              flexShrink: 0,
              borderRadius: '14px',
              border: 'none',
              boxShadow: isDark ? '0 8px 18px rgba(0,0,0,0.5)' : '0 6px 14px rgba(0,0,0,0.18)',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              backgroundColor: isDisabled ? sendDisabledBg : sendBg,
              color: isDisabled ? sendDisabledColor : sendColor,
              fontFamily: 'inherit',
              transition: 'opacity 0.2s',
              alignSelf: 'flex-end',
            }}
          >
            {session.isStreaming ? 'Stop' : 'Send'}
          </button>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { attachments.addImages(e.target.files); e.target.value = '' }}
        />
        <input
          ref={docInputRef}
          type="file"
          accept=".pdf,.txt,.docx,.csv,.md"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { void handleAddDocs(e.target.files); e.target.value = '' }}
        />
      </footer>

      {/* ── HISTORY OVERLAY ── */}
      {session.historyOpen && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 50, background: bg,
          display: 'flex', flexDirection: 'column', padding: '12px', boxSizing: 'border-box',
        }} role="dialog" aria-modal="true" aria-labelledby="history-title">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h2 id="history-title" style={{ fontSize: '16px', fontWeight: 700, color: titleColor, margin: 0 }}>History</h2>
            <button type="button" onClick={() => session.setHistoryOpen(false)} aria-label="Close history" style={iconBtnStyle}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={inputColor} strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {session.historyList.length === 0 && <p style={{ color: softTextColor, fontSize: '13px', margin: 0 }}>No saved conversations yet.</p>}
            {session.historyList.map((s) => {
              const thumb = s.messages.map((m) => m.images?.[0]).find((img): img is string => !!img)
              return (
                <div key={s.id} style={{ backgroundColor: cardBg, border: `1px solid ${cardBorder}`, borderRadius: '14px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {thumb && (
                    <img src={thumb} alt="" style={{ width: '32px', height: '32px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
                  )}
                  <button
                    type="button"
                    onClick={() => session.loadHistorySession(s)}
                    style={{ flex: 1, background: 'none', border: 'none', color: inputColor, textAlign: 'left', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                    <div style={{ fontSize: '11px', color: softTextColor, marginTop: '2px' }}>{s.provider} · {s.model} · {new Date(s.updatedAt).toLocaleString()}</div>
                  </button>
                  <button type="button" onClick={() => void session.removeHistorySession(s.id!)} aria-label={`Delete ${s.title}`} style={{ background: 'none', border: 'none', color: softTextColor, cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: 0 }}>×</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── LIGHTBOX ── */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            backgroundColor: 'rgba(0,0,0,0.82)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'zoom-out', padding: '16px',
          }}
        >
          <img src={lightboxSrc} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '8px' }} />
        </div>
      )}

      {contextConsentOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 90, backgroundColor: 'rgba(0,0,0,0.56)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '18px',
        }} role="dialog" aria-modal="true" aria-labelledby="context-consent-title" aria-describedby="context-consent-description" onKeyDown={(event) => { if (event.key === 'Escape') setContextConsentOpen(false) }}>
          <div style={{
            width: '100%', maxWidth: '390px', backgroundColor: cardBg, border: `1px solid ${cardBorder}`,
            borderRadius: '24px', boxShadow: cardShadow, padding: '20px', color: inputColor, ...glassEffect,
          }}>
            <h2 id="context-consent-title" style={{ fontSize: '16px', margin: 0, color: titleColor }}>Use page context?</h2>
            <p id="context-consent-description" style={{ fontSize: '12px', lineHeight: 1.55, color: softTextColor, margin: '10px 0 16px' }}>
              Pagenova will read open-tab titles and URLs so you can choose context. It reads page content only for tabs you select, and sends that content only when you send a message to your selected AI provider.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setContextConsentOpen(false)} style={{ ...iconBtnStyle, width: 'auto', height: '36px', padding: '0 12px', color: inputColor, fontFamily: 'inherit', fontSize: '12px' }}>Not now</button>
              <button type="button" autoFocus onClick={acceptContextConsent} style={{ border: 'none', borderRadius: '12px', padding: '0 14px', minHeight: '36px', backgroundColor: sendBg, color: sendColor, cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: 600 }}>Allow page context</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
