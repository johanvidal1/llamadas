import { Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'
import {
  slugFromHost,
  type TenantContext,
} from '../lib/tenant'
import type { AuthRequest } from './auth'

export type { TenantContext }

/**
 * Resolve tenant from Host / X-Forwarded-Host before auth and business routes.
 * Sets req.tenant. Skip /api/health by mounting health before this middleware.
 */
export async function resolveTenant(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const host =
    (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() ||
    req.headers.host

  let slug = slugFromHost(host)

  // Dev-only override (never trust in staging/prod)
  if (!slug && process.env.NODE_ENV === 'development') {
    const headerSlug = req.headers['x-tenant-slug']
    if (typeof headerSlug === 'string' && headerSlug.trim()) {
      slug = headerSlug.trim().toLowerCase()
    }
  }

  if (!slug) {
    res.status(400).json({ error: 'Tenant no resuelto (host inválido)' })
    return
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, status: true },
  })

  if (!tenant || tenant.status !== 'ACTIVE') {
    res.status(404).json({ error: 'Tenant no encontrado o suspendido' })
    return
  }

  req.tenant = tenant
  next()
}
