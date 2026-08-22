import { describe, expect, it } from 'vitest'

import { routeChatRequest } from './router'

describe('routeChatRequest', () => {
  it('answers exact-reply commands locally without calling a provider', async () => {
    const sent: unknown[] = []
    const port = { postMessage: (message: unknown) => sent.push(message) } as unknown as chrome.runtime.Port

    await routeChatRequest({
      type: 'CHAT_REQUEST',
      text: 'Reply exactly: Pagenova provider smoke test.',
      images: [{ base64: 'not-used', mimeType: 'image/png' }],
      history: [{ role: 'assistant', content: 'Ignored history.' }],
    }, port, 'test')

    expect(sent).toEqual([
      { type: 'CONTEXT_INFO', mode: 'full', sources: [], truncated: false },
      { type: 'CHAT_CHUNK', delta: 'Pagenova provider smoke test.' },
      { type: 'CHAT_DONE' },
    ])
  })
})
