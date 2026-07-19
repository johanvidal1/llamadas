/**
 * Prints the production CSP string for manual sync (Netlify _headers, etc.).
 *
 * Usage:
 *   VITE_API_URL=https://api.tudominio.com node scripts/print-production-csp.mjs
 *   VITE_API_URL=https://api.tudominio.com VITE_CSP_EXTRA_ORIGINS=https://llamadas-backend.onrender.com node scripts/print-production-csp.mjs
 *   node scripts/print-production-csp.mjs   # empty VITE_API_URL → connect-src 'self' only
 *
 * On Render, CSP is injected automatically at build from VITE_API_URL — this script
 * is mainly for Netlify / Cloudflare Pages public/_headers.
 * Ubuntu multi-tenant builds leave VITE_API_URL empty (same-origin /api).
 */

function normalizeApiOrigin(url) {
  return url.trim().replace(/\/+$/, '')
}

function getProductionApiOriginsFromEnv(env) {
  const origins = []

  const primary = env.VITE_API_URL?.trim()
  if (primary) origins.push(normalizeApiOrigin(primary))

  const extra = (env.VITE_CSP_EXTRA_ORIGINS ?? '')
    .split(',')
    .map(normalizeApiOrigin)
    .filter(Boolean)
  origins.push(...extra)

  return [...new Set(origins)]
}

function buildProductionCsp(apiOrigins) {
  const connectSrc = ["'self'", ...apiOrigins].join(' ')
  return (
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    `connect-src ${connectSrc}; ` +
    "font-src 'self' data:"
  )
}

const csp = buildProductionCsp(getProductionApiOriginsFromEnv(process.env))
console.log(csp)
