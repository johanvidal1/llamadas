import fs from 'fs/promises'
import path from 'path'

export const MAX_PROMO_IMAGES = 4
export const MAX_TEMPLATE_IMAGE_BYTES = 5 * 1024 * 1024

const TENANT_ID_RE = /^[A-Za-z0-9_-]+$/

export function imageExt(mime: string, filename: string): '.jpg' | '.png' | null {
  const fromMime =
    mime === 'image/png' ? '.png' : mime === 'image/jpeg' || mime === 'image/jpg' ? '.jpg' : null
  const fromName = /\.png$/i.test(filename) ? '.png' : /\.jpe?g$/i.test(filename) ? '.jpg' : null
  if (fromMime && fromName && fromMime !== fromName) return null
  return fromMime ?? fromName
}

export function quoteTenantRoot(tenantId: string): string {
  return path.resolve(process.cwd(), 'uploads', 'quotes', tenantId)
}

export function toStoredPath(...parts: string[]): string {
  return path.join(...parts).replace(/\\/g, '/')
}

/** Absolute path only inside uploads/quotes/{tenantId}. Rejects traversal and remote URLs. */
export function resolveQuoteFile(tenantId: string, relativePath: string | null | undefined): string | null {
  if (!relativePath || !TENANT_ID_RE.test(tenantId)) return null
  const normalized = relativePath.replace(/\\/g, '/').trim()
  if (!normalized || /^https?:/i.test(normalized) || normalized.includes('..') || normalized.includes('\0')) {
    return null
  }
  const prefix = `uploads/quotes/${tenantId}/`
  if (!normalized.startsWith(prefix)) return null
  const absolute = path.resolve(process.cwd(), normalized)
  const root = quoteTenantRoot(tenantId)
  if (absolute !== root && !absolute.startsWith(root + path.sep)) return null
  return absolute
}

export async function unlinkIfPresent(absolute: string | null): Promise<void> {
  if (!absolute) return
  try {
    await fs.unlink(absolute)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}
