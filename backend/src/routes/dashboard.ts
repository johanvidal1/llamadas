import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth'
import {
  buildCompanyPipelineCounts,
  buildLegacyBucketMetrics,
  buildRunMetrics,
  FUNNEL_PIPELINE_KEYS,
  getLastDispositionByCompanyIds,
  resolveRunBatchId,
} from '../lib/companyDisposition'
import {
  fetchAgentGapStatsSql,
  fetchCallActivitySeriesSql,
  fetchGlobalGapStatsSql,
  fetchTotalCallsSql,
  parseDateParam,
  parseGranularity,
} from '../lib/callActivity'
import { fetchDailyActivityFromSql, fetchHourlyActivity, fetchReportTrends, fetchAgentSparklines } from '../lib/reportTrends'
import { fetchAgentCallsByPeriod, fetchCallHeatmap } from '../lib/reportCharts'

const router = Router()

const REPORTS_CACHE_TTL_MS = 300_000
type ReportsCacheEntry = { data: unknown; expiresAt: number }
const reportsCache = new Map<string, ReportsCacheEntry>()

const REPORTS_SECTIONS = ['summary', 'agents', 'batches'] as const
type ReportsSection = (typeof REPORTS_SECTIONS)[number]

function parseReportsSections(sectionsParam?: string): ReportsSection[] {
  if (!sectionsParam?.trim()) return [...REPORTS_SECTIONS]
  const parsed = sectionsParam
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is ReportsSection => (REPORTS_SECTIONS as readonly string[]).includes(s))
  return parsed.length > 0 ? parsed : [...REPORTS_SECTIONS]
}

function reportsCacheKey(section: ReportsSection | 'agent-runs', filterAgentId?: string, agentId?: string) {
  if (section === 'agent-runs') return `reports:agent-runs:${agentId ?? ''}`
  return `reports:${section}:${filterAgentId ?? 'all'}`
}

function getCachedReports<T>(cacheKey: string, bypassCache: boolean): T | null {
  if (bypassCache) return null
  const cached = reportsCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.data as T
  return null
}

function setCachedReports(cacheKey: string, data: unknown) {
  reportsCache.set(cacheKey, { data, expiresAt: Date.now() + REPORTS_CACHE_TTL_MS })
}

function buildScopedCallWhere(filterAgentId?: string) {
  const assignmentScope = filterAgentId
    ? { agentId: filterAgentId }
    : { agent: { role: 'AGENT' as const, active: true } }
  return {
    contactId: { not: null },
    contact: { assignment: assignmentScope },
    ...(filterAgentId
      ? { agentId: filterAgentId }
      : { agent: { role: 'AGENT' as const, active: true } }),
  }
}

type AgentStatusMaps = {
  agentContactStatusMap: Record<string, Record<string, number>>
  agentCompanyStatusMap: Record<string, Record<string, number>>
  agentCompanyPipelineMap: Record<string, Record<string, number>>
  agentAssignedCompaniesMap: Record<string, number>
}

async function buildAgentStatusMaps(
  agentIds: string[],
  filterAgentId?: string
): Promise<AgentStatusMaps> {
  const empty: AgentStatusMaps = {
    agentContactStatusMap: {},
    agentCompanyStatusMap: {},
    agentCompanyPipelineMap: {},
    agentAssignedCompaniesMap: {},
  }
  if (agentIds.length === 0) return empty

  const assignments = await prisma.assignment.findMany({
    where: {
      agentId: { in: agentIds },
      ...(filterAgentId ? { agentId: filterAgentId } : {}),
    },
    select: {
      agentId: true,
      contact: {
        select: {
          status: true,
          companyId: true,
          company: { select: { status: true } },
        },
      },
    },
  })

  const agentContactStatusMap: Record<string, Record<string, number>> = {}
  const agentCompanyStatusMap: Record<string, Record<string, number>> = {}
  const companyIdsByAgent: Record<string, Set<string>> = {}
  const seenCompanyByAgent = new Set<string>()

  for (const row of assignments) {
    const { agentId } = row
    const { status, companyId, company } = row.contact

    if (!agentContactStatusMap[agentId]) agentContactStatusMap[agentId] = {}
    agentContactStatusMap[agentId][status] = (agentContactStatusMap[agentId][status] ?? 0) + 1

    if (!companyIdsByAgent[agentId]) companyIdsByAgent[agentId] = new Set()
    companyIdsByAgent[agentId].add(companyId)

    const companyKey = `${agentId}:${companyId}`
    if (!seenCompanyByAgent.has(companyKey)) {
      seenCompanyByAgent.add(companyKey)
      if (!agentCompanyStatusMap[agentId]) agentCompanyStatusMap[agentId] = {}
      agentCompanyStatusMap[agentId][company.status] =
        (agentCompanyStatusMap[agentId][company.status] ?? 0) + 1
    }
  }

  const validPairs = new Set(assignments.map((a) => `${a.agentId}:${a.contact.companyId}`))
  const allCompanyIds = [...new Set(assignments.map((a) => a.contact.companyId))]

  const logs =
    allCompanyIds.length > 0
      ? await prisma.callLog.findMany({
          where: {
            companyId: { in: allCompanyIds },
            agentId: { in: agentIds },
          },
          select: {
            companyId: true,
            agentId: true,
            disposition: true,
            aclaracion: true,
            calledAt: true,
            contactId: true,
          },
          orderBy: { calledAt: 'desc' },
        })
      : []

  const lastByAgentCompany = new Map<
    string,
    Map<
      string,
      {
        disposition: string | null
        aclaracion: string | null
        lastCalledAt: Date | null
        lastCallContactId: string | null
        callLogCount: number
      }
    >
  >()

  for (const log of logs) {
    const pairKey = `${log.agentId}:${log.companyId}`
    if (!validPairs.has(pairKey)) continue

    if (!lastByAgentCompany.has(log.agentId)) lastByAgentCompany.set(log.agentId, new Map())
    const agentMap = lastByAgentCompany.get(log.agentId)!
    const existing = agentMap.get(log.companyId)
    if (existing) {
      existing.callLogCount += 1
    } else {
      agentMap.set(log.companyId, {
        disposition: log.disposition,
        aclaracion: log.aclaracion,
        lastCalledAt: log.calledAt,
        lastCallContactId: log.contactId,
        callLogCount: 1,
      })
    }
  }

  const agentCompanyPipelineMap: Record<string, Record<string, number>> = {}
  const agentAssignedCompaniesMap: Record<string, number> = {}

  for (const agentId of agentIds) {
    const companyIds = [...(companyIdsByAgent[agentId] ?? new Set<string>())]
    agentAssignedCompaniesMap[agentId] = companyIds.length

    const lastByCompany = new Map<
      string,
      {
        disposition: string | null
        aclaracion: string | null
        lastCalledAt: Date | null
        lastCallContactId: string | null
        callLogCount: number
      }
    >()
    const agentLogs = lastByAgentCompany.get(agentId)
    for (const companyId of companyIds) {
      lastByCompany.set(
        companyId,
        agentLogs?.get(companyId) ?? {
          disposition: null,
          aclaracion: null,
          lastCalledAt: null,
          lastCallContactId: null,
          callLogCount: 0,
        }
      )
    }
    agentCompanyPipelineMap[agentId] = buildCompanyPipelineCounts(lastByCompany)
  }

  return {
    agentContactStatusMap,
    agentCompanyStatusMap,
    agentCompanyPipelineMap,
    agentAssignedCompaniesMap,
  }
}

function toStatusMap(rows: { status: string; _count: { status: number } }[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const s of rows) map[s.status] = s._count.status
  return map
}

type NextCallbackPayload = { scheduledAt: string; notes?: string } | null

async function enrichRecentCallsWithNextCallback<
  T extends { company: { id: string } },
>(recentCalls: T[], agentId?: string): Promise<(T & { nextCallback: NextCallbackPayload })[]> {
  if (recentCalls.length === 0) return []

  const companyIds = [...new Set(recentCalls.map((c) => c.company.id))]
  const callbacks = await prisma.callback.findMany({
    where: {
      companyId: { in: companyIds },
      completed: false,
      ...(agentId ? { agentId } : {}),
    },
    orderBy: { scheduledAt: 'asc' },
    select: { companyId: true, scheduledAt: true, notes: true },
  })

  const nextByCompany = new Map<string, { scheduledAt: string; notes?: string }>()
  for (const cb of callbacks) {
    if (!nextByCompany.has(cb.companyId)) {
      nextByCompany.set(cb.companyId, {
        scheduledAt: cb.scheduledAt.toISOString(),
        ...(cb.notes ? { notes: cb.notes } : {}),
      })
    }
  }

  return recentCalls.map((call) => ({
    ...call,
    nextCallback: nextByCompany.get(call.company.id) ?? null,
  }))
}

// GET /api/dashboard/stats
router.get('/stats', requireAuth, async (req: AuthRequest, res: Response) => {
  const isAdmin = req.user!.role === 'ADMIN'

  if (isAdmin) {
    const assignedCompanyFilter = { contacts: { some: { assignment: { is: {} } } } }

    const [
      totalClients,
      totalContacts,
      contactsByStatusRows,
      companiesByStatusRows,
      totalAgents,
      totalCalls,
      pendingCallbacks,
      recentCalls,
      assignedCompanyRows,
      assignedContacts,
    ] = await Promise.all([
      prisma.company.count(),
      prisma.contact.count(),
      prisma.contact.groupBy({ by: ['status'], _count: { status: true } }),
      prisma.company.groupBy({ by: ['status'], _count: { status: true } }),
      prisma.user.count({ where: { role: 'AGENT', active: true } }),
      prisma.callLog.count(),
      prisma.callback.count({ where: { completed: false } }),
      prisma.callLog.findMany({
        take: 10,
        orderBy: { calledAt: 'desc' },
        include: {
          company: { select: { id: true, ruc: true, razonSocial: true } },
          contact: { select: { nombre: true } },
          agent: { select: { name: true } },
        },
      }),
      prisma.company.findMany({
        where: assignedCompanyFilter,
        select: { id: true },
      }),
      prisma.assignment.count(),
    ])

    const contactsByStatus = toStatusMap(contactsByStatusRows)
    const companiesByStatus = toStatusMap(companiesByStatusRows)
    const assignedCompanies = assignedCompanyRows.length
    const lastByCompany = await getLastDispositionByCompanyIds(
      assignedCompanyRows.map((c) => c.id),
      undefined
    )
    const companyPipeline = buildCompanyPipelineCounts(lastByCompany)
    const pipelinePending = companyPipeline['PENDING'] ?? 0
    const companyContactRate =
      assignedCompanies > 0
        ? Math.round(((assignedCompanies - pipelinePending) / assignedCompanies) * 100)
        : 0

    const recentCallsWithCallbacks = await enrichRecentCallsWithNextCallback(recentCalls)

    res.json({
      totalClients,
      totalContacts,
      totalAgents,
      totalCalls,
      pendingCallbacks,
      assignedCompanies,
      assignedContacts,
      companyPipeline,
      companyContactRate,
      contactsByStatus,
      companiesByStatus,
      clientsByStatus: companiesByStatus,
      recentCalls: recentCallsWithCallbacks,
    })
  } else {
    const { batchId } = req.query as Record<string, string>
    const batchFilter = batchId ? { company: { importBatchId: batchId } } : {}
    const agentCompanyFilter = {
      contacts: { some: { assignment: { agentId: req.user!.id } } },
      ...(batchId ? { importBatchId: batchId } : {}),
    }
    const callFilter = batchId
      ? { agentId: req.user!.id, company: { importBatchId: batchId } }
      : { agentId: req.user!.id }
    const cbFilter = batchId
      ? { agentId: req.user!.id, company: { importBatchId: batchId } }
      : { agentId: req.user!.id }

    const [assignedContacts, assignedCompanies, totalCalls, pendingCallbacks, todayCallbacks, recentCalls] =
      await Promise.all([
        prisma.assignment.count({ where: { agentId: req.user!.id, ...batchFilter } }),
        prisma.company.findMany({
          where: agentCompanyFilter,
          select: { id: true },
        }),
        prisma.callLog.count({ where: callFilter }),
        prisma.callback.count({ where: { ...cbFilter, completed: false } }),
        prisma.callback.count({
          where: {
            ...cbFilter,
            completed: false,
            scheduledAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
              lte: new Date(new Date().setHours(23, 59, 59, 999)),
            },
          },
        }),
        prisma.callLog.findMany({
          where: callFilter,
          take: 10,
          orderBy: { calledAt: 'desc' },
          include: {
            company: { select: { id: true, ruc: true, razonSocial: true } },
            contact: { select: { nombre: true } },
          },
        }),
      ])

    const lastByCompany = await getLastDispositionByCompanyIds(
      assignedCompanies.map((c) => c.id),
      req.user!.id
    )
    const companyPipeline = buildCompanyPipelineCounts(lastByCompany)
    const recentCallsWithCallbacks = await enrichRecentCallsWithNextCallback(
      recentCalls,
      req.user!.id
    )

    res.json({
      assignedClients: assignedContacts,
      assignedContacts,
      assignedCompanies: assignedCompanies.length,
      totalCalls,
      pendingCallbacks,
      todayCallbacks,
      companyPipeline,
      recentCalls: recentCallsWithCallbacks,
    })
  }
})

// GET /api/dashboard/agents-stats
router.get('/agents-stats', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const agents = await prisma.user.findMany({
    where: { role: 'AGENT', active: true },
    select: { id: true, name: true, _count: { select: { assignments: true, callLogs: true, callbacks: true } } },
  })

  const result = await Promise.all(
    agents.map(async (agent) => {
      const dispositions = await prisma.callLog.groupBy({
        by: ['disposition'],
        _count: { disposition: true },
        where: { agentId: agent.id },
      })
      const dispMap: Record<string, number> = {}
      for (const d of dispositions) dispMap[d.disposition] = d._count.disposition
      return { ...agent, dispositions: dispMap }
    })
  )

  res.json(result)
})

type AgentBreakdownRow = {
  agentId: string
  agentName: string
  assignedCompanies: number
  callCount: number
  contactedCompanies: number
  contactedPct: number
  inFunnel: number
  ventaCerrada: number
  assignmentRuns: BatchAssignmentRun[]
}

type BatchAssignmentRun = {
  id: string
  isLegacy?: boolean
  assignedAt: string | null
  companyCount: number
  assignedBy: { name: string }
  batchLabel: string
  callCount: number
  contactedCompanies: number
  contactedPct: number
  inFunnel: number
  ventaCerrada: number
  pendingCompanies: number
  closeRate: number
}

async function fetchCallsByDay(
  thirtyDaysAgo: Date,
  filterAgentId?: string
): Promise<
  {
    date: string
    count: number
    newRegistrations: number
    updatedRegistrations: number
  }[]
> {
  const rows = await fetchDailyActivityFromSql(thirtyDaysAgo, filterAgentId)
  return rows.map((r) => ({
    date: r.date,
    count: r.calls,
    newRegistrations: r.newRegistrations,
    updatedRegistrations: r.updatedRegistrations,
  }))
}

async function buildBatchAgentBreakdown(batchId: string): Promise<AgentBreakdownRow[]> {
  const [assignmentRows, agents] = await Promise.all([
    prisma.assignment.findMany({
      where: { contact: { company: { importBatchId: batchId } } },
      select: {
        agentId: true,
        contact: { select: { companyId: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: 'AGENT', active: true },
      select: { id: true, name: true },
    }),
  ])

  const agentNameById = Object.fromEntries(agents.map((a) => [a.id, a.name]))
  const byAgent: Record<string, Set<string>> = {}
  for (const row of assignmentRows) {
    if (!byAgent[row.agentId]) byAgent[row.agentId] = new Set()
    byAgent[row.agentId]!.add(row.contact.companyId)
  }

  const agentIds = Object.keys(byAgent)
  if (agentIds.length === 0) return []

  const rows = await Promise.all(
    agentIds.map(async (agentId) => {
      const ids = [...(byAgent[agentId] ?? new Set<string>())]
      const assignedCompanies = ids.length
      if (assignedCompanies === 0) return null

      const [agentCallCount, lastByAgentCompany, assignmentRuns] = await Promise.all([
        prisma.callLog.count({
          where: { agentId, companyId: { in: ids } },
        }),
        getLastDispositionByCompanyIds(ids, agentId),
        buildBatchAssignmentRuns(batchId, agentId),
      ])

      const agentPipeline = buildCompanyPipelineCounts(lastByAgentCompany)
      const agentPending = agentPipeline.PENDING ?? 0
      const contacted = assignedCompanies - agentPending
      const pct = assignedCompanies > 0 ? Math.round((contacted / assignedCompanies) * 100) : 0
      const agentInFunnel = FUNNEL_PIPELINE_KEYS.reduce(
        (sum, key) => sum + (agentPipeline[key] ?? 0),
        0
      )
      const agentVentaCerrada = agentPipeline.VENTA_CERRADA ?? 0

      return {
        agentId,
        agentName: agentNameById[agentId] ?? 'Desconocido',
        assignedCompanies,
        callCount: agentCallCount,
        contactedCompanies: contacted,
        contactedPct: pct,
        inFunnel: agentInFunnel,
        ventaCerrada: agentVentaCerrada,
        assignmentRuns,
      } satisfies AgentBreakdownRow
    })
  )

  return rows
    .filter((r): r is AgentBreakdownRow => r != null)
    .sort((a, b) => b.assignedCompanies - a.assignedCompanies)
}

async function buildReportsSummary(filterAgentId?: string) {
  const companyAgentFilter = filterAgentId
    ? { contacts: { some: { assignment: { agentId: filterAgentId } } } }
    : {}
  const assignedCompanyFilter = filterAgentId
    ? { contacts: { some: { assignment: { agentId: filterAgentId } } } }
    : { contacts: { some: { assignment: { is: {} } } } }
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const scopedCallWhere = buildScopedCallWhere(filterAgentId)

  const [callsByDay, dispositionBreakdown, totalCompanies, assignedCompanyRows, funnelCompanyStatuses] =
    await Promise.all([
      fetchCallsByDay(thirtyDaysAgo, filterAgentId),
      prisma.callLog.groupBy({
        by: ['disposition'],
        _count: { disposition: true },
        where: scopedCallWhere,
      }),
      prisma.company.count({ where: { ...companyAgentFilter } }),
      prisma.company.findMany({ where: assignedCompanyFilter, select: { id: true } }),
      prisma.company.groupBy({
        by: ['status'],
        _count: { status: true },
        where: { ...companyAgentFilter },
      }),
    ])

  const assignedCompanies = assignedCompanyRows.length
  const lastByCompany = await getLastDispositionByCompanyIds(
    assignedCompanyRows.map((c) => c.id),
    filterAgentId || undefined
  )
  const companyPipeline = buildCompanyPipelineCounts(lastByCompany)
  const companyMap = toStatusMap(funnelCompanyStatuses)

  return {
    callsByDay,
    dispositionBreakdown: dispositionBreakdown.map((d) => ({
      disposition: d.disposition,
      count: d._count.disposition,
    })),
    assignedCompanies,
    companyPipeline,
    funnel: {
      companies: {
        total: totalCompanies,
        assigned: assignedCompanies,
        pending: companyMap['PENDING'] ?? 0,
        inProgress: companyMap['IN_PROGRESS'] ?? 0,
        interested: companyMap['INTERESTED'] ?? 0,
        converted: companyMap['CONVERTED'] ?? 0,
        notInterested: companyMap['NOT_INTERESTED'] ?? 0,
        doNotCall: companyMap['DO_NOT_CALL'] ?? 0,
      },
    },
  }
}

async function buildReportsAgents(filterAgentId?: string) {
  const scopedCallWhere = buildScopedCallWhere(filterAgentId)
  const now = new Date()

  const [agents, callsByAgentContact, pendingCallbacks, overdueCallbacks] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'AGENT', active: true },
      select: { id: true, name: true, _count: { select: { assignments: true, callLogs: true } } },
    }),
    prisma.callLog.groupBy({
      by: ['agentId', 'contactId'],
      _count: { contactId: true },
      where: scopedCallWhere,
    }),
    prisma.callback.groupBy({
      by: ['agentId'],
      _count: { agentId: true },
      where: { completed: false },
    }),
    prisma.callback.groupBy({
      by: ['agentId'],
      _count: { agentId: true },
      where: { completed: false, scheduledAt: { lt: now } },
    }),
  ])

  const pendingMap: Record<string, number> = {}
  for (const p of pendingCallbacks) {
    if (p.agentId) pendingMap[p.agentId] = p._count.agentId
  }
  const overdueMap: Record<string, number> = {}
  for (const p of overdueCallbacks) {
    if (p.agentId) overdueMap[p.agentId] = p._count.agentId
  }

  const calledByAgent: Record<string, Set<string>> = {}
  for (const row of callsByAgentContact) {
    if (!row.agentId || !row.contactId) continue
    if (!calledByAgent[row.agentId]) calledByAgent[row.agentId] = new Set()
    calledByAgent[row.agentId].add(row.contactId)
  }

  const agentIds = agents.map((a) => a.id)
  const [statusMaps, sparklinesByAgent] = await Promise.all([
    buildAgentStatusMaps(agentIds, filterAgentId),
    fetchAgentSparklines(agentIds, 7),
  ])
  const {
    agentContactStatusMap,
    agentCompanyStatusMap,
    agentCompanyPipelineMap,
    agentAssignedCompaniesMap,
  } = statusMaps

  const agentPerformance = agents.map((a) => {
    const assigned = a._count.assignments
    const totalCalls = a._count.callLogs
    const calledContacts = calledByAgent[a.id]?.size ?? 0
    const contactStatuses = agentContactStatusMap[a.id] ?? {}
    const companyStatuses = agentCompanyStatusMap[a.id] ?? {}
    const companyPipeline = agentCompanyPipelineMap[a.id] ?? {}
    const assignedCompanies = agentAssignedCompaniesMap[a.id] ?? 0
    const pipelinePending = companyPipeline['PENDING'] ?? 0
    const companiesWithResponse = assignedCompanies - pipelinePending
    const companiesInFunnel =
      (companyPipeline['INTERESADO'] ?? 0) +
      (companyPipeline['PROPUESTA_PRESENTADA'] ?? 0) +
      (companyPipeline['DISCUSION_PROPUESTA'] ?? 0) +
      (companyPipeline['ESPERA_RESPUESTA'] ?? 0) +
      (companyPipeline['VENTA_CERRADA'] ?? 0)
    const interestedRecords = contactStatuses['INTERESTED'] ?? 0
    const convertedRecords = contactStatuses['CONVERTED'] ?? 0
    const notInterestedRecords = contactStatuses['NOT_INTERESTED'] ?? 0
    const pendingRecords = contactStatuses['PENDING'] ?? 0
    const interestedCompanies = companyStatuses['INTERESTED'] ?? 0
    const convertedCompanies = companyStatuses['CONVERTED'] ?? 0
    const notInterestedCompanies = companyStatuses['NOT_INTERESTED'] ?? 0
    const pendingCompanies = companyPipeline['PENDING'] ?? companyStatuses['PENDING'] ?? 0
    const ventaCerrada = companyPipeline['VENTA_CERRADA'] ?? 0
    const closeRate =
      assignedCompanies > 0 ? Math.round((ventaCerrada / assignedCompanies) * 100) : 0
    const contactRate = assigned > 0 ? Math.round((calledContacts / assigned) * 100) : 0
    const companyContactRate =
      assignedCompanies > 0 ? Math.round((companiesWithResponse / assignedCompanies) * 100) : 0
    const conversionRate =
      calledContacts > 0
        ? Math.round(((interestedRecords + convertedRecords) / calledContacts) * 100)
        : 0
    const avgCallsPerContact =
      calledContacts > 0 ? Math.round((totalCalls / calledContacts) * 10) / 10 : 0

    return {
      id: a.id,
      name: a.name,
      assigned,
      assignedCompanies,
      calledClients: calledContacts,
      calledContacts,
      companiesWithResponse,
      companiesInFunnel,
      totalCalls,
      interested: interestedRecords,
      converted: convertedRecords,
      notInterested: notInterestedRecords,
      interestedRecords,
      convertedRecords,
      notInterestedRecords,
      pendingRecords,
      interestedCompanies,
      convertedCompanies,
      notInterestedCompanies,
      pendingCompanies,
      ventaCerrada,
      closeRate,
      contactRate,
      companyContactRate,
      conversionRate,
      avgCallsPerClient: avgCallsPerContact,
      avgCallsPerContact,
      pendingCallbacks: pendingMap[a.id] ?? 0,
      overdueCallbacks: overdueMap[a.id] ?? 0,
      sparkline: sparklinesByAgent[a.id] ?? [],
    }
  })

  return { agentPerformance }
}

async function buildReportsBatches(filterAgentId?: string) {
  const agentFilter = filterAgentId ? { agentId: filterAgentId } : {}
  const globalAssignedCompanyFilter = { contacts: { some: { assignment: { is: {} } } } }
  const scopedCompanyFilter = filterAgentId
    ? { contacts: { some: { assignment: { agentId: filterAgentId } } } }
    : globalAssignedCompanyFilter

  const batches = await prisma.importBatch.findMany({
    select: { id: true, filename: true, displayName: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  const batchProgressData = await Promise.all(
    batches.map(async (b) => {
      const [batchTotalCompanies, assignedCompaniesCount, companyRows] = await Promise.all([
        prisma.company.count({ where: { importBatchId: b.id } }),
        prisma.company.count({ where: { importBatchId: b.id, ...globalAssignedCompanyFilter } }),
        prisma.company.findMany({
          where: { importBatchId: b.id, ...scopedCompanyFilter },
          select: { id: true },
        }),
      ])
      const companyIds = companyRows.map((c) => c.id)
      const assignedToAgentCompanies = filterAgentId ? companyIds.length : null
      const unassignedCompanies = batchTotalCompanies - assignedCompaniesCount
      const [callCount, lastByCompany] = await Promise.all([
        prisma.callLog.count({
          where: {
            company: { importBatchId: b.id, ...scopedCompanyFilter },
            ...agentFilter,
          },
        }),
        getLastDispositionByCompanyIds(companyIds, filterAgentId || undefined),
      ])
      const companyPipeline = buildCompanyPipelineCounts(lastByCompany)
      const scopedTotal = companyIds.length
      const pendingCompanies = companyPipeline.PENDING ?? 0
      const contactedCompanies = scopedTotal - pendingCompanies
      const contactedPct =
        scopedTotal > 0 ? Math.round((contactedCompanies / scopedTotal) * 100) : 0
      const inFunnel = FUNNEL_PIPELINE_KEYS.reduce(
        (sum, key) => sum + (companyPipeline[key] ?? 0),
        0
      )
      const ventaCerrada = companyPipeline.VENTA_CERRADA ?? 0

      return {
        batchId: b.id,
        batchTotalCompanies,
        assignedCompanies: assignedCompaniesCount,
        assignedToAgentCompanies,
        unassignedCompanies,
        callCount,
        contactedCompanies,
        contactedPct,
        inFunnel,
        ventaCerrada,
        pendingCompanies,
        companyPipeline,
      }
    })
  )
  const batchProgressMap = Object.fromEntries(batchProgressData.map((row) => [row.batchId, row]))

  const batchProgress = batches.map((b) => {
    const metrics = batchProgressMap[b.id]
    return {
      id: b.id,
      filename: b.filename,
      createdAt: b.createdAt,
      batchTotalCompanies: metrics?.batchTotalCompanies ?? 0,
      assignedCompanies: metrics?.assignedCompanies ?? 0,
      assignedToAgentCompanies: metrics?.assignedToAgentCompanies ?? null,
      unassignedCompanies: metrics?.unassignedCompanies ?? 0,
      callCount: metrics?.callCount ?? 0,
      contactedCompanies: metrics?.contactedCompanies ?? 0,
      contactedPct: metrics?.contactedPct ?? 0,
      inFunnel: metrics?.inFunnel ?? 0,
      ventaCerrada: metrics?.ventaCerrada ?? 0,
      pendingCompanies: metrics?.pendingCompanies ?? 0,
      companyPipeline: metrics?.companyPipeline ?? {},
    }
  })

  return { batchProgress }
}

async function buildReportsSection(section: ReportsSection, filterAgentId?: string) {
  switch (section) {
    case 'summary':
      return buildReportsSummary(filterAgentId)
    case 'agents':
      return buildReportsAgents(filterAgentId)
    case 'batches':
      return buildReportsBatches(filterAgentId)
  }
}

async function buildReportsData(filterAgentId?: string, sections?: ReportsSection[]) {
  const requested = sections ?? [...REPORTS_SECTIONS]
  const result: Record<string, unknown> = {}
  for (const section of requested) {
    Object.assign(result, await buildReportsSection(section, filterAgentId))
  }
  return result
}

// GET /api/dashboard/reports/batch/:batchId/breakdown
router.get('/reports/batch/:batchId/breakdown', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { batchId } = req.params
  const { agentId: filterAgentId } = req.query as Record<string, string>

  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    select: { id: true },
  })
  if (!batch) {
    res.status(404).json({ error: 'Lote no encontrado' })
    return
  }

  if (filterAgentId) {
    const assignmentRuns = await buildBatchAssignmentRuns(batchId, filterAgentId)
    res.json({ assignmentRuns })
    return
  }

  const agentBreakdown = await buildBatchAgentBreakdown(batchId)
  res.json({ agentBreakdown })
})

// GET /api/dashboard/reports/agent/:agentId/runs
router.get('/reports/agent/:agentId/runs', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { agentId } = req.params
  const { refresh } = req.query as Record<string, string>
  const bypassCache = refresh === 'true' || req.get('x-refresh') === 'true'
  const cacheKey = reportsCacheKey('agent-runs', undefined, agentId)

  const cached = getCachedReports<{ assignmentRuns: BatchAssignmentRun[] }>(cacheKey, bypassCache)
  if (cached) {
    res.json(cached)
    return
  }

  const agent = await prisma.user.findFirst({
    where: { id: agentId, role: 'AGENT', active: true },
    select: { id: true },
  })
  if (!agent) {
    res.status(404).json({ error: 'Agente no encontrado' })
    return
  }

  const assignmentRuns = await buildAgentAssignmentRuns(agentId)
  const data = { assignmentRuns }
  setCachedReports(cacheKey, data)
  res.json(data)
})

// GET /api/dashboard/reports
router.get('/reports', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { agentId: filterAgentId, refresh, sections: sectionsParam } = req.query as Record<string, string>
  const bypassCache = refresh === 'true' || req.get('x-refresh') === 'true'
  const sections = parseReportsSections(sectionsParam)

  const result: Record<string, unknown> = {}
  const sectionsToBuild: ReportsSection[] = []

  for (const section of sections) {
    const cacheKey = reportsCacheKey(section, filterAgentId || undefined)
    const cached = getCachedReports<Record<string, unknown>>(cacheKey, bypassCache)
    if (cached) {
      Object.assign(result, cached)
    } else {
      sectionsToBuild.push(section)
    }
  }

  if (sectionsToBuild.length > 0) {
    const built = await buildReportsData(filterAgentId || undefined, sectionsToBuild)
    for (const section of sectionsToBuild) {
      const sectionData: Record<string, unknown> = {}
      if (section === 'summary') {
        sectionData.callsByDay = built.callsByDay
        sectionData.dispositionBreakdown = built.dispositionBreakdown
        sectionData.assignedCompanies = built.assignedCompanies
        sectionData.companyPipeline = built.companyPipeline
        sectionData.funnel = built.funnel
      } else if (section === 'agents') {
        sectionData.agentPerformance = built.agentPerformance
      } else if (section === 'batches') {
        sectionData.batchProgress = built.batchProgress
      }
      const cacheKey = reportsCacheKey(section, filterAgentId || undefined)
      setCachedReports(cacheKey, sectionData)
      Object.assign(result, sectionData)
    }
  }

  res.json(result)
})

function batchLabelFromImport(
  batch: { displayName?: string | null; filename: string } | null
): string {
  if (!batch) return 'Sin lote'
  return batch.displayName?.trim() || batch.filename.replace(/\.[^.]+$/, '')
}

function resolveRunBatchLabel(
  run: {
    importBatchId: string | null
    importBatch: { displayName?: string | null; filename: string } | null
    assignments: Array<{
      contact: {
        company: {
          importBatchId: string | null
          importBatch: { displayName?: string | null; filename: string } | null
        }
      }
    }>
  },
  batchById: Record<string, { displayName?: string | null; filename: string }>
): string {
  if (run.importBatch) return batchLabelFromImport(run.importBatch)

  const companyBatchIds = run.assignments.map((a) => a.contact.company.importBatchId)
  const resolvedId = resolveRunBatchId(run.importBatchId, companyBatchIds)
  if (resolvedId) {
    const fromMap = batchById[resolvedId]
    if (fromMap) return batchLabelFromImport(fromMap)
    const fromAssignment = run.assignments.find(
      (a) => a.contact.company.importBatchId === resolvedId && a.contact.company.importBatch
    )
    if (fromAssignment?.contact.company.importBatch) {
      return batchLabelFromImport(fromAssignment.contact.company.importBatch)
    }
  }

  return 'Sin lote'
}

async function buildAgentAssignmentRuns(agentId: string): Promise<BatchAssignmentRun[]> {
  const allRuns = await prisma.assignmentRun.findMany({
    where: { agentId },
    select: {
      id: true,
      importBatchId: true,
      companyCount: true,
      createdAt: true,
      assignedBy: { select: { name: true } },
      importBatch: { select: { filename: true, displayName: true } },
      assignments: {
        select: {
          contact: {
            select: {
              company: {
                select: {
                  importBatchId: true,
                  importBatch: { select: { filename: true, displayName: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const mappedRuns: BatchAssignmentRun[] = await Promise.all(
    allRuns.map(async (run) => {
      const metrics = await buildRunMetrics(run.id, agentId, run.companyCount)
      const companyBatchIds = run.assignments.map((a) => a.contact.company.importBatchId)
      const resolvedBatchId = resolveRunBatchId(run.importBatchId, companyBatchIds)
      const batchById: Record<string, { displayName?: string | null; filename: string }> = {}
      if (resolvedBatchId && run.importBatch) {
        batchById[resolvedBatchId] = run.importBatch
      }
      return {
        id: run.id,
        assignedAt: run.createdAt.toISOString(),
        companyCount: run.companyCount,
        assignedBy: { name: run.assignedBy.name },
        batchLabel: resolveRunBatchLabel(run, batchById),
        ...metrics,
      }
    })
  )

  const legacyAssignments = await prisma.assignment.findMany({
    where: { agentId, assignmentRunId: null },
    select: {
      contact: { select: { company: { select: { importBatchId: true } } } },
    },
  })
  const legacyBatchIds = [
    ...new Set(
      legacyAssignments
        .map((a) => a.contact.company.importBatchId)
        .filter((id): id is string => id != null)
    ),
  ]

  const legacyBatchImports =
    legacyBatchIds.length > 0
      ? await prisma.importBatch.findMany({
          where: { id: { in: legacyBatchIds } },
          select: { id: true, filename: true, displayName: true },
        })
      : []
  const legacyBatchById = Object.fromEntries(legacyBatchImports.map((b) => [b.id, b]))

  const legacyRuns: BatchAssignmentRun[] = []
  for (const batchId of legacyBatchIds) {
    const legacy = await buildLegacyBucketMetrics(agentId, batchId)
    if (legacy.companyCount === 0) continue
    const closeRate =
      legacy.companyCount > 0
        ? Math.round((legacy.ventaCerrada / legacy.companyCount) * 100)
        : 0
    const pendingCompanies = legacy.companyCount - legacy.contactedCompanies
    legacyRuns.push({
      id: `legacy-${batchId}`,
      isLegacy: true,
      assignedAt: legacy.earliestAssignedAt?.toISOString() ?? null,
      companyCount: legacy.companyCount,
      assignedBy: { name: 'Asignación anterior' },
      batchLabel: batchLabelFromImport(legacyBatchById[batchId] ?? null),
      callCount: legacy.callCount,
      contactedCompanies: legacy.contactedCompanies,
      contactedPct: legacy.contactedPct,
      inFunnel: legacy.inFunnel,
      ventaCerrada: legacy.ventaCerrada,
      pendingCompanies,
      closeRate,
    })
  }

  return [...mappedRuns, ...legacyRuns].sort(
    (a, b) => new Date(b.assignedAt ?? 0).getTime() - new Date(a.assignedAt ?? 0).getTime()
  )
}

async function buildBatchAssignmentRuns(
  batchId: string,
  filterAgentId: string
): Promise<BatchAssignmentRun[]> {
  const batchImport = await prisma.importBatch.findUnique({
    where: { id: batchId },
    select: { filename: true, displayName: true },
  })
  const batchLabel = batchLabelFromImport(batchImport)

  const allRuns = await prisma.assignmentRun.findMany({
    where: { agentId: filterAgentId },
    select: {
      id: true,
      importBatchId: true,
      companyCount: true,
      createdAt: true,
      assignedBy: { select: { name: true } },
      importBatch: { select: { filename: true, displayName: true } },
      assignments: {
        select: {
          contact: {
            select: {
              company: {
                select: {
                  importBatchId: true,
                  importBatch: { select: { filename: true, displayName: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const runs: BatchAssignmentRun[] = []
  for (const run of allRuns) {
    const companyBatchIds = run.assignments.map((a) => a.contact.company.importBatchId)
    const resolvedBatchId = resolveRunBatchId(run.importBatchId, companyBatchIds)
    if (resolvedBatchId !== batchId) continue
    const metrics = await buildRunMetrics(run.id, filterAgentId, run.companyCount)
    runs.push({
      id: run.id,
      assignedAt: run.createdAt.toISOString(),
      companyCount: run.companyCount,
      assignedBy: { name: run.assignedBy.name },
      batchLabel: run.importBatch
        ? batchLabelFromImport(run.importBatch)
        : batchLabel,
      ...metrics,
    })
  }

  const legacy = await buildLegacyBucketMetrics(filterAgentId, batchId)
  if (legacy.companyCount > 0) {
    const closeRate =
      legacy.companyCount > 0
        ? Math.round((legacy.ventaCerrada / legacy.companyCount) * 100)
        : 0
    const pendingCompanies = legacy.companyCount - legacy.contactedCompanies
    runs.push({
      id: `legacy-${batchId}`,
      isLegacy: true,
      assignedAt: legacy.earliestAssignedAt?.toISOString() ?? null,
      companyCount: legacy.companyCount,
      assignedBy: { name: 'Asignación anterior' },
      batchLabel,
      callCount: legacy.callCount,
      contactedCompanies: legacy.contactedCompanies,
      contactedPct: legacy.contactedPct,
      inFunnel: legacy.inFunnel,
      ventaCerrada: legacy.ventaCerrada,
      pendingCompanies,
      closeRate,
    })
  }

  return runs.sort(
    (a, b) => new Date(b.assignedAt ?? 0).getTime() - new Date(a.assignedAt ?? 0).getTime()
  )
}

async function buildSingleBatchMetrics(batchId: string, filterAgentId?: string) {
  const globalAssignedCompanyFilter = { contacts: { some: { assignment: { is: {} } } } }
  const scopedCompanyFilter = filterAgentId
    ? { contacts: { some: { assignment: { agentId: filterAgentId } } } }
    : globalAssignedCompanyFilter
  const agentFilter = filterAgentId ? { agentId: filterAgentId } : {}

  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    select: { id: true, filename: true, createdAt: true },
  })
  if (!batch) return null

  const [batchTotalCompanies, assignedCompaniesCount, companyRows] = await Promise.all([
    prisma.company.count({ where: { importBatchId: batchId } }),
    prisma.company.count({ where: { importBatchId: batchId, ...globalAssignedCompanyFilter } }),
    prisma.company.findMany({
      where: { importBatchId: batchId, ...scopedCompanyFilter },
      select: { id: true },
    }),
  ])

  const companyIds = companyRows.map((c) => c.id)
  const assignedToAgentCompanies = filterAgentId ? companyIds.length : null
  const unassignedCompanies = batchTotalCompanies - assignedCompaniesCount

  const [callCount, lastByCompany] = await Promise.all([
    prisma.callLog.count({
      where: {
        company: { importBatchId: batchId, ...scopedCompanyFilter },
        ...agentFilter,
      },
    }),
    getLastDispositionByCompanyIds(companyIds, filterAgentId || undefined),
  ])

  const companyPipeline = buildCompanyPipelineCounts(lastByCompany)
  const scopedTotal = companyIds.length
  const pendingCompanies = companyPipeline.PENDING ?? 0
  const contactedCompanies = scopedTotal - pendingCompanies
  const contactedPct = scopedTotal > 0 ? Math.round((contactedCompanies / scopedTotal) * 100) : 0
  const inFunnel = FUNNEL_PIPELINE_KEYS.reduce(
    (sum, key) => sum + (companyPipeline[key] ?? 0),
    0
  )
  const ventaCerrada = companyPipeline.VENTA_CERRADA ?? 0

  const assignmentRuns = filterAgentId
    ? await buildBatchAssignmentRuns(batchId, filterAgentId)
    : undefined

  return {
    id: batch.id,
    filename: batch.filename,
    createdAt: batch.createdAt,
    batchTotalCompanies,
    assignedCompanies: assignedCompaniesCount,
    assignedToAgentCompanies,
    unassignedCompanies,
    callCount,
    contactedCompanies,
    contactedPct,
    inFunnel,
    ventaCerrada,
    pendingCompanies,
    companyPipeline,
    assignmentRuns,
  }
}

// GET /api/dashboard/reports/trends
router.get('/reports/trends', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { from, to, agentId, granularity } = req.query as Record<string, string>
  const data = await fetchReportTrends({ from, to, agentId, granularity })
  res.json(data)
})

// GET /api/dashboard/reports/agent-calls
router.get('/reports/agent-calls', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { period, date } = req.query as Record<string, string>
  const data = await fetchAgentCallsByPeriod({ period, date })
  res.json(data)
})

// GET /api/dashboard/reports/call-heatmap
router.get('/reports/call-heatmap', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { weeks, agentId } = req.query as Record<string, string>
  const data = await fetchCallHeatmap({ weeks, agentId })
  res.json(data)
})

// GET /api/dashboard/reports/hourly
router.get('/reports/hourly', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { date, agentId } = req.query as Record<string, string>
  if (!agentId) {
    res.status(400).json({ error: 'Se requiere agentId' })
    return
  }
  const dateStr = date ?? new Date().toISOString().slice(0, 10)
  const series = await fetchHourlyActivity(dateStr, agentId)
  res.json({ date: dateStr, agentId, series })
})

// GET /api/dashboard/call-activity
router.get('/call-activity', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { agentId, batchId, from, to, granularity: granularityParam } = req.query as Record<
    string,
    string
  >

  const now = new Date()
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 30)
  defaultFrom.setHours(0, 0, 0, 0)

  const fromDate = parseDateParam(from, defaultFrom)
  fromDate.setHours(0, 0, 0, 0)
  const toDate = parseDateParam(to, now)
  toDate.setHours(23, 59, 59, 999)
  const granularity = parseGranularity(granularityParam)
  const activityFilters = { from: fromDate, to: toDate, agentId, batchId }

  const [series, gapRows, totalCalls, globalStats, agents] = await Promise.all([
    fetchCallActivitySeriesSql(activityFilters, granularity),
    fetchAgentGapStatsSql(activityFilters),
    fetchTotalCallsSql(activityFilters),
    fetchGlobalGapStatsSql(activityFilters),
    prisma.user.findMany({
      where: { role: 'AGENT', active: true },
      select: { id: true, name: true },
    }),
  ])

  const agentNameMap = Object.fromEntries(agents.map((a) => [a.id, a.name]))
  const byAgent = gapRows
    .map((row) => ({
      agentId: row.agentId,
      name: agentNameMap[row.agentId] ?? 'Desconocido',
      totalCalls: Number(row.totalCalls),
      avgGapMinutes: row.avgGapMinutes,
      medianGapMinutes: row.medianGapMinutes,
      gapCount: Number(row.gapCount),
    }))
    .sort((a, b) => b.totalCalls - a.totalCalls)

  res.json({
    series,
    byAgent,
    totalCalls,
    avgGapMinutes: globalStats.avgGapMinutes,
    medianGapMinutes: globalStats.medianGapMinutes,
    gapCount: globalStats.gapCount,
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    granularity,
  })
})

// GET /api/dashboard/batch/:batchId
router.get('/batch/:batchId', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { batchId } = req.params
  const { agentId: filterAgentId } = req.query as Record<string, string>

  const batch = await buildSingleBatchMetrics(batchId, filterAgentId || undefined)
  if (!batch) {
    res.status(404).json({ error: 'Lote no encontrado' })
    return
  }

  res.json(batch)
})

// GET /api/dashboard/my-batches
router.get('/my-batches', requireAuth, async (req: AuthRequest, res: Response) => {
  const agentId = req.user!.id

  const batches = await prisma.importBatch.findMany({
    where: { companies: { some: { contacts: { some: { assignment: { agentId } } } } } },
    select: { id: true, filename: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  const counts = await Promise.all(
    batches.map((b) =>
      prisma.assignment.count({
        where: { agentId, contact: { company: { importBatchId: b.id } } },
      })
    )
  )

  res.json(batches.map((b, i) => ({ ...b, clientCount: counts[i], contactCount: counts[i] })))
})

export default router
