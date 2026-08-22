import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json' with { type: 'json' }
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        assetFileNames: (asset) => asset.name === 'ort-wasm-simd-threaded.asyncify.wasm'
          ? 'transformers/[name][extname]'
          : 'assets/[name]-[hash][extname]',
      },
      input: {
        webui: resolve(import.meta.dirname, 'webui.html'),
        help: resolve(import.meta.dirname, 'help.html'),
        offscreen: resolve(import.meta.dirname, 'offscreen.html'),
      },
    },
  },
})
