import { useEffect, useState } from 'react'

function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    void chrome.storage.local.get(['uiTheme']).then((stored) => {
      if (stored.uiTheme === 'light' || stored.uiTheme === 'dark') {
        setTheme(stored.uiTheme)
      }
    })
  }, [])

  const backToSettings = async () => {
    await chrome.runtime.openOptionsPage()
    window.close()
  }

  const isDark = theme === 'dark'
  const bg = isDark
    ? 'radial-gradient(circle at 0 0, rgba(255,255,255,0.11), transparent 38%), radial-gradient(circle at 100% 100%, rgba(255,255,255,0.05), transparent 46%), #0d0d0d'
    : 'radial-gradient(circle at 0 0, rgba(255,255,255,0.98), transparent 38%), radial-gradient(circle at 100% 100%, rgba(176,176,176,0.32), transparent 48%), #e7e7e7'
  const cardBg = isDark ? 'rgba(29,29,29,0.72)' : 'rgba(255,255,255,0.58)'
  const cardBorder = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.74)'
  const cardShadow = isDark
    ? '26px 26px 34px rgba(0,0,0,0.66), inset -10px -10px 20px rgba(0,0,0,0.8), inset 0 16px 32px rgba(255,255,255,0.14)'
    : '24px 24px 38px rgba(67,67,67,0.24), inset -10px -10px 20px rgba(145,145,145,0.32), inset 0 16px 32px rgba(255,255,255,0.98)'
  const titleColor = isDark ? '#ffffff' : '#0f0f0f'
  const labelColor = isDark ? '#a0a0a0' : '#555555'
  const inputColor = isDark ? '#f2f2f2' : '#111111'
  const codeBg = isDark ? 'rgba(12,12,12,0.66)' : 'rgba(255,255,255,0.5)'
  const btnBg = isDark ? 'rgba(32,32,32,0.66)' : 'rgba(255,255,255,0.5)'
  const btnBorder = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.72)'
  const btnShadow = isDark
    ? '6px 6px 12px rgba(0,0,0,0.62), inset -4px -4px 8px rgba(0,0,0,0.76), inset 0 7px 14px rgba(255,255,255,0.11)'
    : '6px 6px 12px rgba(67,67,67,0.2), inset -4px -4px 8px rgba(154,154,154,0.26), inset 0 7px 14px rgba(255,255,255,0.98)'
  const linkColor = isDark ? '#fb923c' : '#c2410c'
  const glassEffect: React.CSSProperties = { backdropFilter: 'blur(16px) saturate(110%)' }

  const sectionStyle: React.CSSProperties = {
    backgroundColor: cardBg, border: `1px solid ${cardBorder}`,
    borderRadius: '24px', padding: '16px', boxShadow: cardShadow,
    display: 'flex', flexDirection: 'column', gap: '10px', ...glassEffect,
  }

  const h2Style: React.CSSProperties = {
    fontSize: '15px', fontWeight: 700, color: titleColor, margin: 0,
  }

  const codeStyle: React.CSSProperties = {
    display: 'block',
    backgroundColor: codeBg, color: inputColor,
    borderRadius: '8px', padding: '8px 12px',
    fontSize: '12px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  }

  const stepStyle: React.CSSProperties = {
    fontSize: '13px', color: labelColor, lineHeight: 1.7,
  }

  return (
    <div className={isDark ? 'theme-dark' : 'theme-light'} style={{
      width: '100%', minHeight: '100vh', background: bg,
      display: 'flex', justifyContent: 'center', padding: '24px 16px 48px',
      boxSizing: 'border-box',
      fontFamily: "'Noto Sans', 'Segoe UI', system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: '680px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src="/icons/logo.png" alt="Pagenova" style={{ height: '34px', width: 'auto', objectFit: 'contain' }} />
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: titleColor, margin: 0, letterSpacing: '-0.02em' }}>
              Help
            </h1>
          </div>
          <button
            type="button"
            onClick={() => void backToSettings()}
            title="Back to settings"
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
            Back to settings
          </button>
        </div>

        {/* Intro */}
        <div style={{ ...sectionStyle, marginBottom: '16px' }}>
          <p style={{ fontSize: '13px', color: labelColor, lineHeight: 1.7, margin: 0 }}>
            Pagenova chats with local models via <strong style={{ color: inputColor }}>Ollama</strong> and with cloud
            providers (OpenAI, Anthropic, Gemini, DeepSeek). To use a local model, set up Ollama below.
          </p>
        </div>

        {/* Ollama setup */}
        <div style={{ ...sectionStyle, marginBottom: '16px' }}>
          <h2 style={h2Style}>1. Install Ollama</h2>
          <p style={{ ...stepStyle, margin: 0 }}>
            Download and install Ollama for your OS from{' '}
            <a href="https://ollama.com/download" target="_blank" rel="noreferrer" style={{ color: linkColor }}>ollama.com/download</a>.
          </p>
        </div>

        <div style={{ ...sectionStyle, marginBottom: '16px' }}>
          <h2 style={h2Style}>2. Start Ollama with CORS enabled</h2>
          <p style={{ ...stepStyle, margin: 0 }}>
            The extension talks to Ollama from the browser, so it must allow requests from
            <code style={{ color: inputColor }}> chrome-extension://</code> origins. Stop Ollama if running, then set the
            origin shown in Pagenova Settings:
          </p>
          <code style={codeStyle}>chrome-extension://&lt;your-extension-id&gt;</code>
          <p style={{ ...stepStyle, margin: 0 }}>
            <code style={{ color: inputColor }}>"*"</code> also works but opens your local Ollama to <em>any</em> origin, so
            prefer the narrow value above. Multiple origins are comma-separated.
          </p>
          <p style={{ ...stepStyle, margin: 0 }}>Windows (set permanently, then restart the Ollama app):</p>
          <code style={codeStyle}>setx OLLAMA_ORIGINS "chrome-extension://&lt;your-extension-id&gt;"</code>
          <p style={{ ...stepStyle, margin: 0 }}>macOS / Linux (start Ollama with the variable):</p>
          <code style={codeStyle}>OLLAMA_ORIGINS="chrome-extension://&lt;your-extension-id&gt;" ollama serve</code>
        </div>

        <div style={{ ...sectionStyle, marginBottom: '16px' }}>
          <h2 style={h2Style}>3. Pull a model</h2>
          <p style={{ ...stepStyle, margin: 0 }}>
            In a terminal, pull a text model — browse the{' '}
            <a href="https://ollama.com/search" target="_blank" rel="noreferrer" style={{ color: linkColor }}>Ollama model library</a>:
          </p>
          <code style={codeStyle}>ollama pull llama3.1</code>
          <p style={{ ...stepStyle, margin: 0 }}>
            For image questions, pull a vision model — see the{' '}
            <a href="https://ollama.com/search?c=vision" target="_blank" rel="noreferrer" style={{ color: linkColor }}>Ollama vision models</a>:
          </p>
          <code style={codeStyle}>ollama pull llava</code>
        </div>

        <div style={{ ...sectionStyle, marginBottom: '16px' }}>
          <h2 style={h2Style}>4. Connect Pagenova</h2>
          <p style={{ ...stepStyle, margin: 0 }}>
            Open Pagenova settings and keep the default base URL{' '}
            <code style={{ color: inputColor }}>http://localhost:11434</code>, then press <strong style={{ color: inputColor }}>Test</strong>.
            Your pulled models appear in the model dropdown automatically.
          </p>
        </div>

        {/* Cloud providers */}
        <div style={sectionStyle}>
          <h2 style={h2Style}>Cloud providers</h2>
          <p style={{ ...stepStyle, margin: 0 }}>
            Paste your API key in the matching settings field. The provider only shows up in chat after a key is saved.
            For DeepSeek, set the base URL to <code style={{ color: inputColor }}>https://api.deepseek.com/v1</code>.
          </p>
          <p style={{ ...stepStyle, margin: 0 }}>Supported providers:</p>
          <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[
              ['OpenAI', 'https://platform.openai.com'],
              ['Anthropic (Claude)', 'https://console.anthropic.com'],
              ['Google Gemini', 'https://aistudio.google.com'],
              ['DeepSeek', 'https://platform.deepseek.com'],
              ['OpenRouter', 'https://openrouter.ai'],
              ['Groq', 'https://console.groq.com'],
              ['Mistral', 'https://console.mistral.ai'],
              ['xAI (Grok)', 'https://x.ai'],
              ['Moonshot (Kimi)', 'https://platform.moonshot.ai'],
              ['Zhipu (GLM)', 'https://open.bigmodel.cn'],
              ['Together AI', 'https://www.together.ai'],
              ['Fireworks AI', 'https://fireworks.ai'],
              ['vLLM / LM Studio (self-hosted)', 'https://lmstudio.ai'],
            ].map(([name, url]) => (
              <li key={name} style={{ fontSize: '13px', color: labelColor }}>
                <a href={url} target="_blank" rel="noreferrer" style={{ color: linkColor }}>{name}</a>
              </li>
            ))}
          </ul>
          <p style={{ ...stepStyle, margin: 0 }}>
            Most OpenAI-compatible providers work via the <strong style={{ color: inputColor }}>Other compatible</strong> option —
            just paste their base URL and API key.
          </p>
        </div>

      </div>
    </div>
  )
}

export default App
