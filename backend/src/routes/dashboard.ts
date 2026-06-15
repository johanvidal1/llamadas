import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth'

const router = Router()

// GET /api/dashboard/stats
router.get('/stats', requireAuth, async (req: AuthRequest, res: Response) => {
  const isAdmin = req.user!.role === 'ADMIN'

  if (isAdmin) {
    const [
      totalClients,
      clientsByStatus,
      totalAgents,
      totalCalls,
      pendingCallbacks,
      recentCalls,
    ] = await Promise.all([
      prisma.company.count(),
      prisma.company.groupBy({ by: ['status'], _count: { status: true } }),
      prisma.user.count({ where: { role: 'AGENT', active: true } }),
      prisma.callLog.count(),
      prisma.callback.count({ where: { completed: false } }),
      prisma.callLog.findMany({
        take: 5,
        orderBy: { calledAt: 'desc' },
        include: {
          company: { select: { ruc: true, razonSocial: true } },
          contact: { select: { nombre: true } },
          agent: { select: { name: true } },
        },
      }),
    ])

    const statusMap: Record<string, number> = {}
    for (const s of clientsByStatus) statusMap[s.status] = s._count.status

    res.json({ totalClients, totalAgents, totalCalls, pendingCallbacks, clientsByStatus: statusMap, recentCalls })
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

    const [assignedContacts, clientsByStatus, totalCalls, pendingCallbacks, todayCallbacks, recentCalls] =
      await Promise.all([
        prisma.assignment.count({ where: { agentId: req.user!.id, ...batchFilter } }),
        prisma.company.groupBy({ by: ['status'], _count: { status: true }, where: agentCompanyFilter }),
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
            company: { select: { ruc: true, razonSocial: true } },
            contact: { select: { nombre: true } },
          },
        }),
      ])

    const statusMap: Record<string, number> = {}
    for (const s of clientsByStatus) statusMap[s.status] = s._count.status

    res.json({
      assignedClients: assignedContacts,
      assignedContacts,
      totalCalls,
      pendingCallbacks,
      todayCallbacks,
      clientsByStatus: statusMap,
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
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const now = new Date()

  const [agents, allCallLogs, dispositionBreakdown, batchCompanyStatuses, batches, callsByAgentContact, pendingCallbacks, overdueCallbacks] =
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
      prisma.company.groupBy({ by: ['importBatchId', 'status'], _count: { status: true }, where: { ...companyAgentFilter } }),
      prisma.importBatch.findMany({ select: { id: true, filename: true, createdAt: true, totalRecords: true }, orderBy: { createdAt: 'desc' } }),
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

  const agentCompanyStatuses = await Promise.all(
    agents.map((a) =>
      prisma.company.groupBy({
        by: ['status'],
        _count: { status: true },
        where: { contacts: { some: { assignment: { agentId: a.id } } } },
      }).then((rows) => {
        const m: Record<string, number> = {}
        for (const r of rows) m[r.status] = r._count.status
        return { agentId: a.id, statuses: m }
      })
    )
  )
  const agentStatusMap: Record<string, Record<string, number>> = {}
  for (const a of agentCompanyStatuses) agentStatusMap[a.agentId] = a.statuses

  const agentPerformance = agents.map((a) => {
    const assigned = a._count.assignments
    const totalCalls = a._count.callLogs
    const calledContacts = calledByAgent[a.id]?.size ?? 0
    const statuses = agentStatusMap[a.id] ?? {}
    const interested = statuses['INTERESTED'] ?? 0
    const converted = statuses['CONVERTED'] ?? 0
    const notInterested = statuses['NOT_INTERESTED'] ?? 0
    const contactRate = assigned > 0 ? Math.round((calledContacts / assigned) * 100) : 0
    const conversionRate = calledContacts > 0 ? Math.round(((interested + converted) / calledContacts) * 100) : 0
    const avgCallsPerContact = calledContacts > 0 ? Math.round((totalCalls / calledContacts) * 10) / 10 : 0
    return {
      id: a.id,
      name: a.name,
      assigned,
      calledClients: calledContacts,
      calledContacts,
      totalCalls,
      interested,
      converted,
      notInterested,
      contactRate,
      conversionRate,
      avgCallsPerClient: avgCallsPerContact,
      avgCallsPerContact,
      pendingCallbacks: pendingMap[a.id] ?? 0,
      overdueCallbacks: overdueMap[a.id] ?? 0,
    }
  })

  const batchStatusMap: Record<string, Record<string, number>> = {}
  for (const row of batchCompanyStatuses) {
    const bId = row.importBatchId ?? '__none__'
    if (!batchStatusMap[bId]) batchStatusMap[bId] = {}
    batchStatusMap[bId][row.status] = (batchStatusMap[bId][row.status] ?? 0) + row._count.status
  }

  const batchCallStats = await Promise.all(
    batches.map(async (b) => {
      const [callCount, interestedContactCount] = await Promise.all([
        prisma.callLog.count({ where: { company: { importBatchId: b.id } } }),
        prisma.callLog.count({ where: { disposition: 'INTERESTED', company: { importBatchId: b.id } } }),
      ])
      return { batchId: b.id, callCount, interestedContactCount }
    })
  )
  const batchCallMap: Record<string, { callCount: number; interestedContactCount: number }> = {}
  for (const s of batchCallStats) batchCallMap[s.batchId] = s

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
    const { callCount = 0, interestedContactCount = 0 } = batchCallMap[b.id] ?? {}
    return { ...b, pending, inProgress, interested, interestedContactCount, converted, notInterested, doNotCall, contacted, callCount }
  })

  const [totalCompanies, assignedContacts, funnelStatuses] = await Promise.all([
    prisma.company.count({ where: { ...companyAgentFilter } }),
    prisma.assignment.count({ where: filterAgentId ? { agentId: filterAgentId } : {} }),
    prisma.company.groupBy({ by: ['status'], _count: { status: true }, where: { ...companyAgentFilter } }),
  ])
  const funnelMap: Record<string, number> = {}
  for (const s of funnelStatuses) funnelMap[s.status] = s._count.status

  res.json({
    agentPerformance,
    callsByDay: Object.entries(callsByDay).map(([date, count]) => ({ date, count })),
    dispositionBreakdown: dispositionBreakdown.map((d) => ({ disposition: d.disposition, count: d._count.disposition })),
    batchProgress,
    funnel: {
      total: totalCompanies,
      assigned: assignedContacts,
      pending: funnelMap['PENDING'] ?? 0,
      inProgress: funnelMap['IN_PROGRESS'] ?? 0,
      interested: funnelMap['INTERESTED'] ?? 0,
      converted: funnelMap['CONVERTED'] ?? 0,
      notInterested: funnelMap['NOT_INTERESTED'] ?? 0,
      doNotCall: funnelMap['DO_NOT_CALL'] ?? 0,
    },
  })
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
