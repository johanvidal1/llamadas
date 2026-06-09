import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

// GET /api/callbacks — get callbacks (agent: own, admin: all or by agentId)
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { agentId, completed, date } = req.query as Record<string, string>

  const where: Record<string, unknown> = {}

  if (req.user!.role === 'AGENT') {
    where.agentId = req.user!.id
  } else if (agentId) {
    where.agentId = agentId
  }

  if (completed !== undefined) {
    where.completed = completed === 'true'
  }

  // Filter by date (today's callbacks)
  if (date) {
    const start = new Date(date)
    start.setHours(0, 0, 0, 0)
    const end = new Date(date)
    end.setHours(23, 59, 59, 999)
    where.scheduledAt = { gte: start, lte: end }
  }

  const callbacks = await prisma.callback.findMany({
    where,
    include: {
      client: { select: { id: true, name: true, phone: true, phone2: true, status: true } },
      agent: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  })

  res.json(callbacks)
})

// PUT /api/callbacks/:id — mark as completed
router.put('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const schema = z.object({ completed: z.boolean(), notes: z.string().optional() })
  const data = schema.parse(req.body)

  const callback = await prisma.callback.update({
    where: { id: req.params.id },
    data: {
      completed: data.completed,
      completedAt: data.completed ? new Date() : null,
      notes: data.notes,
    },
  })
  res.json(callback)
})

// POST /api/callbacks — create manual callback
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    clientId: z.string().min(1),
    scheduledAt: z.string().datetime(),
    notes: z.string().optional(),
  })
  const data = schema.parse(req.body)

  const callback = await prisma.callback.create({
    data: {
      clientId: data.clientId,
      agentId: req.user!.id,
      scheduledAt: new Date(data.scheduledAt),
      notes: data.notes,
    },
    include: {
      client: { select: { name: true, phone: true } },
    },
  })
  res.status(201).json(callback)
})

export default router
