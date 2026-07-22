import { Router, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { computeBillingStatus } from '../lib/billing'
import {
  ELEVATION_TTL_MS,
  signAdminElevationToken,
} from '../lib/adminElevation'
import {
  checkElevateRateLimit,
  recordElevateAttempt,
} from '../lib/elevateAdminRateLimit'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
})

/** Password required; email optional (legacy path when provided). */
const elevateSchema = z.object({
  email: z.string().email('Email inválido').optional(),
  password: z.string().min(1, 'Contraseña requerida'),
})

// POST /api/auth/login
router.post('/login', async (req: AuthRequest, res: Response) => {
  const { email, password } = loginSchema.parse(req.body)

  if (!req.tenant) {
    res.status(400).json({ error: 'Tenant no resuelto' })
    return
  }

  const user = await prisma.user.findFirst({
    where: {
      email: email.toLowerCase(),
      tenantId: req.tenant.id,
      active: true,
    },
  })
  if (!user || user.isArchivedAgent) {
    res.status(401).json({ error: 'Credenciales incorrectas' })
    return
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    res.status(401).json({ error: 'Credenciales incorrectas' })
    return
  }

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      tenantId: user.tenantId,
      tokenVersion: user.tokenVersion,
    },
    process.env.JWT_SECRET as string,
    { expiresIn: '24h' }
  )

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin,
      isSystemOwner: user.isSystemOwner,
    },
  })
})

/**
 * POST /api/auth/elevate-admin
 * Authenticated user provides ACTIVE ADMIN password of the same tenant.
 * Body: `{ password }` (preferred) or `{ email, password }` (compat).
 * Without email, bcrypt is tried against all ACTIVE ADMIN users in the tenant.
 */
router.post('/elevate-admin', requireAuth, async (req: AuthRequest, res: Response) => {
  const { email, password } = elevateSchema.parse(req.body)

  if (!req.tenant || !req.user) {
    res.status(400).json({ error: 'Tenant no resuelto' })
    return
  }

  const rate = checkElevateRateLimit(req.tenant.id, req.user.id)
  if (!rate.ok) {
    res.status(429).json({
      error: 'Demasiados intentos. Espera e inténtalo de nuevo.',
      code: 'ADMIN_ELEVATION_RATE_LIMITED',
      retryAfterSec: rate.retryAfterSec,
    })
    return
  }

  const invalid = () => {
    recordElevateAttempt(req.tenant!.id, req.user!.id, false)
    res.status(401).json({
      error: 'Contraseña incorrecta',
      code: 'ADMIN_ELEVATION_INVALID',
    })
  }

  let admin:
    | { id: string; name: string; email: string; password: string }
    | null = null

  if (email) {
    const found = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        tenantId: req.tenant.id,
        role: 'ADMIN',
        active: true,
      },
    })
    if (!found) {
      invalid()
      return
    }
    const valid = await bcrypt.compare(password, found.password)
    if (!valid) {
      invalid()
      return
    }
    admin = found
  } else {
    const admins = await prisma.user.findMany({
      where: {
        tenantId: req.tenant.id,
        role: 'ADMIN',
        active: true,
      },
      select: { id: true, name: true, email: true, password: true },
    })
    for (const candidate of admins) {
      const valid = await bcrypt.compare(password, candidate.password)
      if (valid) {
        admin = candidate
        break
      }
    }
    if (!admin) {
      invalid()
      return
    }
  }

  recordElevateAttempt(req.tenant.id, req.user.id, true)

  const expiresAt = Date.now() + ELEVATION_TTL_MS
  const elevationToken = signAdminElevationToken({
    agentId: req.user.id,
    adminId: admin.id,
    tenantId: req.tenant.id,
  })

  res.json({
    elevationToken,
    expiresAt,
    expiresInMs: ELEVATION_TTL_MS,
    admin: { id: admin.id, name: admin.name, email: admin.email },
  })
})

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isSuperAdmin: true,
      isSystemOwner: true,
      active: true,
    },
  })
  if (!user) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }

  let billing = null
  if (req.tenant && user.role === 'ADMIN') {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenant.id },
      select: {
        id: true,
        slug: true,
        billingEnabled: true,
        billingDay: true,
        graceDays: true,
        paidThrough: true,
        billingContact: true,
      },
    })
    if (tenant) {
      billing = computeBillingStatus(tenant)
    }
  }

  res.json({ ...user, billing })
})

export default router
