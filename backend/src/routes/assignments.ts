import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAdmin, AuthRequest } from '../middleware/auth'

const router = Router()

const assignSchema = z.object({
  agentId: z.string().min(1, 'Agente requerido'),
  batchId: z.string().optional(),
  count: z.number().int().positive().optional(),
  clientIds: z.array(z.string()).optional(),
})

// GET /api/assignments — summary of assignments per agent
router.get('/', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const assignments = await prisma.assignment.findMany({
    include: {
      agent: { select: { id: true, name: true, email: true } },
      client: {
        select: {
          id: true,
          name: true,
          phone: true,
          status: true,
          importBatch: { select: { filename: true } },
        },
      },
    },
    orderBy: { assignedAt: 'desc' },
  })
  res.json(assignments)
})

// POST /api/assignments — assign clients to an agent
router.post('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { agentId, batchId, count, clientIds } = assignSchema.parse(req.body)

  let idsToAssign: string[] = []

  if (clientIds && clientIds.length > 0) {
    // Assign specific clients
    idsToAssign = clientIds
  } else {
    // Find unassigned clients (optionally from a batch)
    const unassigned = await prisma.client.findMany({
      where: {
        assignment: null,
        ...(batchId ? { importBatchId: batchId } : {}),
      },
      select: { id: true },
      take: count ?? undefined,
      orderBy: { createdAt: 'asc' },
    })
    idsToAssign = unassigned.map((c) => c.id)
  }

  if (idsToAssign.length === 0) {
    res.status(400).json({ error: 'No hay clientes disponibles para asignar' })
    return
  }

  // Create assignments (skip already assigned)
  const existing = await prisma.assignment.findMany({
    where: { clientId: { in: idsToAssign } },
    select: { clientId: true },
  })
  const existingIds = new Set(existing.map((a) => a.clientId))
  const newIds = idsToAssign.filter((id) => !existingIds.has(id))

  if (newIds.length === 0) {
    res.status(400).json({ error: 'Todos los clientes seleccionados ya tienen asignación' })
    return
  }

  await prisma.assignment.createMany({
    data: newIds.map((clientId) => ({ clientId, agentId })),
  })

  res.status(201).json({ assigned: newIds.length, skipped: idsToAssign.length - newIds.length })
})

// DELETE /api/assignments/:id — unassign client
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  await prisma.assignment.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
})

export default router
