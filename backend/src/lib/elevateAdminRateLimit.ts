/** Simple in-memory rate limit for elevate-admin (per agent + tenant). */

type Bucket = { count: number; resetAt: number }

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 8

const buckets = new Map<string, Bucket>()

function key(tenantId: string, agentId: string): string {
  return `${tenantId}:${agentId}`
}

export function checkElevateRateLimit(
  tenantId: string,
  agentId: string
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now()
  const k = key(tenantId, agentId)
  const existing = buckets.get(k)
  if (!existing || existing.resetAt <= now) {
    buckets.set(k, { count: 0, resetAt: now + WINDOW_MS })
    return { ok: true }
  }
  if (existing.count >= MAX_ATTEMPTS) {
    return { ok: false, retryAfterSec: Math.ceil((existing.resetAt - now) / 1000) }
  }
  return { ok: true }
}

export function recordElevateAttempt(tenantId: string, agentId: string, success: boolean): void {
  const now = Date.now()
  const k = key(tenantId, agentId)
  if (success) {
    buckets.delete(k)
    return
  }
  const existing = buckets.get(k)
  if (!existing || existing.resetAt <= now) {
    buckets.set(k, { count: 1, resetAt: now + WINDOW_MS })
    return
  }
  existing.count += 1
}
