import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { buildCalledAtRange } from '../lib/callActivity'
import { requireAuth, AuthRequest } from '../middleware/auth'
import {
  getAclaracionForDisposition,
  isHiddenFromAgentQueue,
  isValidDisposition,
} from '../lib/responseOptions'
import {
  buildCompanyPipelineCounts,
  buildDaySummary,
  dispositionMatchesFilter,
  filterCompanyIdsByLastActivityRange,
  FUNNEL_PIPELINE_KEYS,
  getCallCountsInPeriodByCompanyIds,
  getCallCountsInPeriodByCompanyIdsPerAssignment,
  getFirstRegisteredAtByCompanyIds,
  getFirstRegisteredAtByCompanyIdsPerAssignment,
  getLastDispositionByCompanyIds,
  getLastDispositionByCompanyIdsPerAssignment,
  isActiveNoContesta,
  isDepuradoNoContesta,
  isNoContestaDisposition,
  matchesFunnelFilter,
  pipelineBucketForDisposition,
  sortClientsByActivityQueue,
  sortCompanyIdsByActivityQueue,
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

/** Last-disposition scope: agent filter, or per-company assigned agent when admin sees all. */
function dispositionScopeAgentId(
  role: string,
  userId: string,
  agentId?: string
): string | undefined {
  if (role === 'AGENT') return userId
  if (agentId) return agentId
  return undefined
}

function dispositionPerAssignedAgent(role: string, agentId?: string): boolean {
  return role !== 'AGENT' && !agentId
}

type LastDispositionMap = Awaited<ReturnType<typeof getLastDispositionByCompanyIds>>

async function loadLastDispositionByCompanyIds(
  companyIds: string[],
  dispositionAgentId: string | undefined,
  perAssignedAgent: boolean
): Promise<LastDispositionMap> {
  if (perAssignedAgent) {
    return getLastDispositionByCompanyIdsPerAssignment(companyIds)
  }
  return getLastDispositionByCompanyIds(companyIds, dispositionAgentId)
}

async function loadFirstRegisteredAtByCompanyIds(
  companyIds: string[],
  dispositionAgentId: string | undefined,
  perAssignedAgent: boolean
): Promise<Map<string, Date>> {
  if (perAssignedAgent) {
    return getFirstRegisteredAtByCompanyIdsPerAssignment(companyIds)
  }
  return getFirstRegisteredAtByCompanyIds(companyIds, dispositionAgentId)
}

async function loadCallCountsInPeriodByCompanyIds(
  companyIds: string[],
  calledAtRange: { gte?: Date; lte?: Date },
  dispositionAgentId: string | undefined,
  perAssignedAgent: boolean
): Promise<Map<string, number>> {
  if (perAssignedAgent) {
    return getCallCountsInPeriodByCompanyIdsPerAssignment(companyIds, calledAtRange)
  }
  return getCallCountsInPeriodByCompanyIds(companyIds, calledAtRange, dispositionAgentId)
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
  dispositionAgentId?: string,
  preloadedLast?: LastDispositionMap,
  calledAtRange?: { gte?: Date; lte?: Date },
  perAssignedAgent = false
): Promise<
  (CompanyRow & {
    lastDisposition: string | null
    lastAclaracion: string | null
    lastCalledAt: string | null
    firstRegisteredAt: string | null
    lastCallContactId: string | null
    lastCallAgent?: { id: string; name: string } | null
    callLogCount: number
    periodCallCount?: number
  })[]
> {
  if (companies.length === 0) return []

  const companyIds = companies.map((c) => c.id)
  const [lastByCompany, firstByCompany, periodCounts] = await Promise.all([
    preloadedLast
      ? Promise.resolve(preloadedLast)
      : loadLastDispositionByCompanyIds(companyIds, dispositionAgentId, perAssignedAgent),
    loadFirstRegisteredAtByCompanyIds(companyIds, dispositionAgentId, perAssignedAgent),
    calledAtRange
      ? loadCallCountsInPeriodByCompanyIds(
          companyIds,
          calledAtRange,
          dispositionAgentId,
          perAssignedAgent
        )
      : Promise.resolve(null),
  ])

  return companies.map((c) => {
    const last = lastByCompany.get(c.id)
    const disposition = last?.disposition ?? null
    const firstAt = firstByCompany.get(c.id)
    return {
      ...c,
      lastDisposition: disposition,
      lastAclaracion: last?.aclaracion ?? getAclaracionForDisposition(disposition ?? '') ?? null,
      lastCalledAt: last?.lastCalledAt?.toISOString() ?? null,
      firstRegisteredAt: firstAt?.toISOString() ?? null,
      lastCallContactId: last?.lastCallContactId ?? null,
      lastCallAgent: last?.lastCallAgent ?? null,
      callLogCount: last?.callLogCount ?? 0,
      ...(periodCounts ? { periodCallCount: periodCounts.get(c.id) ?? 0 } : {}),
    }
  })
}

function emptyFunnelPipelineCounts(): Record<string, number> {
  return Object.fromEntries(FUNNEL_PIPELINE_KEYS.map((k) => [k, 0]))
}

async function getScopedCompanyIds(where: Record<string, unknown>): Promise<string[]> {
  const rows = await prisma.company.findMany({ where, select: { id: true } })
  return rows.map((r) => r.id)
}

type LightweightCompanyRow = {
  id: string
  ruc: string
  globalCallLogCount: number
}

async function fetchLightweightCompanies(
  where: Record<string, unknown>
): Promise<LightweightCompanyRow[]> {
  const rows = await prisma.company.findMany({
    where,
    select: { id: true, ruc: true, _count: { select: { callLogs: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((r) => ({
    id: r.id,
    ruc: r.ruc,
    globalCallLogCount: r._count.callLogs,
  }))
}

async function fetchCompaniesByIdsInOrder(
  ids: string[],
  contactWhere: Record<string, unknown> | undefined,
  agentUserId: string
): Promise<CompanyRow[]> {
  if (ids.length === 0) return []
  const companies = await fetchCompanies(
    { id: { in: ids } },
    contactWhere,
    agentUserId
  )
  const orderMap = new Map(ids.map((id, i) => [id, i]))
  companies.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))
  return companies
}

type ClientsFilterContext = {
  where: Record<string, unknown>
  contactWhere: Record<string, unknown> | undefined
  callLogAgentId: string
  dispositionAgentId: string | undefined
  dispositionPerAssignedAgent: boolean
  calledAtRange?: { gte?: Date; lte?: Date }
  registrationCount?: number
  effectiveDisposition?: string
  agentScopedPending: boolean
  agentScopedOtros: boolean
  agentScopedFunnel: boolean
  agentScopedNoContesta: boolean
  agentScopedNoContestaDepurado: boolean
  agentScopedDisposition: boolean
  includeAssignmentSummary: boolean
  /** Agent default queue (Cola Todos): exclude archived dispositions unless explicitly filtered. */
  agentQueueExcludeArchived: boolean
}

async function buildClientsFilterContext(
  req: AuthRequest,
  query: Record<string, string>
): Promise<ClientsFilterContext | { empty: true; take: number; page: number; registrationCount?: number }> {
  const {
    status,
    disposition,
    search,
    batchId,
    agentId,
    registeredFrom,
    registeredTo,
  } = query

  const take = Math.min(Number(query.limit) || 50, 500)
  const page = Math.max(Number(query.page) || 1, 1)
  const isAgent = req.user!.role === 'AGENT'
  const callLogAgentId = scopedAgentId(req.user!.role, req.user!.id, agentId)
  const dispositionAgentId = dispositionScopeAgentId(req.user!.role, req.user!.id, agentId)
  const dispositionPerAssignedAgentFlag = dispositionPerAssignedAgent(req.user!.role, agentId)
  const filterParam = query.filter
  const effectiveDisposition =
    disposition || (filterParam && filterParam !== 'PENDING' ? filterParam : undefined)
  const calledAtRange = buildCalledAtRange(registeredFrom, registeredTo)
  const agentScopedPending = status === 'PENDING' || filterParam === 'PENDING'
  const agentScopedOtros = effectiveDisposition === 'OTROS'
  const agentScopedFunnel = effectiveDisposition === 'FUNNEL'
  const agentScopedNoContesta = effectiveDisposition === 'NO_CONTESTA'
  const agentScopedNoContestaDepurado = effectiveDisposition === 'NO_CONTESTA_DEPURADO'
  const agentScopedDisposition =
    !!effectiveDisposition &&
    !agentScopedOtros &&
    !agentScopedFunnel &&
    !agentScopedNoContesta &&
    !agentScopedNoContestaDepurado &&
    isValidDisposition(effectiveDisposition)

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

  let registrationCount: number | undefined

  if (calledAtRange) {
    const scopedIds = await getScopedCompanyIds(where)
    const companyIdsInRange = await filterCompanyIdsByLastActivityRange(
      scopedIds,
      calledAtRange,
      dispositionAgentId,
      dispositionPerAssignedAgentFlag
    )
    registrationCount = companyIdsInRange.length
    if (companyIdsInRange.length === 0) {
      return { empty: true, take, page, registrationCount: 0 }
    }
    where.id = { in: companyIdsInRange }
  }

  const agentQueueExcludeArchived =
    isAgent &&
    !agentScopedPending &&
    !agentScopedOtros &&
    !agentScopedFunnel &&
    !agentScopedDisposition &&
    !agentScopedNoContesta &&
    !agentScopedNoContestaDepurado &&
    !status

  return {
    where,
    contactWhere,
    callLogAgentId,
    dispositionAgentId,
    dispositionPerAssignedAgent: dispositionPerAssignedAgentFlag,
    ...(calledAtRange ? { calledAtRange } : {}),
    registrationCount,
    effectiveDisposition,
    agentScopedPending,
    agentScopedOtros,
    agentScopedFunnel,
    agentScopedNoContesta,
    agentScopedNoContestaDepurado,
    agentScopedDisposition,
    includeAssignmentSummary: !!agentId,
    agentQueueExcludeArchived,
  }
}

async function getActivitySortedClientsPage(
  ctx: ClientsFilterContext,
  skip: number,
  take: number
) {
  const lightweight = await fetchLightweightCompanies(ctx.where)
  let sortedIds = await sortCompanyIdsByActivityQueue(
    lightweight,
    ctx.dispositionAgentId,
    ctx.dispositionPerAssignedAgent
  )
  if (ctx.agentQueueExcludeArchived) {
    const lastByCompany = await loadLastDispositionByCompanyIds(
      sortedIds,
      ctx.dispositionAgentId,
      ctx.dispositionPerAssignedAgent
    )
    sortedIds = sortedIds.filter((id) => {
      const last = lastByCompany.get(id)
      const disposition = last?.disposition ?? null
      const callLogCount = last?.callLogCount ?? 0
      if (isHiddenFromAgentQueue(disposition)) return false
      if (isDepuradoNoContesta(disposition, callLogCount)) return false
      return true
    })
  }
  const total = sortedIds.length
  const pageIds = sortedIds.slice(skip, skip + take)
  const lastByCompany = await loadLastDispositionByCompanyIds(
    pageIds,
    ctx.dispositionAgentId,
    ctx.dispositionPerAssignedAgent
  )
  const companies = await fetchCompaniesByIdsInOrder(
    pageIds,
    ctx.contactWhere,
    ctx.callLogAgentId
  )
  const clients = await enrichWithLastDisposition(
    companies,
    ctx.dispositionAgentId,
    lastByCompany,
    ctx.calledAtRange,
    ctx.dispositionPerAssignedAgent
  )
  return { clients, total }
}

async function getFilteredDispositionClientsPage(
  ctx: ClientsFilterContext,
  skip: number,
  take: number
) {
  const lightweight = await fetchLightweightCompanies(ctx.where)
  const companyIds = lightweight.map((c) => c.id)
  const lastByCompany = await loadLastDispositionByCompanyIds(
    companyIds,
    ctx.dispositionAgentId,
    ctx.dispositionPerAssignedAgent
  )

  const filteredIds: string[] = []
  for (const row of lightweight) {
    const last = lastByCompany.get(row.id)
    const disposition = last?.disposition ?? null
    const callLogCount = last?.callLogCount ?? 0
    if (ctx.agentScopedOtros) {
      if (
        pipelineBucketForDisposition(disposition) === 'OTROS' &&
        !isNoContestaDisposition(disposition)
      ) {
        filteredIds.push(row.id)
      }
      continue
    }
    if (ctx.agentScopedNoContesta) {
      if (isActiveNoContesta(disposition, callLogCount)) filteredIds.push(row.id)
      continue
    }
    if (ctx.agentScopedNoContestaDepurado) {
      if (isDepuradoNoContesta(disposition, callLogCount)) filteredIds.push(row.id)
      continue
    }
    if (ctx.agentScopedFunnel) {
      if (matchesFunnelFilter(disposition)) filteredIds.push(row.id)
      continue
    }
    if (ctx.agentScopedDisposition) {
      if (dispositionMatchesFilter(disposition, ctx.effectiveDisposition!)) {
        filteredIds.push(row.id)
      }
      continue
    }
    if (ctx.agentScopedPending) {
      if (disposition == null) filteredIds.push(row.id)
      continue
    }
  }

  const sortable = filteredIds.map((id) => {
    const row = lightweight.find((c) => c.id === id)!
    const last = lastByCompany.get(id)
    return {
      id,
      ruc: row.ruc,
      lastDisposition: last?.disposition ?? null,
      lastCalledAt: last?.lastCalledAt ?? null,
      _count: { callLogs: row.globalCallLogCount },
    }
  })
  const sortedIds = sortClientsByActivityQueue(sortable).map((r) => r.id)
  const total = sortedIds.length
  const pageIds = sortedIds.slice(skip, skip + take)
  const pageLastByCompany = new Map(
    pageIds.map((id) => [id, lastByCompany.get(id)!])
  )
  const companies = await fetchCompaniesByIdsInOrder(
    pageIds,
    ctx.contactWhere,
    ctx.callLogAgentId
  )
  const clients = await enrichWithLastDisposition(
    companies,
    ctx.dispositionAgentId,
    pageLastByCompany,
    ctx.calledAtRange,
    ctx.dispositionPerAssignedAgent
  )
  return { clients, total }
}

type AssignmentSummary = {
  assignedCompanies: number
  pendingCompanies: number
  registeredCompanies: number
}

type PipelineScopeData = {
  pipelineCounts: Record<string, number>
  assignmentSummary?: AssignmentSummary
}

async function buildPipelineScopeData(
  companyIds: string[],
  dispositionAgentId?: string,
  includeAssignmentSummary = false,
  dispositionPerAssignedAgent = false
): Promise<PipelineScopeData> {
  if (companyIds.length === 0) {
    return {
      pipelineCounts: emptyFunnelPipelineCounts(),
      ...(includeAssignmentSummary
        ? {
            assignmentSummary: {
              assignedCompanies: 0,
              pendingCompanies: 0,
              registeredCompanies: 0,
            },
          }
        : {}),
    }
  }
  const lastByCompany = await loadLastDispositionByCompanyIds(
    companyIds,
    dispositionAgentId,
    dispositionPerAssignedAgent
  )
  const companyPipeline = buildCompanyPipelineCounts(lastByCompany)
  const pipelineCounts = Object.fromEntries(
    FUNNEL_PIPELINE_KEYS.map((k) => [k, companyPipeline[k]])
  )
  if (!includeAssignmentSummary) {
    return { pipelineCounts }
  }
  const pendingCompanies = companyPipeline.PENDING ?? 0
  const assignedCompanies = companyIds.length
  return {
    pipelineCounts,
    assignmentSummary: {
      assignedCompanies,
      pendingCompanies,
      registeredCompanies: assignedCompanies - pendingCompanies,
    },
  }
}

// GET /api/clients/pipeline-summary — funnel counts without full client list
router.get('/pipeline-summary', requireAuth, async (req: AuthRequest, res: Response) => {
  const query = req.query as Record<string, string>
  const built = await buildClientsFilterContext(req, query)
  const take = Math.min(Number(query.limit) || 50, 500)
  const page = Math.max(Number(query.page) || 1, 1)

  if ('empty' in built) {
    res.json({
      pipelineCounts: emptyFunnelPipelineCounts(),
      ...(built.registrationCount !== undefined ? { registrationCount: built.registrationCount } : {}),
    })
    return
  }

  const scopedIds = await getScopedCompanyIds(built.where)
  const { pipelineCounts, assignmentSummary } = await buildPipelineScopeData(
    scopedIds,
    built.dispositionAgentId,
    built.includeAssignmentSummary,
    built.dispositionPerAssignedAgent
  )

  res.json({
    pipelineCounts,
    ...(assignmentSummary ? { assignmentSummary } : {}),
    ...(built.registrationCount !== undefined ? { registrationCount: built.registrationCount } : {}),
    total: scopedIds.length,
    page,
    limit: take,
  })
})

// GET /api/clients/day-summary — per-day counts for grouped day view headers
router.get('/day-summary', requireAuth, async (req: AuthRequest, res: Response) => {
  const query = req.query as Record<string, string>
  const built = await buildClientsFilterContext(req, query)

  if ('empty' in built) {
    res.json({ days: [], total: 0 })
    return
  }

  const scopedIds = await getScopedCompanyIds(built.where)
  const days = await buildDaySummary(
    scopedIds,
    built.dispositionAgentId,
    built.dispositionPerAssignedAgent
  )
  res.json({ days, total: scopedIds.length })
})

// GET /api/clients — ADMIN sees all, AGENT sees only assigned contacts
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const query = req.query as Record<string, string>
  const {
    page = '1',
    limit = '50',
    unassigned,
    sortBy,
    includePipeline = 'true',
  } = query

  const take = Math.min(Number(limit) || 50, 500)
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take
  const isAgent = req.user!.role === 'AGENT'
  const shouldIncludePipeline = includePipeline !== 'false'

  if (unassigned === 'true' && !isAgent) {
    const { batchId } = query
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

  const built = await buildClientsFilterContext(req, query)
  if ('empty' in built) {
    res.json({
      clients: [],
      total: 0,
      page: Number(page),
      limit: take,
      registrationCount: built.registrationCount ?? 0,
      ...(shouldIncludePipeline ? { pipelineCounts: emptyFunnelPipelineCounts() } : {}),
    })
    return
  }

  const jsonExtras =
    built.registrationCount !== undefined ? { registrationCount: built.registrationCount } : {}

  const needsDispositionFilter =
    built.agentScopedDisposition ||
    built.agentScopedPending ||
    built.agentScopedOtros ||
    built.agentScopedFunnel ||
    built.agentScopedNoContesta ||
    built.agentScopedNoContestaDepurado

  if (needsDispositionFilter || sortBy === 'activity' || built.agentQueueExcludeArchived) {
    const { clients, total } = needsDispositionFilter
      ? await getFilteredDispositionClientsPage(built, skip, take)
      : await getActivitySortedClientsPage(built, skip, take)

    let pipelineCounts: Record<string, number> | undefined
    let assignmentSummary: AssignmentSummary | undefined
    if (shouldIncludePipeline) {
      const scopedIds = await getScopedCompanyIds(built.where)
      const pipelineData = await buildPipelineScopeData(
        scopedIds,
        built.dispositionAgentId,
        built.includeAssignmentSummary,
        built.dispositionPerAssignedAgent
      )
      pipelineCounts = pipelineData.pipelineCounts
      assignmentSummary = pipelineData.assignmentSummary
    }

    res.json({
      clients,
      total,
      page: Number(page),
      limit: take,
      ...(pipelineCounts ? { pipelineCounts } : {}),
      ...(assignmentSummary ? { assignmentSummary } : {}),
      ...jsonExtras,
    })
    return
  }

  const [companies, total, scopedIds] = await Promise.all([
    fetchCompanies(built.where, built.contactWhere, built.callLogAgentId, take, skip),
    prisma.company.count({ where: built.where }),
    getScopedCompanyIds(built.where),
  ])

  const [pipelineData, clients] = await Promise.all([
    shouldIncludePipeline
      ? buildPipelineScopeData(
          scopedIds,
          built.dispositionAgentId,
          built.includeAssignmentSummary,
          built.dispositionPerAssignedAgent
        )
      : Promise.resolve({ pipelineCounts: undefined, assignmentSummary: undefined }),
    enrichWithLastDisposition(
      companies,
      built.dispositionAgentId,
      undefined,
      built.calledAtRange,
      built.dispositionPerAssignedAgent
    ),
  ])

  res.json({
    clients,
    total,
    page: Number(page),
    limit: take,
    ...(pipelineData.pipelineCounts ? { pipelineCounts: pipelineData.pipelineCounts } : {}),
    ...(pipelineData.assignmentSummary ? { assignmentSummary: pipelineData.assignmentSummary } : {}),
    ...jsonExtras,
  })
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
