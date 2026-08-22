import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import mammoth from 'mammoth'

const TEXT_EXTS = new Set(['txt', 'md', 'csv', 'log', 'json', 'js', 'ts', 'tsx', 'py', 'html', 'css'])
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
const MAX_DOCUMENT_CHARS = 1_000_000

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const doc = await pdfjsLib.getDocument({ data }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '))
  }
  return pages.join('\n')
}

async function extractDocxText(data: ArrayBuffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ arrayBuffer: data })
  return value
}

// Extracts plain text from supported documents (TXT/CSV/MD/code/PDF/DOCX).
// Returns null for unsupported types (e.g. legacy binary .doc).
export async function extractDocumentText(file: File): Promise<string | null> {
  if (file.size > MAX_DOCUMENT_BYTES) return null
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (TEXT_EXTS.has(ext)) {
    return (await file.text()).slice(0, MAX_DOCUMENT_CHARS)
  }
  if (ext === 'pdf') {
    try {
      return (await extractPdfText(await file.arrayBuffer())).slice(0, MAX_DOCUMENT_CHARS)
    } catch {
      return null
    }
  }
  if (ext === 'docx') {
    try {
      return (await extractDocxText(await file.arrayBuffer())).slice(0, MAX_DOCUMENT_CHARS)
    } catch {
      return null
    }
  }
  return null
}
