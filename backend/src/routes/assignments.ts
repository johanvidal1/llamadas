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
  contactIds: z.array(z.string()).optional(),
})

// GET /api/assignments
router.get('/', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const assignments = await prisma.assignment.findMany({
    include: {
      agent: { select: { id: true, name: true, email: true } },
      contact: {
        select: {
          id: true,
          nombre: true,
          tipoContacto: true,
          telefono: true,
          company: {
            select: {
              id: true,
              ruc: true,
              razonSocial: true,
              status: true,
              importBatch: { select: { filename: true } },
            },
          },
        },
      },
    },
    orderBy: { assignedAt: 'desc' },
  })
  res.json(assignments)
})

// POST /api/assignments
router.post('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { agentId, batchId, count, clientIds, contactIds } = assignSchema.parse(req.body)

  let idsToAssign: string[] = []

  if (contactIds && contactIds.length > 0) {
    idsToAssign = contactIds
  } else if (clientIds && clientIds.length > 0) {
    const contacts = await prisma.contact.findMany({
      where: {
        companyId: { in: clientIds },
        assignment: null,
      },
      select: { id: true },
    })
    idsToAssign = contacts.map((c) => c.id)
  } else {
    const unassigned = await prisma.contact.findMany({
      where: {
        assignment: null,
        ...(batchId ? { company: { importBatchId: batchId } } : {}),
      },
      select: { id: true },
      take: count ?? undefined,
      orderBy: { createdAt: 'asc' },
    })
    idsToAssign = unassigned.map((c) => c.id)
  }

  if (idsToAssign.length === 0) {
    res.status(400).json({ error: 'No hay contactos disponibles para asignar' })
    return
  }

  const existing = await prisma.assignment.findMany({
    where: { contactId: { in: idsToAssign } },
    select: { contactId: true },
  })
  const existingIds = new Set(existing.map((a) => a.contactId))
  const newIds = idsToAssign.filter((id) => !existingIds.has(id))

  if (newIds.length === 0) {
    res.status(400).json({ error: 'Todos los contactos seleccionados ya tienen asignación' })
    return
  }

  await prisma.assignment.createMany({
    data: newIds.map((contactId) => ({ contactId, agentId })),
  })

  res.status(201).json({ assigned: newIds.length, skipped: idsToAssign.length - newIds.length })
})

// DELETE /api/assignments/:id
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  await prisma.assignment.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
})

export default router
