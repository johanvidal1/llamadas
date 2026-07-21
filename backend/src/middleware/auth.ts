import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { getCachedAuthUser, setCachedAuthUser } from '../lib/authUserCache'
import { prisma } from '../lib/prisma'
import { OPTICK_TENANT_ID, type TenantContext } from '../lib/tenant'

export interface AuthRequest extends Request {
  tenant?: TenantContext
  user?: {
    id: string
    email: string
    role: string
    name: string
    isSuperAdmin: boolean
    isSystemOwner: boolean
  }
}

async function authenticateRequest(req: AuthRequest, res: Response): Promise<boolean> {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autorizado' })
    return false
  }

  if (!req.tenant) {
    res.status(400).json({ error: 'Tenant no resuelto' })
    return false
  }

  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: string
      email: string
      role: string
      name: string
      tenantId?: string
      tokenVersion?: number
    }

    // Old tokens without tenantId: accept only on Optick host until next login.
    let tokenTenantId = payload.tenantId
    if (!tokenTenantId) {
      if (req.tenant.id === OPTICK_TENANT_ID) {
        tokenTenantId = OPTICK_TENANT_ID
      } else {
        res.status(401).json({
          error: 'Sesión inválida. Inicia sesión nuevamente.',
          code: 'TENANT_REQUIRED',
        })
        return false
      }
    }

    if (tokenTenantId !== req.tenant.id) {
      res.status(401).json({
        error: 'Token no válido para este tenant',
        code: 'TENANT_MISMATCH',
      })
      return false
    }

    const jwtTokenVersion = payload.tokenVersion ?? 0
    let user = getCachedAuthUser(payload.id, jwtTokenVersion)
    if (!user) {
      user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: {
          id: true,
          email: true,
          role: true,
          name: true,
          active: true,
          isSuperAdmin: true,
          isSystemOwner: true,
          tokenVersion: true,
          tenantId: true,
        },
      })
      if (user?.active) {
        setCachedAuthUser(user)
      }
    }
    if (!user || !user.active) {
      res.status(401).json({ error: 'Sesión inválida. Inicia sesión nuevamente.' })
      return false
    }
    if (user.tenantId !== tokenTenantId) {
      res.status(401).json({
        error: 'Token no válido para este tenant',
        code: 'TENANT_MISMATCH',
      })
      return false
    }
    if (jwtTokenVersion !== user.tokenVersion) {
      res.status(401).json({
        error: 'Tu sesión fue cerrada por un administrador. Inicia sesión nuevamente.',
        code: 'SESSION_REVOKED',
      })
      return false
    }
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
      isSystemOwner: user.isSystemOwner,
    }
    return true
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' })
    return false
  }
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!(await authenticateRequest(req, res))) return
  next()
}

export async function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!(await authenticateRequest(req, res))) return
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Acceso restringido a administradores' })
    return
  }
  next()
}

/** Fail-closed: only the system owner may mutate platform release notes. */
export async function requireSystemOwner(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!(await authenticateRequest(req, res))) return
  if (req.user?.isSystemOwner !== true) {
    res.status(403).json({ error: 'Solo el propietario del sistema puede realizar esta acción' })
    return
  }
  next()
}
