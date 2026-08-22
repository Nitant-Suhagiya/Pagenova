import { describe, expect, it } from 'vitest'
import { providerErrorDetail } from './errors'

describe('providerErrorDetail', () => {
  it('returns a bounded provider message from standard error payloads', async () => {
    const response = new Response(JSON.stringify({ error: { message: 'model access denied' } }), { status: 403 })
    await expect(providerErrorDetail(response)).resolves.toBe(': model access denied')
  })
})
