import { Router, Response } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAdmin, AuthRequest } from '../middleware/auth'

const router = Router()

const createUserSchema = z.object({
  name: z.string().min(2, 'Nombre mínimo 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Contraseña mínimo 6 caracteres'),
  role: z.enum(['ADMIN', 'AGENT']).default('AGENT'),
})

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['ADMIN', 'AGENT']).optional(),
  active: z.boolean().optional(),
})

// GET /api/users — list all agents
router.get('/', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      _count: { select: { assignments: true, callLogs: true } },
    },
    orderBy: { name: 'asc' },
  })
  res.json(users)
})

// POST /api/users — create agent
router.post('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const data = createUserSchema.parse(req.body)

  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } })
  if (existing) {
    res.status(409).json({ error: 'El email ya está registrado' })
    return
  }

  const hashed = await bcrypt.hash(data.password, 12)
  const user = await prisma.user.create({
    data: { ...data, email: data.email.toLowerCase(), password: hashed },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  })
  res.status(201).json(user)
})

// PUT /api/users/:id — update user
router.put('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const data = updateUserSchema.parse(req.body)

  const updateData: Record<string, unknown> = { ...data }
  if (data.password) {
    updateData.password = await bcrypt.hash(data.password, 12)
  }
  if (data.email) {
    updateData.email = data.email.toLowerCase()
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: updateData,
    select: { id: true, name: true, email: true, role: true, active: true },
  })
  res.json(user)
})

// DELETE /api/users/:id — soft delete (deactivate)
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  await prisma.user.update({
    where: { id: req.params.id },
    data: { active: false },
  })
  res.json({ ok: true })
})

export default router
