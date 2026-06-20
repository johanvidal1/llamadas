import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import {
  getUnassignedCompaniesOrdered,
  getContactIdsForCompanies,
  BatchBlockedError,
} from '../lib/assignmentOrder'
import { buildAssignmentPreview } from '../lib/assignmentPreview'
import { requireAdmin, AuthRequest } from '../middleware/auth'

const router = Router()

const assignSchema = z.object({
  agentId: z.string().min(1, 'Agente requerido'),
  batchId: z.string().optional(),
  count: z.number().int().positive().optional(),
  clientIds: z.array(z.string()).optional(),
  contactIds: z.array(z.string()).optional(),
})

const previewSchema = z.object({
  agentId: z.string().min(1, 'Agente requerido'),
  batchId: z.string().optional(),
  count: z.number().int().positive().optional(),
})

async function countDistinctCompanies(contactIds: string[]): Promise<number> {
  if (contactIds.length === 0) return 0
  const rows = await prisma.contact.findMany({
    where: { id: { in: contactIds } },
    select: { companyId: true },
    distinct: ['companyId'],
  })
  return rows.length
}

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

// POST /api/assignments/preview
router.post('/preview', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { agentId, batchId, count } = previewSchema.parse(req.body)

  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: { id: true, role: true, active: true },
  })
  if (!agent || agent.role !== 'AGENT' || !agent.active) {
    res.status(400).json({ error: 'Agente no válido' })
    return
  }

  try {
    const preview = await buildAssignmentPreview(agentId, batchId, count)
    res.json(preview)
  } catch (err) {
    if (err instanceof BatchBlockedError) {
      res.status(400).json({ error: err.message })
      return
    }
    throw err
  }
})

// POST /api/assignments
router.post('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { agentId, batchId, count, clientIds, contactIds } = assignSchema.parse(req.body)

  let idsToAssign: string[] = []

  if (contactIds && contactIds.length > 0) {
    idsToAssign = contactIds
  } else if (clientIds && clientIds.length > 0) {
    idsToAssign = await getContactIdsForCompanies(clientIds, batchId)
    const assigned =
      idsToAssign.length === 0
        ? []
        : await prisma.assignment.findMany({
            where: { contactId: { in: idsToAssign } },
            select: { contactId: true },
          })
    const assignedIds = new Set(assigned.map((a) => a.contactId))
    idsToAssign = idsToAssign.filter((id) => !assignedIds.has(id))
  } else {
    try {
      const companies = await getUnassignedCompaniesOrdered(batchId, count ?? undefined)
      const companyIds = companies.map((c) => c.id)
      idsToAssign = await getContactIdsForCompanies(companyIds, batchId)
    } catch (err) {
      if (err instanceof BatchBlockedError) {
        res.status(400).json({ error: err.message })
        return
      }
      throw err
    }
  }

  if (idsToAssign.length === 0) {
    res.status(400).json({ error: 'No hay empresas disponibles para asignar' })
    return
  }

  const fromBlocked = await prisma.contact.count({
    where: {
      id: { in: idsToAssign },
      company: { importBatch: { blocked: true } },
    },
  })
  if (fromBlocked > 0) {
    res.status(400).json({
      error: 'Uno o más contactos pertenecen a un lote bloqueado',
    })
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

  const assignedCompanies = await countDistinctCompanies(newIds)

  const run = await prisma.assignmentRun.create({
    data: {
      agentId,
      importBatchId: batchId ?? null,
      assignedById: req.user!.id,
      companyCount: assignedCompanies,
      contactCount: newIds.length,
    },
  })

  await prisma.assignment.createMany({
    data: newIds.map((contactId) => ({
      contactId,
      agentId,
      assignmentRunId: run.id,
    })),
  })

  res.status(201).json({
    assignedCompanies,
    assignedContacts: newIds.length,
    skipped: idsToAssign.length - newIds.length,
    runId: run.id,
  })
})

// GET /api/assignments/runs
router.get('/runs', requireAdmin, async (req: AuthRequest, res: Response) => {
  const agentId = typeof req.query.agentId === 'string' ? req.query.agentId : ''
  if (!agentId) {
    res.status(400).json({ error: 'agentId requerido' })
    return
  }

  const batchId =
    typeof req.query.batchId === 'string' && req.query.batchId.length > 0
      ? req.query.batchId
      : undefined

  const runs = await prisma.assignmentRun.findMany({
    where: {
      agentId,
      ...(batchId ? { importBatchId: batchId } : {}),
    },
    include: {
      importBatch: { select: { filename: true, displayName: true } },
      assignedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  res.json({
    runs: runs.map((run) => ({
      id: run.id,
      assignedAt: run.createdAt.toISOString(),
      importBatchId: run.importBatchId,
      filename: run.importBatch
        ? run.importBatch.displayName?.trim() || run.importBatch.filename
        : null,
      companyCount: run.companyCount,
      contactCount: run.contactCount,
      assignedBy: run.assignedBy,
    })),
  })
})

// GET /api/assignments/untracked-companies
router.get('/untracked-companies', requireAdmin, async (req: AuthRequest, res: Response) => {
  const agentId = typeof req.query.agentId === 'string' ? req.query.agentId : ''
  const batchId = typeof req.query.batchId === 'string' ? req.query.batchId : ''
  if (!agentId || !batchId) {
    res.status(400).json({ error: 'agentId y batchId requeridos' })
    return
  }

  const assignments = await prisma.assignment.findMany({
    where: {
      agentId,
      assignmentRunId: null,
      contact: { company: { importBatchId: batchId } },
    },
    select: {
      contact: {
        select: {
          company: {
            select: { id: true, ruc: true, razonSocial: true, status: true },
          },
        },
      },
    },
  })

  const companyMap = new Map<
    string,
    { id: string; ruc: string; razonSocial: string | null; status: string; contactCount: number }
  >()
  for (const a of assignments) {
    const company = a.contact.company
    const existing = companyMap.get(company.id)
    if (existing) {
      existing.contactCount += 1
    } else {
      companyMap.set(company.id, {
        id: company.id,
        ruc: company.ruc,
        razonSocial: company.razonSocial,
        status: company.status,
        contactCount: 1,
      })
    }
  }

  const companies = [...companyMap.values()].sort((a, b) =>
    (a.razonSocial ?? a.ruc).localeCompare(b.razonSocial ?? b.ruc, 'es')
  )

  res.json({ companies })
})

// GET /api/assignments/runs/:id/companies
router.get('/runs/:id/companies', requireAdmin, async (req: AuthRequest, res: Response) => {
  const run = await prisma.assignmentRun.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  })
  if (!run) {
    res.status(404).json({ error: 'Asignación no encontrada' })
    return
  }

  const assignments = await prisma.assignment.findMany({
    where: { assignmentRunId: req.params.id },
    select: {
      contact: {
        select: {
          company: {
            select: { id: true, ruc: true, razonSocial: true, status: true },
          },
        },
      },
    },
  })

  const companyMap = new Map<
    string,
    { id: string; ruc: string; razonSocial: string | null; status: string; contactCount: number }
  >()
  for (const a of assignments) {
    const company = a.contact.company
    const existing = companyMap.get(company.id)
    if (existing) {
      existing.contactCount += 1
    } else {
      companyMap.set(company.id, {
        id: company.id,
        ruc: company.ruc,
        razonSocial: company.razonSocial,
        status: company.status,
        contactCount: 1,
      })
    }
  }

  const companies = [...companyMap.values()].sort((a, b) =>
    (a.razonSocial ?? a.ruc).localeCompare(b.razonSocial ?? b.ruc, 'es')
  )

  res.json({ companies })
})

// DELETE /api/assignments/:id
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  await prisma.assignment.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
})

export default router
