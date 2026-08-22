const TARGET_TOKENS = 400
const OVERLAP_TOKENS = 50

// Approximate tokens without a real tokenizer. ASCII runs at ~chars/4, but CJK
// is ~1 token per character, so counting it at chars/4 under-budgets 4x and
// risks blowing the context window we're sizing against.
const CJK = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/g

function tokenEstimate(text: string): number {
  const cjk = (text.match(CJK) ?? []).length
  return Math.ceil(cjk + (text.length - cjk) / 4)
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function chunkText(text: string, targetTokens = TARGET_TOKENS, overlapTokens = OVERLAP_TOKENS): string[] {
  const sentences = splitSentences(text)
  const chunks: string[] = []
  let current = ''
  let overlap = ''

  for (const sentence of sentences) {
    if (!current) {
      current = sentence
      continue
    }
    const next = current + ' ' + sentence
    if (tokenEstimate(next) <= targetTokens) {
      current = next
      continue
    }

    chunks.push(current)
    // carry the trailing sentences as overlap for the next chunk
    const words = current.split(/\s+/)
    let tail = ''
    let i = words.length - 1
    while (i >= 0 && tokenEstimate(tail) < overlapTokens) {
      tail = words[i] + (tail ? ' ' + tail : '')
      i--
    }
    overlap = tail
    current = overlap ? overlap + ' ' + sentence : sentence
  }

  if (current) chunks.push(current)
  return chunks
}

export { tokenEstimate }
