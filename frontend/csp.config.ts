/**
 * Content-Security-Policy strings for the frontend.
 *
 * Production bundles (Vite build) do not use eval — keep prod CSP strict (no unsafe-eval).
 * Dev server (Vite HMR / React Fast Refresh) requires 'unsafe-eval' and ws: connect-src.
 *
 * Production CSP is injected at build time from VITE_API_URL (see vite.config.ts).
 * Empty VITE_API_URL → connect-src 'self' only (Ubuntu multi-tenant same-origin).
 * Render applies headers from render.yaml only if configured there; the build-time
 * meta tag is the primary source on Render when render.yaml has no CSP header.
 * public/_headers is for Netlify / Cloudflare Pages only.
 */

/**
 * Fallback API origins for Netlify/CF `_headers` / docs only.
 * Vite builds with empty VITE_API_URL use connect-src 'self' (same-origin multi-tenant).
 */
export const DEFAULT_PRODUCTION_API_ORIGINS = [
  'https://llamadas-backend.onrender.com',
  'https://api.tudominio.com',
]

export function normalizeApiOrigin(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

/** Read API origins for production CSP from env (Vite build / print script). */
export function getProductionApiOriginsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const origins: string[] = []

  const primary = env.VITE_API_URL?.trim()
  if (primary) origins.push(normalizeApiOrigin(primary))

  const extra = (env.VITE_CSP_EXTRA_ORIGINS ?? '')
    .split(',')
    .map(normalizeApiOrigin)
    .filter(Boolean)
  origins.push(...extra)

  // Empty = same-origin only ('self' in buildProductionCsp). Do not inject legacy hosts.
  return [...new Set(origins)]
}

export function buildProductionCsp(apiOrigins: string[]): string {
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

/** CSP for production static deploys (Netlify / Cloudflare Pages _headers). */
export const productionCsp = buildProductionCsp(DEFAULT_PRODUCTION_API_ORIGINS)

/**
 * CSP for local Vite dev only — unsafe-eval is required for HMR / React Fast Refresh.
 * ws: connect-src allows the Vite HMR websocket.
 */
export const devCsp =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  "connect-src 'self' ws://localhost:5173 ws://127.0.0.1:5173 http://localhost:3001 http://localhost:5173; " +
  "font-src 'self' data:"
