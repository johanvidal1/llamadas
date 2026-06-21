import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { buildProductionCsp, devCsp, getProductionApiOriginsFromEnv } from './csp.config'

/** Injects CSP meta at build time from VITE_API_URL (custom domain support on Render). */
function productionCspPlugin(): Plugin {
  return {
    name: 'production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const csp = buildProductionCsp(getProductionApiOriginsFromEnv())
      const tag = `<meta http-equiv="Content-Security-Policy" content="${csp}" />`
      return html.replace('<head>', `<head>\n    ${tag}`)
    },
  }
}

export default defineConfig(({ command }) => ({
  plugins: [react(), productionCspPlugin()],
  server: {
    port: 5173,
    // Vite HMR / React Fast Refresh uses eval in dev — allow it via CSP response header.
    // Production CSP (no unsafe-eval) is injected at build from VITE_API_URL; see public/_headers for Netlify.
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
