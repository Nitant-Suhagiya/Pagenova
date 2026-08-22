import { describe, expect, it } from 'vitest'

import { extractDocumentText, MAX_DOCUMENT_BYTES } from './documents'

describe('extractDocumentText', () => {
  it('rejects oversized documents before reading them', async () => {
    const file = new File(['small'], 'large.txt', { type: 'text/plain' })
    Object.defineProperty(file, 'size', { value: MAX_DOCUMENT_BYTES + 1 })

    await expect(extractDocumentText(file)).resolves.toBeNull()
  })

  it('keeps supported text documents', async () => {
    await expect(extractDocumentText(new File(['hello'], 'notes.txt'))).resolves.toBe('hello')
  })
})
