import { writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const distDir = resolve(process.cwd(), 'dist')
const manifestPath = resolve(distDir, 'manifest.json')
const loaderPath = resolve(distDir, 'service-worker-loader.js')

if (existsSync(distDir) && existsSync(manifestPath) && existsSync(loaderPath)) {
  const assetsDir = resolve(distDir, 'assets')

  import('node:fs').then(({ readdirSync }) => {
    const files = readdirSync(assetsDir)
    const backgroundChunk = files.find(f => f.startsWith('index.ts-'))

    if (backgroundChunk) {
      const loaderContent = `import './assets/${backgroundChunk}';\n`
      writeFileSync(loaderPath, loaderContent, 'utf8')
      console.log(`[postbuild] Fixed service-worker-loader.js -> ./assets/${backgroundChunk}`)
    }
  })
}
