import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
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
