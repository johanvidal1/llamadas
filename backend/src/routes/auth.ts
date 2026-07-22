import { Router, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { computeBillingStatus } from '../lib/billing'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
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
