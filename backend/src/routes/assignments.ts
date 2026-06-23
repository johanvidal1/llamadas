import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import {
  getUnassignedCompaniesOrdered,
  getContactIdsForCompanies,
  BatchBlockedError,
} from '../lib/assignmentOrder'
import { buildAssignmentPreview } from '../lib/assignmentPreview'
import {
  buildReleasePreviewForContext,
  executeReleaseRemainder,
  resolveRunContext,
  ReleaseBlockedError,
  ReleaseNothingError,
} from '../lib/assignmentRelease'
import {
  buildLegacyBucketMetrics,
  buildRunMetrics,
  getAssignmentRunCompanyIds,
  getLastDispositionByCompanyIds,
  getRunActivityDates,
} from '../lib/companyDisposition'
import { getAclaracionForDisposition } from '../lib/responseOptions'
import { requireAdmin, AuthRequest } from '../middleware/auth'

const router = Router()

const assignSchema = z.object({
  agentId: z.string().min(1, 'Agente requerido'),
  batchId: z.string().optional(),
  count: z.number().int().positive().optional(),
  clientIds: z.array(z.string()).optional(),
  contactIds: z.array(z.string()).optional(),
})

const releaseReasonSchema = z.object({
  reason: z.string().optional(),
})

const legacyReleaseSchema = z.object({
  agentId: z.string().min(1, 'Agente requerido'),
  batchId: z.string().min(1, 'Lote requerido'),
  reason: z.string().optional(),
})

const previewSchema = z.object({
  agentId: z.string().min(1, 'Agente requerido'),
  batchId: z.string().optional(),
  count: z.number().int().positive().optional(),
})

function handleReleaseError(err: unknown, res: Response): boolean {
  if (err instanceof ReleaseBlockedError) {
    res.status(400).json({
      error: err.message,
      blockedByCallbacks: err.blockedByCallbacks,
    })
    return true
  }
  if (err instanceof ReleaseNothingError) {
    res.status(400).json({ error: err.message })
    return true
  }
  if (err instanceof Error && err.message === 'Asignación no encontrada') {
    res.status(404).json({ error: err.message })
    return true
  }
  if (err instanceof Error && err.message === 'Esta asignación ya fue liberada o cerrada') {
    res.status(400).json({ error: err.message })
    return true
  }
  return false
}

type RunCompanyRow = {
  id: string
  ruc: string
  razonSocial: string | null
  status: string
  contactCount: number
  createdAt: Date
}

type EnrichedRunCompanyRow = RunCompanyRow & {
  lastDisposition: string | null
  lastAclaracion: string | null
  lastCalledAt: string | null
  callLogCount: number
}

function sortCompaniesByLastActivity(companies: EnrichedRunCompanyRow[]): EnrichedRunCompanyRow[] {
  return companies.sort((a, b) => {
    const hasA = a.lastCalledAt != null
    const hasB = b.lastCalledAt != null
    if (hasA !== hasB) return hasA ? -1 : 1

    if (hasA && hasB) {
      const ta = new Date(a.lastCalledAt!).getTime()
      const tb = new Date(b.lastCalledAt!).getTime()
      if (ta !== tb) return tb - ta
    }

    const createdA = new Date(a.createdAt).getTime()
    const createdB = new Date(b.createdAt).getTime()
    if (createdA !== createdB) return createdB - createdA
    return a.id.localeCompare(b.id)
  })
}

async function enrichRunCompaniesWithLastDisposition(
  companies: RunCompanyRow[],
  agentId: string
): Promise<EnrichedRunCompanyRow[]> {
  if (companies.length === 0) return []

  const lastByCompany = await getLastDispositionByCompanyIds(
    companies.map((c) => c.id),
    agentId
  )

  return companies.map((c) => {
    const last = lastByCompany.get(c.id)
    const disposition = last?.disposition ?? null
    return {
      ...c,
      lastDisposition: disposition,
      lastAclaracion: last?.aclaracion ?? getAclaracionForDisposition(disposition ?? '') ?? null,
      lastCalledAt: last?.lastCalledAt?.toISOString() ?? null,
      callLogCount: last?.callLogCount ?? 0,
    }
  })
}

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

  type RunListItem = {
    id: string
    assignedAt: string
    importBatchId: string | null
    filename: string | null
    companyCount: number
    contactCount: number
    assignedBy: { id: string; name: string }
    status: string
    releasedAt: string | null
    isLegacy: boolean
    callCount: number
    contactedCompanies: number
    pendingCompanies: number
    firstCallAt: string | null
    lastCallAt: string | null
  }

  async function enrichRunActivity(
    base: Omit<
      RunListItem,
      'callCount' | 'contactedCompanies' | 'pendingCompanies' | 'firstCallAt' | 'lastCallAt'
    >,
    metrics: { callCount: number; contactedCompanies: number },
    companyIds: string[],
    companyCount: number
  ): Promise<RunListItem> {
    const activity = await getRunActivityDates(companyIds, agentId)
    return {
      ...base,
      callCount: metrics.callCount,
      contactedCompanies: metrics.contactedCompanies,
      pendingCompanies: companyCount - activity.companiesWithCalls,
      firstCallAt: activity.firstCallAt?.toISOString() ?? null,
      lastCallAt: activity.lastCallAt?.toISOString() ?? null,
    }
  }

  const mappedRuns: RunListItem[] = await Promise.all(
    runs.map(async (run) => {
      const [metrics, companyIds] = await Promise.all([
        buildRunMetrics(run.id, agentId, run.companyCount),
        getAssignmentRunCompanyIds(run.id),
      ])
      return enrichRunActivity(
        {
          id: run.id,
          assignedAt: run.createdAt.toISOString(),
          importBatchId: run.importBatchId,
          filename: run.importBatch
            ? run.importBatch.displayName?.trim() || run.importBatch.filename
            : null,
          companyCount: run.companyCount,
          contactCount: run.contactCount,
          assignedBy: run.assignedBy,
          status: run.status,
          releasedAt: run.releasedAt?.toISOString() ?? null,
          isLegacy: false,
        },
        metrics,
        companyIds,
        run.companyCount
      )
    })
  )

  const legacyRuns: RunListItem[] = []
  if (batchId) {
    const legacy = await buildLegacyBucketMetrics(agentId, batchId)
    if (legacy.companyCount > 0) {
      const batch = await prisma.importBatch.findUnique({
        where: { id: batchId },
        select: { filename: true, displayName: true },
      })
      legacyRuns.push(
        await enrichRunActivity(
          {
            id: `legacy-${batchId}`,
            assignedAt: legacy.earliestAssignedAt?.toISOString() ?? new Date(0).toISOString(),
            importBatchId: batchId,
            filename: batch
              ? batch.displayName?.trim() || batch.filename
              : null,
            companyCount: legacy.companyCount,
            contactCount: legacy.companyIds.length,
            assignedBy: { id: '', name: 'Asignación anterior' },
            status: 'ACTIVE',
            releasedAt: null,
            isLegacy: true,
          },
          legacy,
          legacy.companyIds,
          legacy.companyCount
        )
      )
    }
  } else {
    const legacyAssignments = await prisma.assignment.findMany({
      where: { agentId, assignmentRunId: null },
      select: {
        contact: {
          select: {
            company: {
              select: { importBatchId: true },
            },
          },
        },
      },
    })
    const legacyBatchIds = [
      ...new Set(
        legacyAssignments
          .map((a) => a.contact.company.importBatchId)
          .filter((id): id is string => id != null)
      ),
    ]
    if (legacyBatchIds.length > 0) {
      const batches = await prisma.importBatch.findMany({
        where: { id: { in: legacyBatchIds } },
        select: { id: true, filename: true, displayName: true },
      })
      const batchById = new Map(batches.map((b) => [b.id, b]))
      for (const legacyBatchId of legacyBatchIds) {
        const legacy = await buildLegacyBucketMetrics(agentId, legacyBatchId)
        if (legacy.companyCount === 0) continue
        const batch = batchById.get(legacyBatchId)
        legacyRuns.push(
          await enrichRunActivity(
            {
              id: `legacy-${legacyBatchId}`,
              assignedAt: legacy.earliestAssignedAt?.toISOString() ?? new Date(0).toISOString(),
              importBatchId: legacyBatchId,
              filename: batch
                ? batch.displayName?.trim() || batch.filename
                : null,
              companyCount: legacy.companyCount,
              contactCount: legacy.companyIds.length,
              assignedBy: { id: '', name: 'Asignación anterior' },
              status: 'ACTIVE',
              releasedAt: null,
              isLegacy: true,
            },
            legacy,
            legacy.companyIds,
            legacy.companyCount
          )
        )
      }
      legacyRuns.sort(
        (a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
      )
    }
  }

  const allRuns = [...mappedRuns, ...legacyRuns].sort(
    (a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()
  )

  res.json({ runs: allRuns })
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
            select: { id: true, ruc: true, razonSocial: true, status: true, createdAt: true },
          },
        },
      },
    },
  })

  const companyMap = new Map<string, RunCompanyRow>()
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
        createdAt: company.createdAt,
      })
    }
  }

  const companies = sortCompaniesByLastActivity(
    await enrichRunCompaniesWithLastDisposition([...companyMap.values()], agentId)
  )

  res.json({ companies })
})

// POST /api/assignments/runs/:runId/release-preview
router.post(
  '/runs/:runId/release-preview',
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      const ctx = await resolveRunContext(req.params.runId)
      const preview = await buildReleasePreviewForContext(ctx)
      res.json(preview)
    } catch (err) {
      if (handleReleaseError(err, res)) return
      throw err
    }
  }
)

// POST /api/assignments/runs/:runId/release-remainder
router.post(
  '/runs/:runId/release-remainder',
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    const { reason } = releaseReasonSchema.parse(req.body)
    try {
      const ctx = await resolveRunContext(req.params.runId)
      const result = await executeReleaseRemainder(ctx, req.user!.id, reason)
      res.json(result)
    } catch (err) {
      if (handleReleaseError(err, res)) return
      throw err
    }
  }
)

// POST /api/assignments/release-legacy-preview
router.post('/release-legacy-preview', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { agentId, batchId } = legacyReleaseSchema.parse(req.body)
  try {
    const preview = await buildReleasePreviewForContext({
      type: 'legacy',
      agentId,
      batchId,
    })
    res.json(preview)
  } catch (err) {
    if (handleReleaseError(err, res)) return
    throw err
  }
})

// POST /api/assignments/release-legacy
router.post('/release-legacy', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { agentId, batchId, reason } = legacyReleaseSchema.parse(req.body)
  try {
    const result = await executeReleaseRemainder(
      { type: 'legacy', agentId, batchId },
      req.user!.id,
      reason
    )
    res.json(result)
  } catch (err) {
    if (handleReleaseError(err, res)) return
    throw err
  }
})

// GET /api/assignments/runs/:id/companies
router.get('/runs/:id/companies', requireAdmin, async (req: AuthRequest, res: Response) => {
  const run = await prisma.assignmentRun.findUnique({
    where: { id: req.params.id },
    select: { id: true, agentId: true },
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
            select: { id: true, ruc: true, razonSocial: true, status: true, createdAt: true },
          },
        },
      },
    },
  })

  const companyMap = new Map<string, RunCompanyRow>()
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
        createdAt: company.createdAt,
      })
    }
  }

  const companies = sortCompaniesByLastActivity(
    await enrichRunCompaniesWithLastDisposition([...companyMap.values()], run.agentId)
  )

  res.json({ companies })
})

// DELETE /api/assignments/:id
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  await prisma.assignment.delete({ where: { id: req.params.id } })
  res.json({ ok: true })
})

export default router
