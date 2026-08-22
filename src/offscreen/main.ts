import { pipeline, env } from '@huggingface/transformers'

const BROWSER_MODEL = 'Xenova/all-MiniLM-L6-v2'

type ExtractFn = (texts: string[], opts?: Record<string, unknown>) => Promise<{ tolist: () => unknown }>
let extractorPromise: Promise<ExtractFn> | null = null

// MV3 CSP blocks remote wasm/mjs; point onnxruntime at the bundled single-threaded runtime.
// Cache Storage cannot store chrome-extension:// requests, but direct fetch still works.
env.useWasmCache = false
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.wasmPaths = {
    mjs: chrome.runtime.getURL('transformers/ort-wasm-simd-threaded.asyncify.mjs'),
    wasm: chrome.runtime.getURL('transformers/ort-wasm-simd-threaded.asyncify.wasm'),
  }
}

function getExtractor(): Promise<ExtractFn> {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', BROWSER_MODEL, { device: 'wasm', dtype: 'q8' }) as unknown as Promise<ExtractFn>
  }
  return extractorPromise
}

function toRows(list: unknown): number[][] {
  return (Array.isArray(list) && list.length > 0 && typeof list[0] === 'number'
    ? [list as number[]]
    : list as number[][])
}

chrome.runtime.onMessage.addListener(
  (message: { type?: string; texts?: string[] }, _sender, sendResponse) => {
    if (message?.type !== 'EMBED_TEXTS' || !Array.isArray(message.texts)) return undefined
    void (async () => {
      try {
        const ex = await getExtractor()
        const output = await ex(message.texts!, { pooling: 'mean', normalize: true })
        sendResponse({ embeddings: toRows(output.tolist()) })
      } catch (error) {
        sendResponse({ error: error instanceof Error ? error.message : 'Embedding failed' })
      }
    })()
    return true
  },
)

// Signal the service worker that the listener is registered and ready to receive.
void chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' }).catch(() => {})
