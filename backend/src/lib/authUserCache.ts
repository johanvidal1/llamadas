type AuthUserRecord = {
  id: string
  email: string
  role: string
  name: string
  active: boolean
  isSuperAdmin: boolean
  isSystemOwner: boolean
  tokenVersion: number
  tenantId: string
}

type CacheEntry = {
  user: AuthUserRecord
  expiresAt: number
}

const AUTH_USER_CACHE_TTL_MS = Number(process.env.AUTH_USER_CACHE_TTL_MS ?? 60_000)
const cache = new Map<string, CacheEntry>()

function cacheKey(userId: string, tokenVersion: number): string {
  return `${userId}:${tokenVersion}`
}

export function getCachedAuthUser(
  userId: string,
  tokenVersion: number
): AuthUserRecord | null {
  const key = cacheKey(userId, tokenVersion)
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.user
}

export function setCachedAuthUser(user: AuthUserRecord): void {
  cache.set(cacheKey(user.id, user.tokenVersion), {
    user,
    expiresAt: Date.now() + AUTH_USER_CACHE_TTL_MS,
  })
  if (cache.size > 500) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}

export function invalidateAuthUserCache(userId: string): void {
  const prefix = `${userId}:`
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key)
  }
}
