import { Router, Response } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { buildCalledAtRange } from '../lib/callActivity'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { getAclaracionForDisposition, isValidDisposition } from '../lib/responseOptions'
import {
  buildCompanyPipelineCounts,
  dispositionMatchesFilter,
  FUNNEL_PIPELINE_KEYS,
  getLastDispositionByCompanyIds,
  matchesFunnelFilter,
  pipelineBucketForDisposition,
  sortClientsByActivityQueue,
} from '../lib/companyDisposition'
import { countUnassignedCompanies, BatchBlockedError } from '../lib/assignmentOrder'

const router = Router()

function contactFilterForRole(
  role: string,
  userId: string,
  agentId?: string
): Record<string, unknown> | undefined {
  if (role === 'AGENT') {
    return { assignment: { agentId: userId } }
  }
  if (agentId) {
    return { assignment: { agentId } }
  }
  return undefined
}

/** Call logs counted per requesting user (registered vs blank in MyLeads). */
function contactCallLogCountForUser(userId: string) {
  return {
    _count: {
      select: {
        callLogs: { where: { agentId: userId } },
      },
    },
  }
}

function scopedAgentId(role: string, userId: string, agentId?: string): string {
  if (role === 'AGENT') return userId
  return agentId || userId
}

/** Last-disposition scope: global for ADMIN without agentId (matches Reports pipeline). */
function dispositionScopeAgentId(
  role: string,
  userId: string,
  agentId?: string
): string | undefined {
  if (role === 'AGENT') return userId
  if (agentId) return agentId
  return undefined
}

type CompanyRow = Awaited<ReturnType<typeof fetchCompanies>>[number]

async function fetchCompanies(
  where: Record<string, unknown>,
  contactWhere: Record<string, unknown> | undefined,
  agentUserId: string,
  take?: number,
  skip?: number
) {
  const contactsInclude = {
    where: contactWhere,
    include: {
      assignment: { include: { agent: { select: { name: true, id: true } } } },
      ...contactCallLogCountForUser(agentUserId),
    },
    orderBy: { createdAt: 'asc' as const },
  }

  return prisma.company.findMany({
    where,
    include: {
      contacts: contactsInclude,
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
    ...(take !== undefined ? { take } : {}),
    ...(skip !== undefined ? { skip } : {}),
  })
}

async function enrichWithLastDisposition(
  companies: CompanyRow[],
  agentUserId?: string
): Promise<
  (CompanyRow & {
    lastDisposition: string | null
    lastAclaracion: string | null
    lastCalledAt: string | null
    lastCallContactId: string | null
    callLogCount: number
  })[]
> {
  if (companies.length === 0) return []

  const lastByCompany = await getLastDispositionByCompanyIds(
    companies.map((c) => c.id),
    agentUserId
  )

  return companies.map((c) => {
    const last = lastByCompany.get(c.id)
    const disposition = last?.disposition ?? null
    return {
      ...c,
      lastDisposition: disposition,
      lastAclaracion: last?.aclaracion ?? getAclaracionForDisposition(disposition ?? '') ?? null,
      lastCalledAt: last?.lastCalledAt?.toISOString() ?? null,
      lastCallContactId: last?.lastCallContactId ?? null,
      callLogCount: last?.callLogCount ?? 0,
    }
  })
}

function buildRegistrationCallLogWhere(
  calledAtRange: { gte?: Date; lte?: Date },
  companyWhere: Record<string, unknown>,
  dispositionAgentId?: string
): Prisma.CallLogWhereInput {
  const where: Prisma.CallLogWhereInput = {
    calledAt: calledAtRange,
    company: companyWhere as Prisma.CompanyWhereInput,
    ...(dispositionAgentId
      ? { agentId: dispositionAgentId, contact: { assignment: { agentId: dispositionAgentId } } }
      : { contact: { assignment: { is: {} } } }),
  }
  return where
}

function matchesPendingFilter(
  company: CompanyRow & { lastDisposition: string | null },
): boolean {
  return company.lastDisposition == null
}

function emptyFunnelPipelineCounts(): Record<string, number> {
  return Object.fromEntries(FUNNEL_PIPELINE_KEYS.map((k) => [k, 0]))
}

async function getScopedCompanyIds(where: Record<string, unknown>): Promise<string[]> {
  const rows = await prisma.company.findMany({ where, select: { id: true } })
  return rows.map((r) => r.id)
}

async function buildFunnelPipelineCounts(
  companyIds: string[],
  dispositionAgentId?: string
): Promise<Record<string, number>> {
  if (companyIds.length === 0) return emptyFunnelPipelineCounts()
  const lastByCompany = await getLastDispositionByCompanyIds(companyIds, dispositionAgentId)
  const counts = buildCompanyPipelineCounts(lastByCompany)
  return Object.fromEntries(FUNNEL_PIPELINE_KEYS.map((k) => [k, counts[k]]))
}

// GET /api/clients — ADMIN sees all, AGENT sees only assigned contacts
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const {
    page = '1',
    limit = '50',
    status,
    disposition,
    search,
    batchId,
    agentId,
    unassigned,
    registeredFrom,
    registeredTo,
    sortBy,
  } = req.query as Record<string, string>

  const take = Math.min(Number(limit) || 50, 500)
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take
  const isAgent = req.user!.role === 'AGENT'
  const callLogAgentId = scopedAgentId(req.user!.role, req.user!.id, agentId)
  const dispositionAgentId = dispositionScopeAgentId(req.user!.role, req.user!.id, agentId)
  const filterParam = (req.query as Record<string, string>).filter
  const effectiveDisposition = disposition || (filterParam && filterParam !== 'PENDING' ? filterParam : undefined)
  const agentScopedPending = status === 'PENDING' || filterParam === 'PENDING'
  const agentScopedOtros = effectiveDisposition === 'OTROS'
  const agentScopedFunnel = effectiveDisposition === 'FUNNEL'
  const agentScopedDisposition =
    effectiveDisposition &&
    !agentScopedOtros &&
    !agentScopedFunnel &&
    isValidDisposition(effectiveDisposition)

  if (unassigned === 'true' && !isAgent) {
    let sourceRowCount: number | null = null

    if (batchId) {
      const batch = await prisma.importBatch.findUnique({
        where: { id: batchId },
        select: { blocked: true, sourceRowCount: true },
      })
      if (!batch || batch.blocked) {
        res.json({ clients: [], total: 0, contactCount: 0, page: Number(page), limit: take })
        return
      }
      sourceRowCount = batch.sourceRowCount
    }

    try {
      const { companies, contactCount } = await countUnassignedCompanies(batchId || undefined)

      res.json({
        clients: [],
        total: companies,
        contactCount,
        page: Number(page),
        limit: take,
        ...(batchId ? { sourceRowCount } : {}),
      })
    } catch (err) {
      if (err instanceof BatchBlockedError) {
        res.json({ clients: [], total: 0, contactCount: 0, page: Number(page), limit: take })
        return
      }
      throw err
    }
    return
  }

  const where: Record<string, unknown> = {}
  const contactWhere = contactFilterForRole(req.user!.role, req.user!.id, agentId)

  if (contactWhere) {
    where.contacts = { some: contactWhere }
  }

  if (batchId) where.importBatchId = batchId
  if (status && !agentScopedPending) where.status = status
  if (search) {
    where.OR = [
      { ruc: { contains: search, mode: 'insensitive' } },
      { razonSocial: { contains: search, mode: 'insensitive' } },
      { contacts: { some: { nombre: { contains: search, mode: 'insensitive' } } } },
      { contacts: { some: { telefono: { contains: search, mode: 'insensitive' } } } },
    ]
  }

  const calledAtRange = buildCalledAtRange(registeredFrom, registeredTo)
  let registrationCount: number | undefined

  if (calledAtRange) {
    const registrationWhere = buildRegistrationCallLogWhere(
      calledAtRange,
      where,
      dispositionAgentId
    )
    const [matchingLogs, count] = await Promise.all([
      prisma.callLog.findMany({
        where: registrationWhere,
        select: { companyId: true },
        distinct: ['companyId'],
      }),
      prisma.callLog.count({ where: registrationWhere }),
    ])
    registrationCount = count
    const companyIdsInRange = matchingLogs.map((l) => l.companyId)
    if (companyIdsInRange.length === 0) {
      res.json({
        clients: [],
        total: 0,
        page: Number(page),
        limit: take,
        registrationCount: 0,
        pipelineCounts: emptyFunnelPipelineCounts(),
      })
      return
    }
    where.id = { in: companyIdsInRange }
  }

  const jsonExtras = registrationCount !== undefined ? { registrationCount } : {}

  if (agentScopedDisposition || agentScopedPending || agentScopedOtros || agentScopedFunnel) {
    const allCompanies = await fetchCompanies(where, contactWhere, callLogAgentId)
    const scopedIds = allCompanies.map((c) => c.id)
    const [pipelineCounts, enriched] = await Promise.all([
      buildFunnelPipelineCounts(scopedIds, dispositionAgentId),
      enrichWithLastDisposition(allCompanies, dispositionAgentId),
    ])
    const filtered = enriched.filter((c) => {
      if (agentScopedOtros) {
        return pipelineBucketForDisposition(c.lastDisposition) === 'OTROS'
      }
      if (agentScopedFunnel) {
        return matchesFunnelFilter(c.lastDisposition)
      }
      if (agentScopedDisposition) {
        return dispositionMatchesFilter(c.lastDisposition, effectiveDisposition!)
      }
      return matchesPendingFilter(c)
    })
    const total = filtered.length
    const clients = filtered.slice(skip, skip + take)
    res.json({ clients, total, page: Number(page), limit: take, pipelineCounts, ...jsonExtras })
    return
  }

  if (sortBy === 'activity') {
    const allCompanies = await fetchCompanies(where, contactWhere, callLogAgentId)
    const scopedIds = allCompanies.map((c) => c.id)
    const [pipelineCounts, enriched] = await Promise.all([
      buildFunnelPipelineCounts(scopedIds, dispositionAgentId),
      enrichWithLastDisposition(allCompanies, dispositionAgentId),
    ])
    const sorted = sortClientsByActivityQueue(enriched)
    const total = sorted.length
    const clients = sorted.slice(skip, skip + take)
    res.json({ clients, total, page: Number(page), limit: take, pipelineCounts, ...jsonExtras })
    return
  }

  const [companies, total, scopedIds] = await Promise.all([
    fetchCompanies(where, contactWhere, callLogAgentId, take, skip),
    prisma.company.count({ where }),
    getScopedCompanyIds(where),
  ])

  const [clients, pipelineCounts] = await Promise.all([
    enrichWithLastDisposition(companies, dispositionAgentId),
    buildFunnelPipelineCounts(scopedIds, dispositionAgentId),
  ])

  res.json({ clients, total, page: Number(page), limit: take, pipelineCounts, ...jsonExtras })
})

// GET /api/clients/:id
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const isAgent = req.user!.role === 'AGENT'
  const contactWhere = isAgent ? { assignment: { agentId: req.user!.id } } : undefined

  if (isAgent) {
    const assignedCount = await prisma.contact.count({
      where: { companyId: req.params.id, assignment: { agentId: req.user!.id } },
    })
    if (assignedCount === 0) {
      res.status(403).json({ error: 'Sin acceso a esta empresa' })
      return
    }
  }

  const company = await prisma.company.findUnique({
    where: { id: req.params.id },
    include: {
      contacts: {
        where: contactWhere,
        include: {
          assignment: { include: { agent: { select: { name: true } } } },
          ...contactCallLogCountForUser(req.user!.id),
        },
        orderBy: { createdAt: 'asc' },
      },
      callLogs: {
        include: {
          agent: { select: { id: true, name: true } },
          contact: { select: { id: true, nombre: true, tipoContacto: true } },
          callback: true,
        },
        orderBy: { updatedAt: 'desc' },
      },
      callbacks: {
        include: { agent: { select: { name: true } } },
        orderBy: { scheduledAt: 'asc' },
      },
      mobileLines: {
        orderBy: { createdAt: 'asc' },
      },
      importBatch: { select: { id: true, filename: true, createdAt: true } },
    },
  })

  if (!company) {
    res.status(404).json({ error: 'Empresa no encontrada' })
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

  if (req.user!.role === 'AGENT') {
    const assignedCount = await prisma.contact.count({
      where: { companyId: req.params.id, assignment: { agentId: req.user!.id } },
    })
    if (assignedCount === 0) {
      res.status(403).json({ error: 'Sin acceso a esta empresa' })
      return
    }
  }

  const updated = await prisma.company.update({
    where: { id: req.params.id },
    data,
  })
  res.json(updated)
})

export default router
