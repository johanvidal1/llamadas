import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth'

const router = Router()

// GET /api/dashboard/stats — global stats (admin) or personal (agent)
router.get('/stats', requireAuth, async (req: AuthRequest, res: Response) => {
  const isAdmin = req.user!.role === 'ADMIN'
  const { batchId } = req.query as Record<string, string>

  const agentFilter = isAdmin ? {} : { agentId: req.user!.id }

  if (isAdmin) {
    const [
      totalClients,
      clientsByStatus,
      totalAgents,
      totalCalls,
      totalCallbacks,
      pendingCallbacks,
      recentCalls,
    ] = await Promise.all([
      prisma.client.count(),
      prisma.client.groupBy({ by: ['status'], _count: { status: true } }),
      prisma.user.count({ where: { role: 'AGENT', active: true } }),
      prisma.callLog.count(),
      prisma.callback.count(),
      prisma.callback.count({ where: { completed: false } }),
      prisma.callLog.findMany({
        take: 5,
        orderBy: { calledAt: 'desc' },
        include: {
          client: { select: { name: true, phone: true } },
          agent: { select: { name: true } },
        },
      }),
    ])

    const statusMap: Record<string, number> = {}
    for (const s of clientsByStatus) {
      statusMap[s.status] = s._count.status
    }

    res.json({
      totalClients,
      totalAgents,
      totalCalls,
      totalCallbacks,
      pendingCallbacks,
      clientsByStatus: statusMap,
      recentCalls,
    })
  } else {
    // Agent branch — optionally filtered by importBatch
    const batchClientFilter = batchId ? { importBatchId: batchId } : {}
    const agentClientFilter = { assignment: { agentId: req.user!.id }, ...batchClientFilter }
    const callFilter = batchId
      ? { agentId: req.user!.id, client: { importBatchId: batchId } }
      : agentFilter
    const cbFilter = batchId
      ? { agentId: req.user!.id, client: { importBatchId: batchId } }
      : agentFilter

    const [
      assignedClients,
      clientsByStatus,
      totalCalls,
      pendingCallbacks,
      todayCallbacks,
      recentCalls,
    ] = await Promise.all([
      prisma.assignment.count({ where: { agentId: req.user!.id, client: batchClientFilter } }),
      prisma.client.groupBy({
        by: ['status'],
        _count: { status: true },
        where: agentClientFilter,
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
        include: { client: { select: { name: true, phone: true } } },
      }),
    ])

    const statusMap: Record<string, number> = {}
    for (const s of clientsByStatus) {
      statusMap[s.status] = s._count.status
    }

    res.json({
      assignedClients,
      totalCalls,
      pendingCallbacks,
      todayCallbacks,
      clientsByStatus: statusMap,
      recentCalls,
    })
  }
})

// GET /api/dashboard/agents-stats — per-agent performance (admin only)
router.get('/agents-stats', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const agents = await prisma.user.findMany({
    where: { role: 'AGENT', active: true },
    select: {
      id: true,
      name: true,
      _count: {
        select: { assignments: true, callLogs: true, callbacks: true },
      },
    },
  })

  const result = await Promise.all(
    agents.map(async (agent) => {
      const dispositions = await prisma.callLog.groupBy({
        by: ['disposition'],
        _count: { disposition: true },
        where: { agentId: agent.id },
      })
      const dispMap: Record<string, number> = {}
      for (const d of dispositions) {
        dispMap[d.disposition] = d._count.disposition
      }
      return { ...agent, dispositions: dispMap }
    })
  )

  res.json(result)
})

// GET /api/dashboard/reports — comprehensive analytics (admin only)
router.get('/reports', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { agentId: filterAgentId } = req.query as Record<string, string>
  const agentFilter = filterAgentId ? { agentId: filterAgentId } : {}
  const clientAgentFilter = filterAgentId ? { assignment: { agentId: filterAgentId } } : {}
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const now = new Date()

  // ── Parallel top-level queries ──
  const [
    agents,
    allCallLogs,
    dispositionBreakdown,
    batchClientStatuses,
    batches,
    callsByAgentClient,
    pendingCallbacks,
    overdueCallbacks,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'AGENT', active: true },
      select: { id: true, name: true, _count: { select: { assignments: true, callLogs: true } } },
    }),
    // Calls in last 30 days (for time chart) — filtered by agent if set
    prisma.callLog.findMany({
      where: { calledAt: { gte: thirtyDaysAgo }, ...agentFilter },
      select: { calledAt: true },
      orderBy: { calledAt: 'asc' },
    }),
    // Disposition breakdown — filtered by agent if set
    prisma.callLog.groupBy({ by: ['disposition'], _count: { disposition: true }, where: { ...agentFilter } }),
    // Client status counts grouped by (importBatchId, status) — filtered by agent if set
    prisma.client.groupBy({ by: ['importBatchId', 'status'], _count: { status: true }, where: { ...clientAgentFilter } }),
    // All import batches
    prisma.importBatch.findMany({
      select: { id: true, filename: true, createdAt: true, totalRecords: true },
      orderBy: { createdAt: 'desc' },
    }),
    // Distinct (agentId, clientId) pairs — for unique-clients-called per agent
    prisma.callLog.groupBy({ by: ['agentId', 'clientId'], _count: { clientId: true } }),
    // Pending callbacks per agent
    prisma.callback.groupBy({
      by: ['agentId'],
      _count: { agentId: true },
      where: { completed: false },
    }),
    // Overdue callbacks per agent
    prisma.callback.groupBy({
      by: ['agentId'],
      _count: { agentId: true },
      where: { completed: false, scheduledAt: { lt: now } },
    }),
  ])

  // ── Calls per day (last 30 days) ──
  const callsByDay: Record<string, number> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    callsByDay[d.toISOString().slice(0, 10)] = 0
  }
  for (const c of allCallLogs) {
    const day = new Date(c.calledAt).toISOString().slice(0, 10)
    if (day in callsByDay) callsByDay[day] = (callsByDay[day] ?? 0) + 1
  }

  // ── Agent performance ──
  const pendingMap: Record<string, number> = {}
  for (const p of pendingCallbacks) { if (p.agentId) pendingMap[p.agentId] = p._count.agentId }
  const overdueMap: Record<string, number> = {}
  for (const p of overdueCallbacks) { if (p.agentId) overdueMap[p.agentId] = p._count.agentId }

  // unique clients called per agent
  const calledByAgent: Record<string, Set<string>> = {}
  for (const row of callsByAgentClient) {
    if (!row.agentId) continue
    if (!calledByAgent[row.agentId]) calledByAgent[row.agentId] = new Set()
    calledByAgent[row.agentId].add(row.clientId)
  }

  // client statuses per agent — need per-agent query (small N)
  const agentClientStatuses = await Promise.all(
    agents.map((a) =>
      prisma.client.groupBy({
        by: ['status'],
        _count: { status: true },
        where: { assignment: { agentId: a.id } },
      }).then((rows) => {
        const m: Record<string, number> = {}
        for (const r of rows) m[r.status] = r._count.status
        return { agentId: a.id, statuses: m }
      })
    )
  )
  const agentStatusMap: Record<string, Record<string, number>> = {}
  for (const a of agentClientStatuses) agentStatusMap[a.agentId] = a.statuses

  const agentPerformance = agents.map((a) => {
    const assigned = a._count.assignments
    const totalCalls = a._count.callLogs
    const calledClients = calledByAgent[a.id]?.size ?? 0
    const statuses = agentStatusMap[a.id] ?? {}
    const interested = statuses['INTERESTED'] ?? 0
    const converted = statuses['CONVERTED'] ?? 0
    const notInterested = statuses['NOT_INTERESTED'] ?? 0
    const contactRate = assigned > 0 ? Math.round((calledClients / assigned) * 100) : 0
    const conversionRate = calledClients > 0 ? Math.round(((interested + converted) / calledClients) * 100) : 0
    const avgCallsPerClient = calledClients > 0 ? Math.round((totalCalls / calledClients) * 10) / 10 : 0
    return {
      id: a.id,
      name: a.name,
      assigned,
      calledClients,
      totalCalls,
      interested,
      converted,
      notInterested,
      contactRate,
      conversionRate,
      avgCallsPerClient,
      pendingCallbacks: pendingMap[a.id] ?? 0,
      overdueCallbacks: overdueMap[a.id] ?? 0,
    }
  })

  // ── Batch progress ──
  // Build map: batchId → status → count
  const batchStatusMap: Record<string, Record<string, number>> = {}
  for (const row of batchClientStatuses) {
    const bId = row.importBatchId ?? '__none__'
    if (!batchStatusMap[bId]) batchStatusMap[bId] = {}
    batchStatusMap[bId][row.status] = (batchStatusMap[bId][row.status] ?? 0) + row._count.status
  }
  const batchProgress = batches.map((b) => {
    const s = batchStatusMap[b.id] ?? {}
    const pending = s['PENDING'] ?? 0
    const inProgress = s['IN_PROGRESS'] ?? 0
    const interested = s['INTERESTED'] ?? 0
    const converted = s['CONVERTED'] ?? 0
    const notInterested = s['NOT_INTERESTED'] ?? 0
    const doNotCall = s['DO_NOT_CALL'] ?? 0
    const total = b.totalRecords
    const contacted = total - pending
    return { ...b, pending, inProgress, interested, converted, notInterested, doNotCall, contacted }
  })

  // ── Overall funnel ──
  const [totalClients, assignedClients, funnelStatuses] = await Promise.all([
    prisma.client.count({ where: { ...clientAgentFilter } }),
    prisma.assignment.count({ where: filterAgentId ? { agentId: filterAgentId } : {} }),
    prisma.client.groupBy({ by: ['status'], _count: { status: true }, where: { ...clientAgentFilter } }),
  ])
  const funnelMap: Record<string, number> = {}
  for (const s of funnelStatuses) funnelMap[s.status] = s._count.status

  res.json({
    agentPerformance,
    callsByDay: Object.entries(callsByDay).map(([date, count]) => ({ date, count })),
    dispositionBreakdown: dispositionBreakdown.map((d) => ({
      disposition: d.disposition,
      count: d._count.disposition,
    })),
    batchProgress,
    funnel: {
      total: totalClients,
      assigned: assignedClients,
      pending: funnelMap['PENDING'] ?? 0,
      inProgress: funnelMap['IN_PROGRESS'] ?? 0,
      interested: funnelMap['INTERESTED'] ?? 0,
      converted: funnelMap['CONVERTED'] ?? 0,
      notInterested: funnelMap['NOT_INTERESTED'] ?? 0,
      doNotCall: funnelMap['DO_NOT_CALL'] ?? 0,
    },
  })
})

// GET /api/dashboard/my-batches — batches this agent has assigned clients in
router.get('/my-batches', requireAuth, async (req: AuthRequest, res: Response) => {
  const agentId = req.user!.id

  const batches = await prisma.importBatch.findMany({
    where: {
      clients: { some: { assignment: { agentId } } },
    },
    select: { id: true, filename: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  const counts = await Promise.all(
    batches.map((b) =>
      prisma.assignment.count({
        where: { agentId, client: { importBatchId: b.id } },
      })
    )
  )

  res.json(batches.map((b, i) => ({ ...b, clientCount: counts[i] })))
})

export default router
