import { useEffect, useState } from 'react'
import { clearAllChunks } from '../lib/rag/vectorStore'
import { clearAllSessions } from '../lib/storage/history'
import { DEFAULT_SYSTEM_PROMPT } from '../lib/prompt'
import { normalizeOpenAIBaseUrl } from '../lib/providers/openai'
import { providerErrorDetail } from '../lib/providers/errors'
import { getCredentials, saveCredentials } from '../lib/storage/credentials'

interface Settings {
  ollamaBaseUrl: string
  openaiApiKey: string
  anthropicApiKey: string
  geminiApiKey: string
  otherBaseUrl: string
  otherApiKey: string
  systemPrompt: string
  embeddingBackend: 'browser' | 'ollama'
  ollamaEmbeddingModel: string
  imageMaxEdge: number
  imageQuality: number
  alwaysCompress: boolean
  webSearchProvider: 'duckduckgo' | 'tavily'
  tavilyApiKey: string
}

const defaults: Settings = {
  ollamaBaseUrl: 'http://localhost:11434',
  openaiApiKey: '',
  anthropicApiKey: '',
  geminiApiKey: '',
  otherBaseUrl: '',
  otherApiKey: '',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  embeddingBackend: 'browser',
  ollamaEmbeddingModel: 'nomic-embed-text',
  imageMaxEdge: 1568,
  imageQuality: 0.8,
  alwaysCompress: false,
  webSearchProvider: 'duckduckgo',
  tavilyApiKey: '',
}

function App() {
  const [settings, setSettings] = useState<Settings>(defaults)
  const [status, setStatus] = useState('')
  const [testing, setTesting] = useState('')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [pullModel, setPullModel] = useState('')
  const [pullStatus, setPullStatus] = useState('')
  const [pullPercent, setPullPercent] = useState<number | null>(null)

  useEffect(() => {
    void Promise.all([
      chrome.storage.local.get([
        'ollamaBaseUrl', 'otherBaseUrl', 'systemPrompt', 'uiTheme',
        'embeddingBackend', 'ollamaEmbeddingModel',
        'imageMaxEdge', 'imageQuality', 'alwaysCompress', 'webSearchProvider',
      ]),
      getCredentials(),
    ]).then(([stored, credentials]) => {
      // Migrate the legacy placeholder to the full prompt; treat it as unset so
      // the current default wins without wiping the user's other settings.
      if (stored.systemPrompt === 'You are a concise, helpful browser assistant.') {
        delete stored.systemPrompt
      }
      setSettings({ ...defaults, ...stored, ...credentials } as Settings)
      if (stored.uiTheme === 'light' || stored.uiTheme === 'dark') {
        setTheme(stored.uiTheme)
      }
    })
  }, [])

  const update = (key: keyof Settings, value: string) => {
    setSettings((current) => ({ ...current, [key]: value }))
    setStatus('')
  }

  const save = async () => {
    const { openaiApiKey, anthropicApiKey, geminiApiKey, otherApiKey, tavilyApiKey, ...localSettings } = settings
    await Promise.all([
      chrome.storage.local.set(localSettings),
      saveCredentials({ openaiApiKey, anthropicApiKey, geminiApiKey, otherApiKey, tavilyApiKey }),
    ])
    setStatus('Settings saved. API keys clear when Chrome restarts ✓')
    setTimeout(() => setStatus(''), 2500)
  }

  const clearData = async () => {
    if (!confirm('Clear all stored data (settings, chat history, and index)?')) return
    await Promise.all([chrome.storage.local.clear(), chrome.storage.session.clear()])
    await Promise.all([clearAllChunks(), clearAllSessions()])
    setSettings(defaults)
    setStatus('Stored data cleared')
    setTimeout(() => setStatus(''), 2500)
  }

  const toggleTheme = async () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    await chrome.storage.local.set({ uiTheme: next })
  }

  const backToChat = async () => {
    const win = await chrome.windows.getCurrent()
    if (win.id != null) await chrome.sidePanel.open({ windowId: win.id })
    window.close()
  }

  const pullOllamaModel = (name?: string) => {
    const modelName = (name ?? pullModel).trim()
    if (!modelName) return
    setPullStatus('Pulling…')
    setPullPercent(null)
    const port = chrome.runtime.connect({ name: 'pull' })
    port.onMessage.addListener((m: { type?: string; status?: string; completed?: number; total?: number; error?: string }) => {
      if (m.type === 'PULL_MODEL_PROGRESS') {
        setPullStatus(m.status ?? '')
        if (m.total && m.completed != null) setPullPercent(Math.round((m.completed / m.total) * 100))
      }
      if (m.type === 'PULL_MODEL_DONE') {
        setPullStatus('Model pulled ✓')
        setPullPercent(null)
        port.disconnect()
      }
      if (m.type === 'PULL_MODEL_ERROR') {
        setPullStatus(m.error ?? 'Pull failed')
        setPullPercent(null)
        port.disconnect()
      }
    })
    port.postMessage({ type: 'PULL_MODEL', model: modelName })
  }

  const testConnection = async (provider: 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'other') => {
    setTesting(provider)
    setStatus('')
    try {
      const request = provider === 'other'
        ? {
            url: `${normalizeOpenAIBaseUrl(settings.otherBaseUrl)}/v1/models`,
            headers: { Authorization: `Bearer ${settings.otherApiKey}` },
          }
        : {
        ollama:    { url: `${settings.ollamaBaseUrl.replace(/\/$/, '')}/api/tags` },
        openai:    { url: 'https://api.openai.com/v1/models',     headers: { Authorization: `Bearer ${settings.openaiApiKey}` } },
        anthropic: { url: 'https://api.anthropic.com/v1/models',  headers: { 'x-api-key': settings.anthropicApiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } },
        gemini:    { url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(settings.geminiApiKey)}` },
          }[provider]
      const headers = ('headers' in request ? request.headers : undefined) as HeadersInit | undefined
      const response = await fetch(request.url, { headers })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}${await providerErrorDetail(response)}`)
      setStatus(`${provider} connection OK ✓`)
    } catch (error) {
      const message = provider === 'ollama' && error instanceof TypeError && error.message === 'Failed to fetch'
        ? `Unreachable. Start Ollama with: $env:OLLAMA_ORIGINS="chrome-extension://${chrome.runtime.id}"; ollama serve`
        : error instanceof Error ? error.message : 'Check URL / credentials'
      setStatus(`${provider}: ${message}`)
    } finally {
      setTesting('')
    }
  }

  // ── Design tokens (mirror ChatPanel) ────────────────────────────────────────
  const isDark = theme === 'dark'
  const bg = isDark
    ? 'radial-gradient(circle at 0 0, rgba(255,255,255,0.11), transparent 38%), radial-gradient(circle at 100% 100%, rgba(255,255,255,0.05), transparent 46%), #0d0d0d'
    : 'radial-gradient(circle at 0 0, rgba(255,255,255,0.98), transparent 38%), radial-gradient(circle at 100% 100%, rgba(176,176,176,0.32), transparent 48%), #e7e7e7'
  const cardBg     = isDark ? 'rgba(29,29,29,0.72)' : 'rgba(255,255,255,0.58)'
  const cardBorder = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.74)'
  const cardShadow = isDark
    ? '26px 26px 34px rgba(0,0,0,0.66), inset -10px -10px 20px rgba(0,0,0,0.8), inset 0 16px 32px rgba(255,255,255,0.14)'
    : '24px 24px 38px rgba(67,67,67,0.24), inset -10px -10px 20px rgba(145,145,145,0.32), inset 0 16px 32px rgba(255,255,255,0.98)'
  const titleColor    = isDark ? '#ffffff' : '#0f0f0f'
  const subtitleColor = isDark ? '#888888' : '#777777'
  const labelColor    = isDark ? '#a0a0a0' : '#555555'
  const inputBg     = isDark ? 'rgba(12,12,12,0.66)' : 'rgba(255,255,255,0.56)'
  const inputBorder = isDark ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.72)'
  const inputColor  = isDark ? '#f2f2f2' : '#111111'
  const btnBg       = isDark ? 'rgba(32,32,32,0.66)' : 'rgba(255,255,255,0.5)'
  const btnBorder   = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.72)'
  const btnShadow   = isDark
    ? '6px 6px 12px rgba(0,0,0,0.62), inset -4px -4px 8px rgba(0,0,0,0.76), inset 0 7px 14px rgba(255,255,255,0.11)'
    : '6px 6px 12px rgba(67,67,67,0.2), inset -4px -4px 8px rgba(154,154,154,0.26), inset 0 7px 14px rgba(255,255,255,0.98)'
  const primaryBg    = '#c2410c'
  const primaryColor = '#ffffff'
  const glassEffect: React.CSSProperties = { backdropFilter: 'blur(16px) saturate(110%)' }

  // ── Shared styles ────────────────────────────────────────────────────────────
  const fieldStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: inputBg,
    border: `1px solid ${inputBorder}`,
    borderRadius: '12px',
    color: inputColor,
    fontSize: '13px',
    padding: '8px 12px',
    outline: 'none',
    fontFamily: "'Noto Sans', 'Segoe UI', system-ui, sans-serif",
    boxSizing: 'border-box',
    ...glassEffect,
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: labelColor,
    marginBottom: '6px',
    display: 'block',
  }

  const sectionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  }

  return (
    <div className={isDark ? 'theme-dark' : 'theme-light'} style={{
      width: '100%',
      minHeight: '100vh',
      background: bg,
      display: 'flex',
      justifyContent: 'center',
      padding: '24px 16px 48px',
      boxSizing: 'border-box',
      fontFamily: "'Noto Sans', 'Segoe UI', system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: '620px' }}>

        {/* ── Page header ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <img src="/icons/logo.png" alt="Pagenova" style={{ height: '34px', width: 'auto', objectFit: 'contain' }} />
              <h1 style={{ fontSize: '24px', fontWeight: 700, color: titleColor, margin: 0, letterSpacing: '-0.02em' }}>
                Pagenova
              </h1>
            </div>
            <p style={{ fontSize: '12px', color: subtitleColor, margin: '8px 0 0' }}>
              Settings
            </p>
          </div>
          {/* Theme toggle + back to chat */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => void backToChat()}
              title="Back to chat"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                height: '36px', borderRadius: '12px', padding: '0 12px',
                border: `1px solid ${btnBorder}`, backgroundColor: btnBg,
                boxShadow: btnShadow, cursor: 'pointer', color: inputColor,
                fontSize: '12px', fontWeight: 500, fontFamily: 'inherit',
              }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to chat
            </button>
            <button
              type="button"
              onClick={() => void toggleTheme()}
              title={isDark ? 'Switch to Light mode' : 'Switch to Dark mode'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '36px', height: '36px', borderRadius: '12px',
                border: `1px solid ${btnBorder}`, backgroundColor: btnBg,
                boxShadow: btnShadow, cursor: 'pointer',
              }}
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
          </div>
        </div>

        {/* ── Info banner ──────────────────────────────────────────────────────── */}
        <div style={{
          backgroundColor: cardBg, border: `1px solid ${cardBorder}`,
          borderRadius: '20px', padding: '12px 14px', fontSize: '12px',
          color: labelColor, lineHeight: 1.6, boxShadow: cardShadow, marginBottom: '16px', ...glassEffect,
        }}>
          For <strong style={{ color: inputColor }}>Ollama</strong>, run{' '}
          <code style={{ color: inputColor, backgroundColor: isDark ? '#1e1e1e' : '#e8e8e8', borderRadius: '4px', padding: '1px 5px' }}>
            {`$env:OLLAMA_ORIGINS="chrome-extension://${chrome.runtime.id}"; ollama serve`}
          </code>. Cloud providers require their API key. "Other compatible" needs an HTTPS OpenAI-compatible base URL (HTTP is allowed only for localhost). API keys are stored only in this browser and sent solely to the provider you select.
        </div>

        {/* ── Settings card ────────────────────────────────────────────────────── */}
        <div style={{
          backgroundColor: cardBg, border: `1px solid ${cardBorder}`,
          borderRadius: '28px', padding: '20px', boxShadow: cardShadow,
          display: 'flex', flexDirection: 'column', gap: '18px', ...glassEffect,
        }}>

          {/* Ollama */}
          <div style={sectionStyle}>
            <span style={labelStyle}>Ollama base URL</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={settings.ollamaBaseUrl}
                onChange={(e) => update('ollamaBaseUrl', e.target.value)}
                aria-label="Ollama base URL"
                style={{ ...fieldStyle, flex: 1 }}
              />
              <button
                type="button"
                onClick={() => void testConnection('ollama')}
                disabled={testing === 'ollama'}
                style={{
                  flexShrink: 0, backgroundColor: btnBg, border: `1px solid ${btnBorder}`,
                  borderRadius: '12px', color: inputColor, fontSize: '12px',
                  fontWeight: 500, padding: '8px 14px', cursor: 'pointer',
                  boxShadow: btnShadow, fontFamily: 'inherit',
                }}
              >
                {testing === 'ollama' ? 'Testing…' : 'Test'}
              </button>
              <button
                type="button"
                onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('help.html') })}
                title="Ollama setup help"
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '36px', borderRadius: '12px', border: `1px solid ${btnBorder}`,
                  backgroundColor: btnBg, boxShadow: btnShadow, cursor: 'pointer',
                }}
              >
                <img src="/icons/help.png" alt="Help" width="16" height="16" style={{ objectFit: 'contain', filter: isDark ? 'invert(1) brightness(2)' : 'none' }} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <input
                value={pullModel}
                onChange={(e) => setPullModel(e.target.value)}
                aria-label="Model name to pull"
                placeholder="Model name to pull, e.g. llama3.2"
                style={{ ...fieldStyle, flex: 1 }}
              />
              <button
                type="button"
                onClick={() => pullOllamaModel()}
                disabled={!pullModel.trim()}
                style={{
                  flexShrink: 0, backgroundColor: btnBg, border: `1px solid ${btnBorder}`,
                  borderRadius: '12px', color: inputColor, fontSize: '12px',
                  fontWeight: 500, padding: '8px 14px', cursor: pullModel.trim() ? 'pointer' : 'not-allowed',
                  boxShadow: btnShadow, fontFamily: 'inherit', opacity: pullModel.trim() ? 1 : 0.5,
                }}
              >
                Pull
              </button>
            </div>
            {pullStatus && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ fontSize: '12px', color: labelColor, marginBottom: '4px' }}>{pullStatus}</div>
                {pullPercent != null && (
                  <div style={{ height: '6px', backgroundColor: inputBorder, borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pullPercent}%`, backgroundColor: primaryBg, borderRadius: '3px', transition: 'width 0.3s' }} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ height: '1px', backgroundColor: cardBorder }} />

          {/* OpenAI */}
          <span style={{ fontSize: '11px', color: labelColor, lineHeight: 1.5 }}>
            API keys stay only for this browser session and clear when Chrome restarts.
          </span>
          <div style={sectionStyle}>
            <span style={labelStyle}>OpenAI API key</span>
            <input type="password" value={settings.openaiApiKey} onChange={(e) => update('openaiApiKey', e.target.value)} aria-label="OpenAI API key" style={fieldStyle} />
          </div>

          {/* Anthropic */}
          <div style={sectionStyle}>
            <span style={labelStyle}>Anthropic API key</span>
            <input type="password" value={settings.anthropicApiKey} onChange={(e) => update('anthropicApiKey', e.target.value)} aria-label="Anthropic API key" style={fieldStyle} />
          </div>

          {/* Gemini */}
          <div style={sectionStyle}>
            <span style={labelStyle}>Google Gemini API key</span>
            <input type="password" value={settings.geminiApiKey} onChange={(e) => update('geminiApiKey', e.target.value)} aria-label="Google Gemini API key" style={fieldStyle} />
          </div>

          {/* Divider */}
          <div style={{ height: '1px', backgroundColor: cardBorder }} />

          {/* Other base URL */}
          <div style={sectionStyle}>
            <span style={labelStyle}>Other compatible API base URL</span>
            <input
              value={settings.otherBaseUrl}
              onChange={(e) => update('otherBaseUrl', e.target.value)}
              aria-label="Other compatible API base URL"
              placeholder="https://api.deepseek.com"
              style={fieldStyle}
            />
          </div>

          {/* Other API key */}
          <div style={sectionStyle}>
            <span style={labelStyle}>Other compatible API key</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="password" value={settings.otherApiKey} onChange={(e) => update('otherApiKey', e.target.value)} aria-label="Other compatible API key" style={{ ...fieldStyle, flex: 1 }} />
              <button
                type="button"
                onClick={() => void testConnection('other')}
                disabled={testing === 'other'}
                style={{
                  flexShrink: 0, backgroundColor: btnBg, border: `1px solid ${btnBorder}`,
                  borderRadius: '12px', color: inputColor, fontSize: '12px',
                  fontWeight: 500, padding: '8px 14px', cursor: 'pointer',
                  boxShadow: btnShadow, fontFamily: 'inherit',
                }}
              >
                {testing === 'other' ? 'Testing…' : 'Test'}
              </button>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', backgroundColor: cardBorder }} />

          {/* System prompt */}
          <div style={sectionStyle}>
            <span style={labelStyle}>Default system prompt</span>
            <textarea
              value={settings.systemPrompt}
              onChange={(e) => update('systemPrompt', e.target.value)}
              aria-label="Default system prompt"
              style={{ ...fieldStyle, minHeight: '90px', resize: 'vertical' }}
            />
            <span style={{ fontSize: '11px', color: labelColor, marginTop: '6px', lineHeight: 1.5 }}>
              Sent before every request. Local Ollama models use a shorter variant of the default prompt to conserve their context window; a prompt you edit here is used verbatim for all providers.
            </span>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', backgroundColor: cardBorder }} />

          {/* Embedding backend (RAG) */}
          <div style={sectionStyle}>
            <span style={labelStyle}>Embedding backend (RAG)</span>
            <select
              value={settings.embeddingBackend}
              onChange={(e) => update('embeddingBackend', e.target.value)}
              aria-label="Embedding backend"
              style={fieldStyle}
            >
              <option value="browser">In-browser (Transformers.js)</option>
              <option value="ollama">Ollama</option>
            </select>
            {settings.embeddingBackend === 'ollama' && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <input
                  value={settings.ollamaEmbeddingModel}
                  onChange={(e) => update('ollamaEmbeddingModel', e.target.value)}
                  aria-label="Ollama embedding model"
                  placeholder="nomic-embed-text"
                  style={{ ...fieldStyle, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => pullOllamaModel(settings.ollamaEmbeddingModel)}
                  disabled={!settings.ollamaEmbeddingModel.trim()}
                  style={{
                    flexShrink: 0, backgroundColor: btnBg, border: `1px solid ${btnBorder}`,
                    borderRadius: '12px', color: inputColor, fontSize: '12px',
                    fontWeight: 500, padding: '8px 14px', cursor: settings.ollamaEmbeddingModel.trim() ? 'pointer' : 'not-allowed',
                    boxShadow: btnShadow, fontFamily: 'inherit', opacity: settings.ollamaEmbeddingModel.trim() ? 1 : 0.5,
                  }}
                >
                  Pull
                </button>
              </div>
            )}
            <span style={{ fontSize: '11px', color: labelColor, marginTop: '6px', lineHeight: 1.5 }}>
              Powers cross-tab and document retrieval. In-browser downloads a small model on first use; Ollama uses the chosen embedding model. Changing the backend does not re-index existing content — re-upload documents or clear stored data to rebuild the index.
            </span>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', backgroundColor: cardBorder }} />

          {/* Image handling */}
          <div style={sectionStyle}>
            <span style={labelStyle}>Image handling</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: inputColor, flexShrink: 0, width: '80px' }}>Max edge</span>
              <input
                type="number"
                min="256"
                max="4096"
                value={settings.imageMaxEdge}
                onChange={(e) => setSettings((c) => ({ ...c, imageMaxEdge: Number(e.target.value) }))}
                aria-label="Maximum image edge in pixels"
                style={{ ...fieldStyle, width: '90px' }}
              />
              <span style={{ fontSize: '12px', color: labelColor }}>px</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: inputColor, flexShrink: 0, width: '80px' }}>JPEG quality</span>
              <input
                type="range"
                min="0.5"
                max="1"
                step="0.05"
                value={settings.imageQuality}
                onChange={(e) => setSettings((c) => ({ ...c, imageQuality: Number(e.target.value) }))}
                aria-label="JPEG quality"
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: '12px', color: labelColor, width: '34px', textAlign: 'right' }}>{settings.imageQuality.toFixed(2)}</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: inputColor, cursor: 'pointer', marginTop: '4px' }}>
              <input
                type="checkbox"
                checked={settings.alwaysCompress}
                onChange={(e) => setSettings((c) => ({ ...c, alwaysCompress: e.target.checked }))}
              />
              Always re-encode images (compress even when under max size)
            </label>
            <span style={{ fontSize: '11px', color: labelColor, marginTop: '6px', lineHeight: 1.5 }}>
              Images larger than the max edge are downscaled to JPEG at this quality before sending. Smaller images pass through untouched unless "always re-encode" is on.
            </span>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', backgroundColor: cardBorder }} />

          {/* Web search */}
          <div style={sectionStyle}>
            <span style={labelStyle}>Web search</span>
            <select
              value={settings.webSearchProvider}
              onChange={(e) => update('webSearchProvider', e.target.value)}
              aria-label="Web search provider"
              style={fieldStyle}
            >
              <option value="duckduckgo">DuckDuckGo web results (free, no key)</option>
              <option value="tavily">Tavily (full web results)</option>
            </select>
            {settings.webSearchProvider === 'tavily' && (
              <>
                <input
                  type="password"
                  value={settings.tavilyApiKey}
                  onChange={(e) => update('tavilyApiKey', e.target.value)}
                  aria-label="Tavily API key"
                  placeholder="Tavily API key (tvly-…)"
                  style={{ ...fieldStyle, marginTop: '8px' }}
                />
                <span style={{ fontSize: '11px', color: labelColor, marginTop: '6px', lineHeight: 1.5 }}>
                  Full search results, grounded citations, and an extracted answer. Get a free key at{' '}
                  <a href="https://app.tavily.com" target="_blank" rel="noreferrer" style={{ color: inputColor }}>app.tavily.com</a>.
                  Without a key, search falls back to DuckDuckGo web results.
                </span>
              </>
            )}
            {settings.webSearchProvider === 'duckduckgo' && (
              <span style={{ fontSize: '11px', color: labelColor, marginTop: '6px', lineHeight: 1.5 }}>
                Search results with titles, snippets, and links. It is free and needs no key. Switch to Tavily for an extracted answer and additional search controls.
              </span>
            )}
          </div>
        </div>

        {/* ── Action bar ───────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => void save()}
            style={{
              backgroundColor: primaryBg, color: primaryColor,
              border: 'none', borderRadius: '12px',
              boxShadow: isDark ? '0 8px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)' : '0 6px 14px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.7)',
              padding: '10px 20px', fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Save settings
          </button>
          <button
            type="button"
            onClick={() => void clearData()}
            style={{
              backgroundColor: 'transparent',
              border: `1px solid ${isDark ? '#7f1d1d' : '#fca5a5'}`,
              borderRadius: '12px', color: isDark ? '#fca5a5' : '#b91c1c',
              padding: '10px 20px', fontSize: '13px', fontWeight: 500,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Clear stored data
          </button>
          {status && (
            <span role="status" aria-live="polite" style={{ fontSize: '12px', color: isDark ? '#a0a0a0' : '#555555' }}>
              {status}
            </span>
          )}
        </div>

      </div>
    </div>
  )
}

export default App
