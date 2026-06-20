import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { devCsp } from './csp.config'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    // Vite HMR / React Fast Refresh uses eval in dev — allow it via CSP response header.
    // Production CSP (no unsafe-eval) is set in render.yaml and public/_headers.
    headers:
      command === 'serve'
        ? { 'Content-Security-Policy': devCsp }
        : undefined,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
}))
