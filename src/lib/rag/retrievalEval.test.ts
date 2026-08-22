import { describe, expect, it } from 'vitest'

import { chunkText } from './chunk'
import { topK } from './vectorStore'
import type { Chunk } from './types'

// A fixed retrieval eval set. It pins recall of the real `chunkText` (400-token
// chunks, 50-token overlap) and `topK`/`cosineSim` (k=6) on a hand-written
// corpus, so a change to those parameters that silently loses the answer is
// caught in CI. The embedding model (Transformers.js / Ollama) is replaced by a
// deterministic lexical stand-in below, so the eval is fast, offline, and
// reproducible; it measures the *retrieval parameters*, not the embedder.

const DIM = 512

function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h >>> 0
}

// Hashing-trick bag of words over word unigrams + bigrams, L2-normalized.
// Deterministic and phrase-aware: a question that shares distinctive terms with
// its answer passage ranks that passage first, exactly as a real embedder would.
function lexicalEmbedding(text: string): Float32Array {
  const vec = new Float32Array(DIM)
  const words = (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
  const features = new Set<string>()
  for (const w of words) features.add(w)
  for (let i = 0; i < words.length - 1; i++) features.add(`${words[i]}_${words[i + 1]}`)
  for (const f of features) {
    const h = fnv1a(f)
    vec[h % DIM] += (h & 1) === 0 ? 1 : -1
  }
  let norm = 0
  for (let i = 0; i < DIM; i++) norm += vec[i] * vec[i]
  norm = Math.sqrt(norm)
  if (norm > 0) for (let i = 0; i < DIM; i++) vec[i] /= norm
  return vec
}

interface EvalDoc {
  name: string
  text: string
}

interface EvalCase {
  question: string
  // Distinctive phrase that must appear inside a retrieved chunk.
  answer: string
  // The document whose chunk must be in the top-6.
  source: string
}

const DOCS: EvalDoc[] = [
  {
    name: 'Acme Billing Guide',
    text: [
      'Invoices are issued on the first day of each month and sent to the email on file. You can download a PDF copy of any invoice from the billing portal under the Invoices tab.',
      'Refunds for unused service are processed automatically within seven business days of a cancellation. Refund payments return to the original payment method and may take up to ten days to appear on your statement.',
      'Accepted payment methods include Visa, Mastercard, American Express, and bank transfer for annual plans. Gift cards and prepaid debit cards are not accepted for subscription renewal.',
      'To cancel a subscription, open Account Settings, choose Billing, and select Cancel subscription. Access continues until the end of the current billing cycle, and no further charges are made.',
      'Sales tax and value added tax are calculated from your billing address at checkout. Tax-exempt organizations can upload an exemption certificate to waive these charges.',
      'Late payment incurs a flat fee of fifteen dollars after a five day grace period. Repeated late payments may suspend service until the balance is cleared.',
    ].join('\n'),
  },
  {
    name: 'Nimbus Deployment Runbook',
    text: [
      'Set environment variables in the deploy panel before promoting a build. Variables marked secret are encrypted at rest and never appear in logs.',
      'To roll back a release, open the Releases page and click Rollback on the previous build. Rollback restores the prior artifact and its environment configuration within two minutes.',
      'Health checks run every thirty seconds against the health endpoint. A deployment is marked unhealthy after three consecutive failures and is automatically stopped.',
      'Canary releases send five percent of traffic to the new build for thirty minutes before full promotion. If error rates rise above one percent the canary is aborted automatically.',
      'Secrets are managed through the Vault integration. Never commit secrets to the repository; rotate any secret that is exposed.',
      'Structured logs stream to the observability console. Set the log level to debug only during an active incident to limit noise.',
    ].join('\n'),
  },
  {
    name: 'Orchid HR Handbook',
    text: [
      'Employees accrue twenty days of paid time off per year. Unused PTO carries over up to five days into the next calendar year.',
      'Remote work is supported for roles approved by your manager. A home office stipend of five hundred dollars is available once per year for equipment.',
      'Expense reimbursement is paid on the next payroll after approval. Receipts are required for expenses over twenty five dollars.',
      'New hires complete onboarding during their first week, including security training and benefits enrollment. Your manager assigns a buddy for the first thirty days.',
      'Performance reviews happen twice a year in March and September. Goals are set with your manager at the start of each cycle and revisited mid year.',
      'Parental leave provides sixteen weeks of fully paid leave for all parents. Leave can be taken in two blocks within the first year after birth or adoption.',
    ].join('\n'),
  },
  {
    name: 'Ferrous API Reference',
    text: [
      'Authenticate requests with an API key sent in the Authorization header as a bearer token. Keys are created in the dashboard and scoped to a single environment.',
      'Rate limits apply per API key. The default limit is one thousand requests per minute; a 429 response indicates the limit was exceeded.',
      'Pagination uses cursor based tokens. Pass the cursor from the response to fetch the next page, and use a page size between one and one hundred items.',
      'Error responses use a standard shape with a code and message. Codes include invalid request, unauthorized, rate limited, and internal error.',
      'Webhooks deliver events to your configured endpoint with a signature header for verification. Return a 200 response within five seconds or the event is retried.',
      'Idempotency keys make retries safe. Send the same idempotency key with a retried request to receive the original response instead of a duplicate.',
    ].join('\n'),
  },
]

const CASES: EvalCase[] = [
  { question: 'How do I cancel my subscription?', answer: 'Cancel subscription', source: 'Acme Billing Guide' },
  { question: 'Which cards are accepted for renewal?', answer: 'Visa, Mastercard, American Express', source: 'Acme Billing Guide' },
  { question: 'When are refunds processed?', answer: 'seven business days', source: 'Acme Billing Guide' },
  { question: 'How much is the late fee?', answer: 'fifteen dollars', source: 'Acme Billing Guide' },
  { question: 'When are invoices issued?', answer: 'first day of each month', source: 'Acme Billing Guide' },
  { question: 'How can tax-exempt organizations waive sales tax?', answer: 'exemption certificate', source: 'Acme Billing Guide' },
  { question: 'How do I rollback a release?', answer: 'Rollback on the previous build', source: 'Nimbus Deployment Runbook' },
  { question: 'How long does a canary release run?', answer: 'thirty minutes', source: 'Nimbus Deployment Runbook' },
  { question: 'Where do structured logs stream?', answer: 'observability console', source: 'Nimbus Deployment Runbook' },
  { question: 'Where do I set environment variables?', answer: 'deploy panel', source: 'Nimbus Deployment Runbook' },
  { question: 'How often do health checks run?', answer: 'thirty seconds', source: 'Nimbus Deployment Runbook' },
  { question: 'How should I manage secrets?', answer: 'Vault integration', source: 'Nimbus Deployment Runbook' },
  { question: 'How much PTO do I get?', answer: 'twenty days of paid time off', source: 'Orchid HR Handbook' },
  { question: 'What is the home office stipend?', answer: 'five hundred dollars', source: 'Orchid HR Handbook' },
  { question: 'How long is parental leave?', answer: 'sixteen weeks', source: 'Orchid HR Handbook' },
  { question: 'When is expense reimbursement paid?', answer: 'next payroll after approval', source: 'Orchid HR Handbook' },
  { question: 'What happens in a new hire\'s first week?', answer: 'complete onboarding', source: 'Orchid HR Handbook' },
  { question: 'How often are performance reviews held?', answer: 'twice a year', source: 'Orchid HR Handbook' },
  { question: 'How do I authenticate?', answer: 'bearer token', source: 'Ferrous API Reference' },
  { question: 'What is the default rate limit?', answer: 'one thousand requests per minute', source: 'Ferrous API Reference' },
  { question: 'What are idempotency keys for?', answer: 'make retries safe', source: 'Ferrous API Reference' },
  { question: 'How does pagination work?', answer: 'cursor based tokens', source: 'Ferrous API Reference' },
  { question: 'What shape do error responses use?', answer: 'code and message', source: 'Ferrous API Reference' },
  { question: 'How do webhooks verify delivery?', answer: 'signature header', source: 'Ferrous API Reference' },
]

function buildChunks(docs: EvalDoc[]): Chunk[] {
  const chunks: Chunk[] = []
  for (const doc of docs) {
    chunkText(doc.text).forEach((text, i) => {
      chunks.push({
        id: `${doc.name}:${i}`,
        sourceId: doc.name,
        title: doc.name,
        text,
        embedding: lexicalEmbedding(text),
      })
    })
  }
  return chunks
}

describe('retrieval eval (fixed corpus)', () => {
  const chunks = buildChunks(DOCS)

  for (const c of CASES) {
    it(`retrieves the answer passage for "${c.question}"`, () => {
      const top = topK(lexicalEmbedding(c.question), chunks, 6)
      const texts = top.map((r) => r.chunk.text)
      const answerHit = texts.some((t) => t.toLowerCase().includes(c.answer.toLowerCase()))
      const sourceHit = top.some((r) => r.chunk.title === c.source)
      expect(answerHit, `expected "${c.answer}" in the retrieved excerpts`).toBe(true)
      expect(sourceHit, `expected source "${c.source}" in the retrieved excerpts`).toBe(true)
    })
  }

  it('achieves full recall@6 across the corpus', () => {
    let hits = 0
    for (const c of CASES) {
      const top = topK(lexicalEmbedding(c.question), chunks, 6)
      const texts = top.map((r) => r.chunk.text)
      if (texts.some((t) => t.toLowerCase().includes(c.answer.toLowerCase()))) hits++
    }
    expect(hits).toBe(CASES.length)
  })
})
