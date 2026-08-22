import { ChatPanel } from '../sidepanel/ChatPanel'

function App() {
  // Full-page layout — no card block, fills viewport like the settings page
  return (
    <div style={{ width: '100%', minHeight: '100vh', backgroundColor: '#0a0a0a' }}>
      <ChatPanel />
    </div>
  )
}

export default App
