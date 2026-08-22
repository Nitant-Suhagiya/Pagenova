import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const dist = resolve(process.cwd(), 'dist')
const required = [
  'manifest.json', 'service-worker-loader.js', 'sidepanel.html', 'webui.html', 'options.html', 'help.html', 'offscreen.html',
  'transformers/ort-wasm-simd-threaded.asyncify.mjs', 'transformers/ort-wasm-simd-threaded.asyncify.wasm',
]

for (const file of required) {
  if (!existsSync(resolve(dist, file))) throw new Error(`Build is missing dist/${file}`)
}

const manifest = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8'))
if (manifest.background?.service_worker !== 'service-worker-loader.js') {
  throw new Error('Build has an unexpected background service worker entry.')
}

const loader = readFileSync(resolve(dist, 'service-worker-loader.js'), 'utf8')
const match = loader.match(/^import '\.\/assets\/([^']+)';\s*$/)
if (!match || !existsSync(resolve(dist, 'assets', match[1]))) {
  throw new Error('Build service-worker loader does not reference a bundled background asset.')
}

if (readdirSync(resolve(dist, 'assets')).some((file) => file.startsWith('ort-wasm-') && file.endsWith('.wasm'))) {
  throw new Error('Build contains a duplicate ONNX runtime asset.')
}

if (readdirSync(resolve(dist, 'assets')).some((file) => file.endsWith('.js')
  && readFileSync(resolve(dist, 'assets', file), 'utf8').includes('browser-only'))) {
  throw new Error('Build resolved a Node-only Transformers.js dependency.')
}

console.log('dist preflight: OK')
