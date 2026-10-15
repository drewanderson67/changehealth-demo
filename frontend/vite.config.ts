import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: process.env.VITE_ALLOW_ALL_HOSTS === 'true' ? true : ['changehealth.reperiohealth.com'],
    proxy: {
      '/api': process.env.VITE_API_PROXY_TARGET || 'http://localhost:9001',
    },
  },
})
