/**
 * Content-Security-Policy strings for the frontend.
 *
 * Production bundles (Vite build) do not use eval — keep prod CSP strict (no unsafe-eval).
 * Dev server (Vite HMR / React Fast Refresh) requires 'unsafe-eval' and ws: connect-src.
 *
 * Render applies headers from render.yaml (not public/_headers).
 * public/_headers is for Netlify / Cloudflare Pages only.
 */

/** CSP for production static deploys (Render, Netlify, Cloudflare Pages). */
export const productionCsp =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  "connect-src 'self' https://llamadas-backend.onrender.com; " +
  "font-src 'self' data:"

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
