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
  buildCallActivitySeries,
  buildCallGapStats,
  parseDateParam,
  parseGranularity,
} from '../lib/callActivity'

const router = Router()

function toStatusMap(rows: { status: string; _count: { status: number } }[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const s of rows) map[s.status] = s._count.status
  return map
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
        take: 5,
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
      recentCalls,
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
          take: 5,
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

    res.json({
      assignedClients: assignedContacts,
      assignedContacts,
      assignedCompanies: assignedCompanies.length,
      totalCalls,
      pendingCallbacks,
      todayCallbacks,
      companyPipeline,
      recentCalls,
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

// GET /api/dashboard/reports
router.get('/reports', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { agentId: filterAgentId } = req.query as Record<string, string>
  const agentFilter = filterAgentId ? { agentId: filterAgentId } : {}
  const companyAgentFilter = filterAgentId
    ? { contacts: { some: { assignment: { agentId: filterAgentId } } } }
    : {}
  const assignedCompanyFilter = filterAgentId
    ? { contacts: { some: { assignment: { agentId: filterAgentId } } } }
    : { contacts: { some: { assignment: { is: {} } } } }
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const now = new Date()

  const [agents, allCallLogs, dispositionBreakdown, batches, callsByAgentContact, pendingCallbacks, overdueCallbacks] =
    await Promise.all([
      prisma.user.findMany({
        where: { role: 'AGENT', active: true },
        select: { id: true, name: true, _count: { select: { assignments: true, callLogs: true } } },
      }),
      prisma.callLog.findMany({
        where: { calledAt: { gte: thirtyDaysAgo }, ...agentFilter },
        select: { calledAt: true },
        orderBy: { calledAt: 'asc' },
      }),
      prisma.callLog.groupBy({ by: ['disposition'], _count: { disposition: true }, where: { ...agentFilter } }),
      prisma.importBatch.findMany({ select: { id: true, filename: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
      prisma.callLog.groupBy({
        by: ['agentId', 'contactId'],
        _count: { contactId: true },
        where: { contactId: { not: null }, ...agentFilter },
      }),
      prisma.callback.groupBy({ by: ['agentId'], _count: { agentId: true }, where: { completed: false } }),
      prisma.callback.groupBy({ by: ['agentId'], _count: { agentId: true }, where: { completed: false, scheduledAt: { lt: now } } }),
    ])

  const callsByDay: Record<string, number> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    callsByDay[d.toISOString().slice(0, 10)] = 0
  }
  for (const c of allCallLogs) {
    const day = new Date(c.calledAt).toISOString().slice(0, 10)
    if (day in callsByDay) callsByDay[day] = (callsByDay[day] ?? 0) + 1
  }

  const pendingMap: Record<string, number> = {}
  for (const p of pendingCallbacks) { if (p.agentId) pendingMap[p.agentId] = p._count.agentId }
  const overdueMap: Record<string, number> = {}
  for (const p of overdueCallbacks) { if (p.agentId) overdueMap[p.agentId] = p._count.agentId }

  const calledByAgent: Record<string, Set<string>> = {}
  for (const row of callsByAgentContact) {
    if (!row.agentId || !row.contactId) continue
    if (!calledByAgent[row.agentId]) calledByAgent[row.agentId] = new Set()
    calledByAgent[row.agentId].add(row.contactId)
  }

  const agentStatusData = await Promise.all(
    agents.map(async (a) => {
      const [contactRows, companyRows, assignedCompanyRows] = await Promise.all([
        prisma.contact.groupBy({
          by: ['status'],
          _count: { status: true },
          where: { assignment: { agentId: a.id } },
        }),
        prisma.company.groupBy({
          by: ['status'],
          _count: { status: true },
          where: { contacts: { some: { assignment: { agentId: a.id } } } },
        }),
        prisma.company.findMany({
          where: { contacts: { some: { assignment: { agentId: a.id } } } },
          select: { id: true },
        }),
      ])
      const lastByCompany = await getLastDispositionByCompanyIds(
        assignedCompanyRows.map((c) => c.id),
        a.id
      )
      const companyPipeline = buildCompanyPipelineCounts(lastByCompany)
      return {
        agentId: a.id,
        contactStatuses: toStatusMap(contactRows),
        companyStatuses: toStatusMap(companyRows),
        assignedCompanies: assignedCompanyRows.length,
        companyPipeline,
      }
    })
  )
  const agentContactStatusMap: Record<string, Record<string, number>> = {}
  const agentCompanyStatusMap: Record<string, Record<string, number>> = {}
  const agentCompanyPipelineMap: Record<string, Record<string, number>> = {}
  const agentAssignedCompaniesMap: Record<string, number> = {}
  for (const a of agentStatusData) {
    agentContactStatusMap[a.agentId] = a.contactStatuses
    agentCompanyStatusMap[a.agentId] = a.companyStatuses
    agentCompanyPipelineMap[a.agentId] = a.companyPipeline
    agentAssignedCompaniesMap[a.agentId] = a.assignedCompanies
  }

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
    const interested = interestedRecords
    const converted = convertedRecords
    const notInterested = notInterestedRecords
    const contactRate = assigned > 0 ? Math.round((calledContacts / assigned) * 100) : 0
    const companyContactRate =
      assignedCompanies > 0 ? Math.round((companiesWithResponse / assignedCompanies) * 100) : 0
    const conversionRate = calledContacts > 0 ? Math.round(((interestedRecords + convertedRecords) / calledContacts) * 100) : 0
    const avgCallsPerContact = calledContacts > 0 ? Math.round((totalCalls / calledContacts) * 10) / 10 : 0
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
      interested,
      converted,
      notInterested,
      interestedRecords,
      convertedRecords,
      notInterestedRecords,
      pendingRecords,
      interestedCompanies,
      convertedCompanies,
      notInterestedCompanies,
      pendingCompanies,
      contactRate,
      companyContactRate,
      conversionRate,
      avgCallsPerClient: avgCallsPerContact,
      avgCallsPerContact,
      pendingCallbacks: pendingMap[a.id] ?? 0,
      overdueCallbacks: overdueMap[a.id] ?? 0,
    }
  })

  const globalAssignedCompanyFilter = { contacts: { some: { assignment: { is: {} } } } }
  const scopedCompanyFilter = filterAgentId
    ? { contacts: { some: { assignment: { agentId: filterAgentId } } } }
    : globalAssignedCompanyFilter

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
    callCount: number
    contactedCompanies: number
    contactedPct: number
    inFunnel: number
    ventaCerrada: number
  }
  const runsByBatchId: Record<string, BatchAssignmentRun[]> = {}
  if (filterAgentId) {
    const allRuns = await prisma.assignmentRun.findMany({
      where: { agentId: filterAgentId },
      select: {
        id: true,
        importBatchId: true,
        companyCount: true,
        createdAt: true,
        assignedBy: { select: { name: true } },
        assignments: {
          select: {
            contact: { select: { company: { select: { importBatchId: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    const enrichedRuns = await Promise.all(
      allRuns.map(async (run) => {
        const metrics = await buildRunMetrics(run.id, filterAgentId, run.companyCount)
        const companyBatchIds = run.assignments.map((a) => a.contact.company.importBatchId)
        const batchId = resolveRunBatchId(run.importBatchId, companyBatchIds)
        return {
          batchId,
          run: {
            id: run.id,
            assignedAt: run.createdAt.toISOString(),
            companyCount: run.companyCount,
            assignedBy: { name: run.assignedBy.name },
            ...metrics,
          } satisfies BatchAssignmentRun,
        }
      })
    )
    for (const { batchId, run } of enrichedRuns) {
      if (!batchId) continue
      if (!runsByBatchId[batchId]) runsByBatchId[batchId] = []
      runsByBatchId[batchId].push(run)
    }

    for (const batch of batches) {
      const legacy = await buildLegacyBucketMetrics(filterAgentId, batch.id)
      if (legacy.companyCount === 0) continue

      const legacyRun: BatchAssignmentRun = {
        id: `legacy-${batch.id}`,
        isLegacy: true,
        assignedAt: legacy.earliestAssignedAt?.toISOString() ?? null,
        companyCount: legacy.companyCount,
        assignedBy: { name: 'Asignación anterior' },
        callCount: legacy.callCount,
        contactedCompanies: legacy.contactedCompanies,
        contactedPct: legacy.contactedPct,
        inFunnel: legacy.inFunnel,
        ventaCerrada: legacy.ventaCerrada,
      }

      const existing = runsByBatchId[batch.id] ?? []
      const sortedRuns = [...existing].sort(
        (a, b) => new Date(b.assignedAt ?? 0).getTime() - new Date(a.assignedAt ?? 0).getTime()
      )
      runsByBatchId[batch.id] = [legacyRun, ...sortedRuns]
    }
  }

  // When viewing all agents, build a per-batch/per-agent company set
  // so we can compute the Level 2 / Level 3 breakdown efficiently.
  const agentNameById = Object.fromEntries(agents.map((a) => [a.id, a.name]))
  const agentCompanyIdsByBatchId: Record<string, Record<string, Set<string>>> = {}
  if (!filterAgentId && batches.length > 0) {
    const batchIds = batches.map((b) => b.id)
    const assignmentRows = await prisma.assignment.findMany({
      where: { contact: { company: { importBatchId: { in: batchIds } } } },
      select: {
        agentId: true,
        contact: { select: { companyId: true, company: { select: { importBatchId: true } } } },
      },
    })

    for (const row of assignmentRows) {
      const batchId = row.contact.company.importBatchId
      const agentId = row.agentId
      const companyId = row.contact.companyId
      if (!agentCompanyIdsByBatchId[batchId]) agentCompanyIdsByBatchId[batchId] = {}
      if (!agentCompanyIdsByBatchId[batchId]![agentId]) agentCompanyIdsByBatchId[batchId]![agentId] = new Set()
      agentCompanyIdsByBatchId[batchId]![agentId]!.add(companyId)
    }
  }

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

      const agentBreakdown: AgentBreakdownRow[] | undefined = !filterAgentId
        ? await (async () => {
            const byAgent = agentCompanyIdsByBatchId[b.id] ?? {}
            const agentIds = Object.keys(byAgent)
            if (agentIds.length === 0) return []

            const rows = await Promise.all(
              agentIds.map(async (agentId) => {
                const ids = [...(byAgent[agentId] ?? new Set<string>())]
                const assignedCompanies = ids.length
                if (assignedCompanies === 0) {
                  return null
                }

                const [agentCallCount, lastByAgentCompany, assignmentRuns] = await Promise.all([
                  prisma.callLog.count({
                    where: { agentId, companyId: { in: ids } },
                  }),
                  getLastDispositionByCompanyIds(ids, agentId),
                  buildBatchAssignmentRuns(b.id, agentId),
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
          })()
        : undefined

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
        assignmentRuns: filterAgentId ? (runsByBatchId[b.id] ?? []) : undefined,
        agentBreakdown,
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
      ...(!filterAgentId ? { agentBreakdown: metrics?.agentBreakdown ?? [] } : {}),
      ...(filterAgentId ? { assignmentRuns: metrics?.assignmentRuns ?? [] } : {}),
    }
  })

  const [totalCompanies, assignedCompanyRows, funnelCompanyStatuses] = await Promise.all([
    prisma.company.count({ where: { ...companyAgentFilter } }),
    prisma.company.findMany({ where: assignedCompanyFilter, select: { id: true } }),
    prisma.company.groupBy({ by: ['status'], _count: { status: true }, where: { ...companyAgentFilter } }),
  ])
  const assignedCompanies = assignedCompanyRows.length
  const lastByCompany = await getLastDispositionByCompanyIds(
    assignedCompanyRows.map((c) => c.id),
    filterAgentId || undefined
  )
  const companyPipeline = buildCompanyPipelineCounts(lastByCompany)
  const companyMap = toStatusMap(funnelCompanyStatuses)

  res.json({
    agentPerformance,
    callsByDay: Object.entries(callsByDay).map(([date, count]) => ({ date, count })),
    dispositionBreakdown: dispositionBreakdown.map((d) => ({ disposition: d.disposition, count: d._count.disposition })),
    batchProgress,
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
  })
})

type BatchAssignmentRun = {
  id: string
  isLegacy?: boolean
  assignedAt: string | null
  companyCount: number
  assignedBy: { name: string }
  callCount: number
  contactedCompanies: number
  contactedPct: number
  inFunnel: number
  ventaCerrada: number
}

async function buildBatchAssignmentRuns(
  batchId: string,
  filterAgentId: string
): Promise<BatchAssignmentRun[]> {
  const allRuns = await prisma.assignmentRun.findMany({
    where: { agentId: filterAgentId },
    select: {
      id: true,
      importBatchId: true,
      companyCount: true,
      createdAt: true,
      assignedBy: { select: { name: true } },
      assignments: {
        select: {
          contact: { select: { company: { select: { importBatchId: true } } } },
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
      ...metrics,
    })
  }

  const legacy = await buildLegacyBucketMetrics(filterAgentId, batchId)
  if (legacy.companyCount > 0) {
    runs.push({
      id: `legacy-${batchId}`,
      isLegacy: true,
      assignedAt: legacy.earliestAssignedAt?.toISOString() ?? null,
      companyCount: legacy.companyCount,
      assignedBy: { name: 'Asignación anterior' },
      callCount: legacy.callCount,
      contactedCompanies: legacy.contactedCompanies,
      contactedPct: legacy.contactedPct,
      inFunnel: legacy.inFunnel,
      ventaCerrada: legacy.ventaCerrada,
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

  const callWhere = {
    calledAt: { gte: fromDate, lte: toDate },
    ...(agentId ? { agentId } : {}),
    ...(batchId ? { company: { importBatchId: batchId } } : {}),
  }

  const [callLogs, agents] = await Promise.all([
    prisma.callLog.findMany({
      where: callWhere,
      select: { calledAt: true, agentId: true },
      orderBy: { calledAt: 'asc' },
    }),
    prisma.user.findMany({
      where: { role: 'AGENT', active: true },
      select: { id: true, name: true },
    }),
  ])

  const series = buildCallActivitySeries(callLogs, fromDate, toDate, granularity)

  const logsByAgent = new Map<string, { calledAt: Date; agentId: string }[]>()
  for (const log of callLogs) {
    if (!logsByAgent.has(log.agentId)) logsByAgent.set(log.agentId, [])
    logsByAgent.get(log.agentId)!.push(log)
  }

  const agentNameMap = Object.fromEntries(agents.map((a) => [a.id, a.name]))
  const byAgent = [...logsByAgent.entries()]
    .map(([id, logs]) => {
      const stats = buildCallGapStats(logs)
      return {
        agentId: id,
        name: agentNameMap[id] ?? 'Desconocido',
        totalCalls: stats.totalCalls,
        avgGapMinutes: stats.avgGapMinutes,
        medianGapMinutes: stats.medianGapMinutes,
        gapCount: stats.gapCount,
      }
    })
    .sort((a, b) => b.totalCalls - a.totalCalls)

  const totalCalls = callLogs.length
  const globalStats = buildCallGapStats(callLogs)

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
