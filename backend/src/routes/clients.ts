import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth'

const router = Router()

// GET /api/clients — ADMIN sees all, AGENT sees only assigned
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const {
    page = '1',
    limit = '50',
    status,
    search,
    batchId,
    agentId,
    unassigned,
  } = req.query as Record<string, string>

  const take = Math.min(Number(limit) || 50, 200)
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take

  const where: Record<string, unknown> = {}

  if (req.user!.role === 'AGENT') {
    // Agents only see their assigned clients; they can also filter by batch
    where.assignment = { agentId: req.user!.id }
    if (batchId) where.importBatchId = batchId
  } else {
    if (agentId) where.assignment = { agentId }
    if (unassigned === 'true') where.assignment = null
    if (batchId) where.importBatchId = batchId
  }

  if (status) where.status = status
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { phone2: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      include: {
        assignment: { include: { agent: { select: { name: true, id: true } } } },
        importBatch: { select: { id: true, filename: true, createdAt: true } },
        _count: { select: { callLogs: true, callbacks: true } },
        callbacks: {
          where: { completed: false },
          orderBy: { scheduledAt: 'asc' },
          take: 1,
          select: { scheduledAt: true, notes: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      take,
      skip,
    }),
    prisma.client.count({ where }),
  ])

  res.json({ clients, total, page: Number(page), limit: take })
})

// GET /api/clients/:id — client detail with call history
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const client = await prisma.client.findUnique({
    where: { id: req.params.id },
    include: {
      assignment: { include: { agent: { select: { name: true } } } },
      callLogs: {
        include: { agent: { select: { name: true } } },
        orderBy: { calledAt: 'desc' },
      },
      callbacks: {
        include: { agent: { select: { name: true } } },
        orderBy: { scheduledAt: 'asc' },
      },
      importBatch: { select: { filename: true, createdAt: true } },
    },
  })

  if (!client) {
    res.status(404).json({ error: 'Cliente no encontrado' })
    return
  }

  // Agents can only see their own clients
  if (
    req.user!.role === 'AGENT' &&
    client.assignment?.agent !== undefined &&
    (client.assignment as { agentId?: string })?.agentId !== req.user!.id
  ) {
    res.status(403).json({ error: 'Sin acceso a este cliente' })
    return
  }

  res.json(client)
})

// PUT /api/clients/:id — update client notes, status
router.put('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const updateSchema = z.object({
    notes: z.string().optional(),
    phone2: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().optional(),
    currentOp: z.string().optional(),
    plan: z.string().optional(),
  })
  const data = updateSchema.parse(req.body)

  const updated = await prisma.client.update({
    where: { id: req.params.id },
    data,
  })
  res.json(updated)
})

export default router
