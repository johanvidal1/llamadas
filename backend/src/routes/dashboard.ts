import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { requireAuth, requireAdmin, AuthRequest } from '../middleware/auth'
import { INTERESTED_DISPOSITIONS } from '../lib/responseOptions'

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
    const [
      totalClients,
      totalContacts,
      contactsByStatusRows,
      companiesByStatusRows,
      totalAgents,
      totalCalls,
      pendingCallbacks,
      recentCalls,
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
          company: { select: { ruc: true, razonSocial: true } },
          contact: { select: { nombre: true } },
          agent: { select: { name: true } },
        },
      }),
    ])

    const contactsByStatus = toStatusMap(contactsByStatusRows)
    const companiesByStatus = toStatusMap(companiesByStatusRows)

    res.json({
      totalClients,
      totalContacts,
      totalAgents,
      totalCalls,
      pendingCallbacks,
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
    const agentContactFilter = {
      assignment: { agentId: req.user!.id },
      ...(batchId ? { company: { importBatchId: batchId } } : {}),
    }
    const callFilter = batchId
      ? { agentId: req.user!.id, company: { importBatchId: batchId } }
      : { agentId: req.user!.id }
    const cbFilter = batchId
      ? { agentId: req.user!.id, company: { importBatchId: batchId } }
      : { agentId: req.user!.id }

    const [assignedContacts, contactsByStatusRows, companiesByStatusRows, totalCalls, pendingCallbacks, todayCallbacks, recentCalls] =
      await Promise.all([
        prisma.assignment.count({ where: { agentId: req.user!.id, ...batchFilter } }),
        prisma.contact.groupBy({ by: ['status'], _count: { status: true }, where: agentContactFilter }),
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

    const contactsByStatus = toStatusMap(contactsByStatusRows)
    const companiesByStatus = toStatusMap(companiesByStatusRows)

    res.json({
      assignedClients: assignedContacts,
      assignedContacts,
      totalCalls,
      pendingCallbacks,
      todayCallbacks,
      contactsByStatus,
      companiesByStatus,
      clientsByStatus: companiesByStatus,
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
  const contactAgentFilter = filterAgentId
    ? { assignment: { agentId: filterAgentId } }
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

  const agentStatusData = await Promise.all(
    agents.map(async (a) => {
      const [contactRows, companyRows] = await Promise.all([
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
      ])
      return {
        agentId: a.id,
        contactStatuses: toStatusMap(contactRows),
        companyStatuses: toStatusMap(companyRows),
      }
    })
  )
  const agentContactStatusMap: Record<string, Record<string, number>> = {}
  const agentCompanyStatusMap: Record<string, Record<string, number>> = {}
  for (const a of agentStatusData) {
    agentContactStatusMap[a.agentId] = a.contactStatuses
    agentCompanyStatusMap[a.agentId] = a.companyStatuses
  }

  const agentPerformance = agents.map((a) => {
    const assigned = a._count.assignments
    const totalCalls = a._count.callLogs
    const calledContacts = calledByAgent[a.id]?.size ?? 0
    const contactStatuses = agentContactStatusMap[a.id] ?? {}
    const companyStatuses = agentCompanyStatusMap[a.id] ?? {}
    const interestedRecords = contactStatuses['INTERESTED'] ?? 0
    const convertedRecords = contactStatuses['CONVERTED'] ?? 0
    const notInterestedRecords = contactStatuses['NOT_INTERESTED'] ?? 0
    const pendingRecords = contactStatuses['PENDING'] ?? 0
    const interestedCompanies = companyStatuses['INTERESTED'] ?? 0
    const convertedCompanies = companyStatuses['CONVERTED'] ?? 0
    const notInterestedCompanies = companyStatuses['NOT_INTERESTED'] ?? 0
    const pendingCompanies = companyStatuses['PENDING'] ?? 0
    const interested = interestedRecords
    const converted = convertedRecords
    const notInterested = notInterestedRecords
    const contactRate = assigned > 0 ? Math.round((calledContacts / assigned) * 100) : 0
    const conversionRate = calledContacts > 0 ? Math.round(((interestedRecords + convertedRecords) / calledContacts) * 100) : 0
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
      interestedRecords,
      convertedRecords,
      notInterestedRecords,
      pendingRecords,
      interestedCompanies,
      convertedCompanies,
      notInterestedCompanies,
      pendingCompanies,
      contactRate,
      conversionRate,
      avgCallsPerClient: avgCallsPerContact,
      avgCallsPerContact,
      pendingCallbacks: pendingMap[a.id] ?? 0,
      overdueCallbacks: overdueMap[a.id] ?? 0,
    }
  })

  const batchCompanyStatusMap: Record<string, Record<string, number>> = {}
  for (const row of batchCompanyStatuses) {
    const bId = row.importBatchId ?? '__none__'
    if (!batchCompanyStatusMap[bId]) batchCompanyStatusMap[bId] = {}
    batchCompanyStatusMap[bId][row.status] = (batchCompanyStatusMap[bId][row.status] ?? 0) + row._count.status
  }

  const batchContactStatusByBatch = await Promise.all(
    batches.map(async (b) => {
      const rows = await prisma.contact.groupBy({
        by: ['status'],
        _count: { status: true },
        where: { company: { importBatchId: b.id, ...companyAgentFilter }, ...contactAgentFilter },
      })
      return { batchId: b.id, statuses: toStatusMap(rows) }
    })
  )
  const batchContactStatusMap: Record<string, Record<string, number>> = {}
  for (const row of batchContactStatusByBatch) {
    batchContactStatusMap[row.batchId] = row.statuses
  }

  const batchCounts = await Promise.all(
    batches.map(async (b) => {
      const [contactCount, companyCount, callCount, interestedContactCount] = await Promise.all([
        prisma.contact.count({ where: { company: { importBatchId: b.id, ...companyAgentFilter }, ...contactAgentFilter } }),
        prisma.company.count({ where: { importBatchId: b.id, ...companyAgentFilter } }),
        prisma.callLog.count({ where: { company: { importBatchId: b.id } } }),
        prisma.callLog.count({
          where: {
            disposition: { in: [...INTERESTED_DISPOSITIONS, 'VENTA_CERRADA'] },
            company: { importBatchId: b.id },
          },
        }),
      ])
      return { batchId: b.id, contactCount, companyCount, callCount, interestedContactCount }
    })
  )
  const batchCountMap: Record<string, { contactCount: number; companyCount: number; callCount: number; interestedContactCount: number }> = {}
  for (const s of batchCounts) batchCountMap[s.batchId] = s

  const batchProgress = batches.map((b) => {
    const companyS = batchCompanyStatusMap[b.id] ?? {}
    const recordS = batchContactStatusMap[b.id] ?? {}
    const pending = companyS['PENDING'] ?? 0
    const inProgress = companyS['IN_PROGRESS'] ?? 0
    const interested = companyS['INTERESTED'] ?? 0
    const converted = companyS['CONVERTED'] ?? 0
    const notInterested = companyS['NOT_INTERESTED'] ?? 0
    const doNotCall = companyS['DO_NOT_CALL'] ?? 0
    const pendingRecords = recordS['PENDING'] ?? 0
    const inProgressRecords = recordS['IN_PROGRESS'] ?? 0
    const interestedRecords = recordS['INTERESTED'] ?? 0
    const convertedRecords = recordS['CONVERTED'] ?? 0
    const notInterestedRecords = recordS['NOT_INTERESTED'] ?? 0
    const doNotCallRecords = recordS['DO_NOT_CALL'] ?? 0
    const { contactCount = 0, companyCount = 0, callCount = 0, interestedContactCount = 0 } = batchCountMap[b.id] ?? {}
    const contacted = companyCount - pending
    const contactedRecords = contactCount - pendingRecords
    return {
      ...b,
      totalRecords: contactCount,
      totalCompanies: companyCount,
      pending,
      inProgress,
      interested,
      interestedContactCount,
      converted,
      notInterested,
      doNotCall,
      pendingRecords,
      inProgressRecords,
      interestedRecords,
      convertedRecords,
      notInterestedRecords,
      doNotCallRecords,
      contacted,
      contactedRecords,
      callCount,
    }
  })

  const [totalCompanies, totalRecords, assignedContacts, funnelContactStatuses, funnelCompanyStatuses] = await Promise.all([
    prisma.company.count({ where: { ...companyAgentFilter } }),
    prisma.contact.count({ where: { ...contactAgentFilter } }),
    prisma.assignment.count({ where: filterAgentId ? { agentId: filterAgentId } : {} }),
    prisma.contact.groupBy({ by: ['status'], _count: { status: true }, where: { ...contactAgentFilter } }),
    prisma.company.groupBy({ by: ['status'], _count: { status: true }, where: { ...companyAgentFilter } }),
  ])
  const recordMap = toStatusMap(funnelContactStatuses)
  const companyMap = toStatusMap(funnelCompanyStatuses)

  res.json({
    agentPerformance,
    callsByDay: Object.entries(callsByDay).map(([date, count]) => ({ date, count })),
    dispositionBreakdown: dispositionBreakdown.map((d) => ({ disposition: d.disposition, count: d._count.disposition })),
    batchProgress,
    funnel: {
      records: {
        total: totalRecords,
        assigned: assignedContacts,
        pending: recordMap['PENDING'] ?? 0,
        inProgress: recordMap['IN_PROGRESS'] ?? 0,
        interested: recordMap['INTERESTED'] ?? 0,
        converted: recordMap['CONVERTED'] ?? 0,
        notInterested: recordMap['NOT_INTERESTED'] ?? 0,
        doNotCall: recordMap['DO_NOT_CALL'] ?? 0,
      },
      companies: {
        total: totalCompanies,
        assigned: assignedContacts,
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
