import { Router, Response } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { resolveAdminElevation } from '../lib/adminElevation'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

const TICKET_STATUSES = ['OPEN', 'PENDING', 'CLOSED'] as const
const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH'] as const

const createSchema = z.object({
  subject: z.string().trim().min(3, 'Asunto mínimo 3 caracteres').max(200),
  body: z.string().trim().min(5, 'Mensaje mínimo 5 caracteres').max(5000),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  context: z.record(z.unknown()).optional(),
})

const patchSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  adminNote: z.string().trim().max(5000).nullable().optional(),
  priority: z.enum(TICKET_PRIORITIES).nullable().optional(),
})

const ticketSelect = {
  id: true,
  subject: true,
  body: true,
  status: true,
  priority: true,
  adminNote: true,
  context: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  elevatedByAdminId: true,
  createdBy: { select: { id: true, name: true, email: true, role: true } },
  elevatedByAdmin: { select: { id: true, name: true, email: true } },
} as const

// GET /api/support-tickets — ADMIN: all tenant; AGENT: own only
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const isAdmin = req.user!.role === 'ADMIN'
  const status = typeof req.query.status === 'string' ? req.query.status : undefined

  const where: Record<string, unknown> = {}
  if (!isAdmin) {
    where.createdById = req.user!.id
  }
  if (status && TICKET_STATUSES.includes(status as (typeof TICKET_STATUSES)[number])) {
    where.status = status
  }

  const tickets = await prisma.supportTicket.findMany({
    where,
    select: ticketSelect,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  res.json({ tickets })
})

// POST /api/support-tickets — ADMIN free; AGENT needs valid elevation
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const data = createSchema.parse(req.body)
  const isAdmin = req.user!.role === 'ADMIN'

  let elevatedByAdminId: string | null = null
  if (!isAdmin) {
    const elevation = await resolveAdminElevation(req)
    if (!elevation) {
      res.status(403).json({
        error: 'Se requiere autorización de administrador para crear un ticket de soporte',
        code: 'ADMIN_ELEVATION_REQUIRED',
      })
      return
    }
    elevatedByAdminId = elevation.adminId
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      subject: data.subject,
      body: data.body,
      priority: data.priority ?? 'NORMAL',
      context: data.context
        ? (data.context as Prisma.InputJsonValue)
        : undefined,
      createdById: req.user!.id,
      elevatedByAdminId,
    },
    select: ticketSelect,
  })

  res.status(201).json(ticket)
})

// PATCH /api/support-tickets/:id — ADMIN only (status / note)
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'ADMIN') {
    res.status(403).json({ error: 'Acceso restringido a administradores' })
    return
  }

  const data = patchSchema.parse(req.body)
  if (data.status === undefined && data.adminNote === undefined && data.priority === undefined) {
    res.status(400).json({ error: 'Nada que actualizar' })
    return
  }

  const existing = await prisma.supportTicket.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  })
  if (!existing) {
    res.status(404).json({ error: 'Ticket no encontrado' })
    return
  }

  const ticket = await prisma.supportTicket.update({
    where: { id: req.params.id },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.adminNote !== undefined ? { adminNote: data.adminNote } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
    },
    select: ticketSelect,
  })

  res.json(ticket)
})

export default router
