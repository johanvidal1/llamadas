import jwt from 'jsonwebtoken'
import { prisma } from './prisma'
import type { AuthRequest } from '../middleware/auth'

export const ADMIN_ELEVATION_HEADER = 'x-admin-elevation'
export const ELEVATION_PURPOSE = 'admin_elevation' as const
/** Short-lived elevation for depurado cola / agent support tickets. */
export const ELEVATION_EXPIRES_IN = '20m'
export const ELEVATION_TTL_MS = 20 * 60 * 1000

export type ElevationPayload = {
  purpose: typeof ELEVATION_PURPOSE
  agentId: string
  adminId: string
  tenantId: string
}

export type ResolvedElevation = {
  adminId: string
  agentId: string
  tenantId: string
}

function elevationSecret(): string {
  return process.env.JWT_SECRET as string
}

export function signAdminElevationToken(payload: Omit<ElevationPayload, 'purpose'>): string {
  return jwt.sign(
    { ...payload, purpose: ELEVATION_PURPOSE },
    elevationSecret(),
    { expiresIn: ELEVATION_EXPIRES_IN }
  )
}

export function verifyAdminElevationToken(token: string): ElevationPayload | null {
  try {
    const payload = jwt.verify(token, elevationSecret()) as ElevationPayload
    if (payload.purpose !== ELEVATION_PURPOSE) return null
    if (!payload.agentId || !payload.adminId || !payload.tenantId) return null
    return payload
  } catch {
    return null
  }
}

function readElevationHeader(req: AuthRequest): string | null {
  const raw = req.headers[ADMIN_ELEVATION_HEADER]
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (Array.isArray(raw) && raw[0]?.trim()) return raw[0].trim()
  return null
}

/**
 * Validates X-Admin-Elevation for the current AGENT session.
 * ADMIN callers do not need elevation (returns null; caller should treat role separately).
 */
export async function resolveAdminElevation(
  req: AuthRequest
): Promise<ResolvedElevation | null> {
  if (!req.user || !req.tenant) return null
  if (req.user.role !== 'AGENT') return null

  const token = readElevationHeader(req)
  if (!token) return null

  const payload = verifyAdminElevationToken(token)
  if (!payload) return null
  if (payload.tenantId !== req.tenant.id) return null
  if (payload.agentId !== req.user.id) return null

  const admin = await prisma.user.findFirst({
    where: {
      id: payload.adminId,
      tenantId: req.tenant.id,
      role: 'ADMIN',
      active: true,
    },
    select: { id: true },
  })
  if (!admin) return null

  return {
    adminId: admin.id,
    agentId: payload.agentId,
    tenantId: payload.tenantId,
  }
}
