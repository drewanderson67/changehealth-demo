import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  define: {
    __APP_VERSION__: JSON.stringify(new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')),
  },
  plugins: [react()],
  // pdfkit's browser build (~660 kB) is lazy-loaded only when a static-demo PDF is generated.
  build: { chunkSizeWarningLimit: 700 },
  resolve: {
    alias: {
      // Browser build of pdfkit, used by the static demo (src/demo/staticApi.ts).
      pdfkit: fileURLToPath(new URL('./node_modules/pdfkit/js/pdfkit.standalone.js', import.meta.url)),
    },
  },
  server: {
    allowedHosts: process.env.VITE_ALLOW_ALL_HOSTS === 'true' ? true : ['changehealth.reperiohealth.com'],
    proxy: {
      '/api': process.env.VITE_API_PROXY_TARGET || 'http://localhost:9001',
    },
  },
})
