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
      { ruc: { contains: search, mode: 'insensitive' } },
      { razonSocial: { contains: search, mode: 'insensitive' } },
      { contacts: { some: { nombre: { contains: search, mode: 'insensitive' } } } },
      { contacts: { some: { telefono: { contains: search, mode: 'insensitive' } } } },
    ]
  }

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      include: {
        contacts: { orderBy: { createdAt: 'asc' } },
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
    prisma.company.count({ where }),
  ])

  res.json({ clients: companies, total, page: Number(page), limit: take })
})

// GET /api/clients/:id
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const company = await prisma.company.findUnique({
    where: { id: req.params.id },
    include: {
      contacts: { orderBy: { createdAt: 'asc' } },
      assignment: { include: { agent: { select: { name: true } } } },
      callLogs: {
        include: {
          agent: { select: { name: true } },
          contact: { select: { id: true, nombre: true, tipoContacto: true } },
          callback: true,
        },
        orderBy: { calledAt: 'desc' },
      },
      callbacks: {
        include: { agent: { select: { name: true } } },
        orderBy: { scheduledAt: 'asc' },
      },
      importBatch: { select: { filename: true, createdAt: true } },
    },
  })

  if (!company) {
    res.status(404).json({ error: 'Empresa no encontrada' })
    return
  }

  if (
    req.user!.role === 'AGENT' &&
    company.assignment &&
    (company.assignment as { agentId?: string }).agentId !== req.user!.id
  ) {
    res.status(403).json({ error: 'Sin acceso a esta empresa' })
    return
  }

  res.json(company)
})

// PUT /api/clients/:id — update notes, plan
router.put('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const updateSchema = z.object({
    notes: z.string().optional(),
    plan: z.string().optional(),
    razonSocial: z.string().optional(),
  })
  const data = updateSchema.parse(req.body)

  const updated = await prisma.company.update({
    where: { id: req.params.id },
    data,
  })
  res.json(updated)
})

export default router