import { prisma } from './prisma'
import { formatYmdInTz } from './appTimezone'
import { getLatestResetAtByAgentIds, isAssignmentAfterReset } from './agentReset'

/** Pipeline bucket keys returned in dashboard companyPipeline. */
export const COMPANY_PIPELINE_KEYS = [
  'PENDING',
  'VOLVER_A_LLAMAR',
  'INTERESADO',
  'PROPUESTA_PRESENTADA',
  'DISCUSION_PROPUESTA',
  'ESPERA_RESPUESTA',
  'VENTA_CERRADA',
  'OTROS',
] as const

export type CompanyPipelineKey = (typeof COMPANY_PIPELINE_KEYS)[number]

export const MAX_NO_ANSWER_ATTEMPTS = 3

export function isNoContestaDisposition(disposition: string | null | undefined): boolean {
  return disposition === 'NO_CONTESTA' || disposition === 'NO_ANSWER'
}

export function isDepuradoNoContesta(
  lastDisposition: string | null | undefined,
  callLogCount: number
): boolean {
  return isNoContestaDisposition(lastDisposition) && callLogCount >= MAX_NO_ANSWER_ATTEMPTS
}

export function isActiveNoContesta(
  lastDisposition: string | null | undefined,
  callLogCount: number
): boolean {
  return isNoContestaDisposition(lastDisposition) && callLogCount < MAX_NO_ANSWER_ATTEMPTS
}

export function dispositionMatchesFilter(lastDisposition: string | null, filter: string): boolean {
  if (filter === 'INTERESADO') {
    return lastDisposition === 'INTERESADO' || lastDisposition === 'INTERESTED'
  }
  if (filter === 'VOLVER_A_LLAMAR') {
    return lastDisposition === 'VOLVER_A_LLAMAR' || lastDisposition === 'CALLBACK'
  }
  return lastDisposition === filter
}

export function pipelineBucketForDisposition(lastDisposition: string | null): CompanyPipelineKey {
  if (lastDisposition == null) return 'PENDING'
  for (const key of COMPANY_PIPELINE_KEYS) {
    if (key === 'PENDING' || key === 'OTROS') continue
    if (dispositionMatchesFilter(lastDisposition, key)) return key
  }
  return 'OTROS'
}

/** Funnel stage bucket keys (excludes PENDING, VOLVER_A_LLAMAR, OTROS). */
export const FUNNEL_PIPELINE_KEYS = COMPANY_PIPELINE_KEYS.filter(
  (k) => k !== 'PENDING' && k !== 'VOLVER_A_LLAMAR' && k !== 'OTROS'
)

export function matchesFunnelFilter(lastDisposition: string | null): boolean {
  const bucket = pipelineBucketForDisposition(lastDisposition)
  return (FUNNEL_PIPELINE_KEYS as readonly string[]).includes(bucket)
}

/** Last disposition per company (all logs when global; agent+assignment scoped when agentUserId set). */
export async function getLastDispositionByCompanyIds(
  companyIds: string[],
  agentUserId?: string
): Promise<
  Map<
    string,
    {
      disposition: string | null
      aclaracion: string | null
      lastCalledAt: Date | null
      lastCallContactId: string | null
      lastCallAgentId: string | null
      lastCallAgent: { id: string; name: string } | null
      callLogCount: number
    }
  >
> {
  const result = new Map<
    string,
    {
      disposition: string | null
      aclaracion: string | null
      lastCalledAt: Date | null
      lastCallContactId: string | null
      lastCallAgentId: string | null
      lastCallAgent: { id: string; name: string } | null
      callLogCount: number
    }
  >()
  if (companyIds.length === 0) return result

  const logs = await prisma.callLog.findMany({
    where: {
      companyId: { in: companyIds },
      ...(agentUserId
        ? { agentId: agentUserId, contact: { assignment: { agentId: agentUserId } } }
        : {}),
    },
    select: {
      companyId: true,
      disposition: true,
      aclaracion: true,
      calledAt: true,
      contactId: true,
      agentId: true,
      agent: { select: { id: true, name: true } },
    },
    orderBy: { calledAt: 'desc' },
  })

  const countByCompany = new Map<string, number>()
  for (const log of logs) {
    countByCompany.set(log.companyId, (countByCompany.get(log.companyId) ?? 0) + 1)
    if (!result.has(log.companyId)) {
      result.set(log.companyId, {
        disposition: log.disposition,
        aclaracion: log.aclaracion,
        lastCalledAt: log.calledAt,
        lastCallContactId: log.contactId,
        lastCallAgentId: log.agentId,
        lastCallAgent: log.agent,
        callLogCount: 0,
      })
    }
  }

  for (const [companyId, entry] of result) {
    entry.callLogCount = countByCompany.get(companyId) ?? 0
  }

  for (const id of companyIds) {
    if (!result.has(id)) {
      result.set(id, {
        disposition: null,
        aclaracion: null,
        lastCalledAt: null,
        lastCallContactId: null,
        lastCallAgentId: null,
        lastCallAgent: null,
        callLogCount: 0,
      })
    }
  }

  return result
}

/** Call-log count per company within a calledAt range (same agent scope as getLastDispositionByCompanyIds). */
export async function getCallCountsInPeriodByCompanyIds(
  companyIds: string[],
  calledAtRange: { gte?: Date; lte?: Date },
  agentUserId?: string
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (companyIds.length === 0) return result

  const rows = await prisma.callLog.groupBy({
    by: ['companyId'],
    where: {
      companyId: { in: companyIds },
      ...(agentUserId
        ? { agentId: agentUserId, contact: { assignment: { agentId: agentUserId } } }
        : {}),
      calledAt: {
        ...(calledAtRange.gte ? { gte: calledAtRange.gte } : {}),
        ...(calledAtRange.lte ? { lte: calledAtRange.lte } : {}),
      },
    },
    _count: { _all: true },
  })

  for (const row of rows) {
    result.set(row.companyId, row._count._all)
  }

  for (const id of companyIds) {
    if (!result.has(id)) result.set(id, 0)
  }

  return result
}

/** Earliest scoped call timestamp per company (first registration date). */
export async function getFirstRegisteredAtByCompanyIds(
  companyIds: string[],
  agentUserId?: string
): Promise<Map<string, Date>> {
  const result = new Map<string, Date>()
  if (companyIds.length === 0) return result

  const rows = await prisma.callLog.groupBy({
    by: ['companyId'],
    where: {
      companyId: { in: companyIds },
      ...(agentUserId
        ? { agentId: agentUserId, contact: { assignment: { agentId: agentUserId } } }
        : {}),
    },
    _min: { calledAt: true },
  })

  for (const row of rows) {
    if (row._min.calledAt) result.set(row.companyId, row._min.calledAt)
  }

  return result
}

export function buildCompanyPipelineCounts(
  lastByCompany: Map<string, { disposition: string | null; aclaracion: string | null }>
): Record<CompanyPipelineKey, number> {
  const counts = Object.fromEntries(
    COMPANY_PIPELINE_KEYS.map((k) => [k, 0])
  ) as Record<CompanyPipelineKey, number>

  for (const { disposition } of lastByCompany.values()) {
    const bucket = pipelineBucketForDisposition(disposition)
    counts[bucket]++
  }

  return counts
}

/** Count assigned companies by last raw disposition code (excludes null / pending). */
export function buildCompanyDispositionCounts(
  lastByCompany: Map<string, { disposition: string | null }>
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const { disposition } of lastByCompany.values()) {
    if (disposition == null) continue
    counts[disposition] = (counts[disposition] ?? 0) + 1
  }
  return counts
}

export type RunMetrics = {
  callCount: number
  contactedCompanies: number
  contactedPct: number
  inFunnel: number
  ventaCerrada: number
  pendingCompanies: number
  closeRate: number
}

/** Per-assignment-run metrics for a single agent (reports sub-rows). */
export async function buildRunMetrics(
  runId: string,
  agentId: string,
  companyCountFallback?: number
): Promise<RunMetrics> {
  const assignments = await prisma.assignment.findMany({
    where: { assignmentRunId: runId },
    select: { contact: { select: { companyId: true } } },
  })
  const ids = [...new Set(assignments.map((a) => a.contact.companyId))]

  const [callCount, lastByCompany] = await Promise.all([
    prisma.callLog.count({
      where: { companyId: { in: ids }, agentId },
    }),
    getLastDispositionByCompanyIds(ids, agentId),
  ])

  const companyPipeline = buildCompanyPipelineCounts(lastByCompany)
  const companyCount = companyCountFallback ?? ids.length
  const pendingCompanies = companyPipeline.PENDING ?? 0
  const contactedCompanies = ids.length - pendingCompanies
  const contactedPct =
    companyCount > 0 ? Math.round((contactedCompanies / companyCount) * 100) : 0
  const inFunnel = FUNNEL_PIPELINE_KEYS.reduce(
    (sum, key) => sum + (companyPipeline[key] ?? 0),
    0
  )
  const ventaCerrada = companyPipeline.VENTA_CERRADA ?? 0
  const closeRate = companyCount > 0 ? Math.round((ventaCerrada / companyCount) * 100) : 0

  return {
    callCount,
    contactedCompanies,
    contactedPct,
    inFunnel,
    ventaCerrada,
    pendingCompanies,
    closeRate,
  }
}

export async function getAssignmentRunCompanyIds(runId: string): Promise<string[]> {
  const assignments = await prisma.assignment.findMany({
    where: { assignmentRunId: runId },
    select: { contact: { select: { companyId: true } } },
  })
  return [...new Set(assignments.map((a) => a.contact.companyId))]
}

export type RunActivityDates = {
  firstCallAt: Date | null
  lastCallAt: Date | null
  companiesWithCalls: number
}

/** Min/max call timestamps and distinct companies with calls for an agent scope. */
export async function getRunActivityDates(
  companyIds: string[],
  agentId: string
): Promise<RunActivityDates> {
  if (companyIds.length === 0) {
    return { firstCallAt: null, lastCallAt: null, companiesWithCalls: 0 }
  }

  const [aggregate, distinctCompanies] = await Promise.all([
    prisma.callLog.aggregate({
      where: { companyId: { in: companyIds }, agentId },
      _min: { calledAt: true },
      _max: { calledAt: true },
    }),
    prisma.callLog.findMany({
      where: { companyId: { in: companyIds }, agentId },
      select: { companyId: true },
      distinct: ['companyId'],
    }),
  ])

  return {
    firstCallAt: aggregate._min.calledAt,
    lastCallAt: aggregate._max.calledAt,
    companiesWithCalls: distinctCompanies.length,
  }
}

export type LegacyBucketResult = RunMetrics & {
  companyIds: string[]
  companyCount: number
  earliestAssignedAt: Date | null
}

/** Metrics for companies assigned without an assignment run (pre-tracking). */
export async function buildLegacyBucketMetrics(
  agentId: string,
  batchId: string
): Promise<LegacyBucketResult> {
  const assignments = await prisma.assignment.findMany({
    where: {
      agentId,
      assignmentRunId: null,
      contact: { company: { importBatchId: batchId } },
    },
    select: {
      assignedAt: true,
      contact: { select: { companyId: true } },
    },
  })

  const companyIds = [...new Set(assignments.map((a) => a.contact.companyId))]
  const earliestAssignedAt =
    assignments.length > 0
      ? assignments.reduce(
          (min, a) => (a.assignedAt < min ? a.assignedAt : min),
          assignments[0].assignedAt
        )
      : null

  if (companyIds.length === 0) {
    return {
      companyIds: [],
      companyCount: 0,
      earliestAssignedAt: null,
      callCount: 0,
      contactedCompanies: 0,
      contactedPct: 0,
      inFunnel: 0,
      ventaCerrada: 0,
      pendingCompanies: 0,
      closeRate: 0,
    }
  }

  const [callCount, lastByCompany] = await Promise.all([
    prisma.callLog.count({
      where: { companyId: { in: companyIds }, agentId },
    }),
    getLastDispositionByCompanyIds(companyIds, agentId),
  ])

  const companyPipeline = buildCompanyPipelineCounts(lastByCompany)
  const pendingCompanies = companyPipeline.PENDING ?? 0
  const contactedCompanies = companyIds.length - pendingCompanies
  const contactedPct =
    companyIds.length > 0 ? Math.round((contactedCompanies / companyIds.length) * 100) : 0
  const inFunnel = FUNNEL_PIPELINE_KEYS.reduce(
    (sum, key) => sum + (companyPipeline[key] ?? 0),
    0
  )
  const ventaCerrada = companyPipeline.VENTA_CERRADA ?? 0
  const closeRate =
    companyIds.length > 0 ? Math.round((ventaCerrada / companyIds.length) * 100) : 0

  return {
    companyIds,
    companyCount: companyIds.length,
    earliestAssignedAt,
    callCount,
    contactedCompanies,
    contactedPct,
    inFunnel,
    ventaCerrada,
    pendingCompanies,
    closeRate,
  }
}

export type AgentAssignmentRunStats = {
  assignmentRunCount: number
  lastAssignmentAt: Date | null
}

/** Per-agent run count + latest assignment date (matches GET /api/assignments/runs list semantics). */
/** Pending companies per agent (assigned with no call log from that agent). */
export async function getPendingCompaniesByAgentId(
  companiesByAgent?: Map<string, Set<string> | string[]>
): Promise<Map<string, number>> {
  let agentCompanyIds: Map<string, string[]>

  if (companiesByAgent) {
    agentCompanyIds = new Map(
      [...companiesByAgent.entries()].map(([agentId, ids]) => [
        agentId,
        ids instanceof Set ? [...ids] : ids,
      ])
    )
  } else {
    const assignments = await prisma.assignment.findMany({
      select: {
        agentId: true,
        contact: { select: { companyId: true } },
      },
    })
    const byAgent = new Map<string, Set<string>>()
    for (const a of assignments) {
      if (!byAgent.has(a.agentId)) {
        byAgent.set(a.agentId, new Set())
      }
      byAgent.get(a.agentId)!.add(a.contact.companyId)
    }
    agentCompanyIds = new Map(
      [...byAgent.entries()].map(([agentId, set]) => [agentId, [...set]])
    )
  }

  const pendingByAgent = new Map<string, number>()

  await Promise.all(
    [...agentCompanyIds.entries()].map(async ([agentId, companyIds]) => {
      if (companyIds.length === 0) {
        pendingByAgent.set(agentId, 0)
        return
      }
      const lastByCompany = await getLastDispositionByCompanyIds(companyIds, agentId)
      const pipeline = buildCompanyPipelineCounts(lastByCompany)
      pendingByAgent.set(agentId, pipeline.PENDING ?? 0)
    })
  )

  return pendingByAgent
}

export async function getAgentAssignmentRunStatsByAgentId(): Promise<
  Map<string, AgentAssignmentRunStats>
> {
  const [allRuns, legacyAssignments, resetAtByAgent] = await Promise.all([
    prisma.assignmentRun.findMany({
      select: { agentId: true, createdAt: true },
    }),
    prisma.assignment.findMany({
      where: { assignmentRunId: null },
      select: {
        agentId: true,
        assignedAt: true,
        contact: { select: { company: { select: { importBatchId: true } } } },
      },
    }),
    getLatestResetAtByAgentIds(),
  ])

  const statsByAgent = new Map<string, AgentAssignmentRunStats>()

  for (const run of allRuns) {
    if (!isAssignmentAfterReset(run.createdAt, resetAtByAgent.get(run.agentId))) continue
    const existing = statsByAgent.get(run.agentId) ?? {
      assignmentRunCount: 0,
      lastAssignmentAt: null,
    }
    existing.assignmentRunCount += 1
    if (!existing.lastAssignmentAt || run.createdAt > existing.lastAssignmentAt) {
      existing.lastAssignmentAt = run.createdAt
    }
    statsByAgent.set(run.agentId, existing)
  }

  const legacyBucketsByAgent = new Map<string, Map<string, Date>>()
  for (const a of legacyAssignments) {
    const batchId = a.contact.company.importBatchId
    if (!batchId) continue
    if (!legacyBucketsByAgent.has(a.agentId)) {
      legacyBucketsByAgent.set(a.agentId, new Map())
    }
    const buckets = legacyBucketsByAgent.get(a.agentId)!
    const cur = buckets.get(batchId)
    if (!cur || a.assignedAt < cur) {
      buckets.set(batchId, a.assignedAt)
    }
  }

  for (const [agentId, buckets] of legacyBucketsByAgent) {
    const resetAt = resetAtByAgent.get(agentId)
    let legacyCount = 0
    let maxBucketEarliest: Date | null = null
    for (const earliest of buckets.values()) {
      if (!isAssignmentAfterReset(earliest, resetAt)) continue
      legacyCount += 1
      if (!maxBucketEarliest || earliest > maxBucketEarliest) {
        maxBucketEarliest = earliest
      }
    }
    if (legacyCount === 0) continue

    const existing = statsByAgent.get(agentId) ?? {
      assignmentRunCount: 0,
      lastAssignmentAt: null,
    }
    existing.assignmentRunCount += legacyCount
    if (
      maxBucketEarliest &&
      (!existing.lastAssignmentAt || maxBucketEarliest > existing.lastAssignmentAt)
    ) {
      existing.lastAssignmentAt = maxBucketEarliest
    }
    statsByAgent.set(agentId, existing)
  }

  return statsByAgent
}

/** Resolve which import batch a run belongs to (by run field or company majority). */
export function resolveRunBatchId(
  runImportBatchId: string | null,
  companyImportBatchIds: (string | null)[]
): string | null {
  if (runImportBatchId) return runImportBatchId

  const counts = new Map<string, number>()
  for (const batchId of companyImportBatchIds) {
    if (!batchId) continue
    counts.set(batchId, (counts.get(batchId) ?? 0) + 1)
  }
  if (counts.size === 0) return null

  let bestBatchId: string | null = null
  let bestCount = 0
  for (const [batchId, count] of counts) {
    if (count > bestCount) {
      bestCount = count
      bestBatchId = batchId
    }
  }
  return bestBatchId
}

export type ActivityQueueSortable = {
  ruc: string
  lastDisposition: string | null
  lastCalledAt: string | Date | null
  _count: { callLogs: number }
}

function hasActivityRecord(c: ActivityQueueSortable): boolean {
  return !!(c.lastDisposition || c._count.callLogs > 0)
}

function isActivityPending(c: ActivityQueueSortable): boolean {
  return !c.lastDisposition && !hasActivityRecord(c)
}

function lastCalledAtMs(c: ActivityQueueSortable): number | null {
  if (!c.lastCalledAt) return null
  const d = c.lastCalledAt instanceof Date ? c.lastCalledAt : new Date(c.lastCalledAt)
  return d.getTime()
}

export type ActivitySortRow = ActivityQueueSortable & { id: string }

/** Sort company ids by activity queue without loading full company graphs. */
export async function sortCompanyIdsByActivityQueue(
  rows: { id: string; ruc: string; globalCallLogCount: number }[],
  dispositionAgentId?: string
): Promise<string[]> {
  if (rows.length === 0) return []
  const companyIds = rows.map((r) => r.id)
  const lastByCompany = await getLastDispositionByCompanyIds(companyIds, dispositionAgentId)
  const sortable: ActivitySortRow[] = rows.map((r) => {
    const last = lastByCompany.get(r.id)
    return {
      id: r.id,
      ruc: r.ruc,
      lastDisposition: last?.disposition ?? null,
      lastCalledAt: last?.lastCalledAt ?? null,
      _count: { callLogs: r.globalCallLogCount },
    }
  })
  return sortClientsByActivityQueue(sortable).map((r) => r.id)
}

export type DaySummaryEntry = {
  dayKey: string
  count: number
  registered: number
  pending: number
}

/** Companies whose scoped last activity falls within the date range. */
export async function filterCompanyIdsByLastActivityRange(
  companyIds: string[],
  calledAtRange: { gte?: Date; lte?: Date },
  dispositionAgentId?: string
): Promise<string[]> {
  if (companyIds.length === 0) return []

  const lastByCompany = await getLastDispositionByCompanyIds(companyIds, dispositionAgentId)
  const result: string[] = []

  for (const id of companyIds) {
    const lastAt = lastByCompany.get(id)?.lastCalledAt
    if (!lastAt) continue
    if (calledAtRange.gte && lastAt < calledAtRange.gte) continue
    if (calledAtRange.lte && lastAt > calledAtRange.lte) continue
    result.push(id)
  }

  return result
}

/** Per-day counts for collapsed day-group headers (bucketed by last activity). */
export async function buildDaySummary(
  companyIds: string[],
  dispositionAgentId?: string
): Promise<DaySummaryEntry[]> {
  if (companyIds.length === 0) return []

  const lastByCompany = await getLastDispositionByCompanyIds(companyIds, dispositionAgentId)
  const byDay = new Map<string, { count: number; registered: number; pending: number }>()

  for (const id of companyIds) {
    const last = lastByCompany.get(id)
    const lastAt = last?.lastCalledAt
    if (!lastAt) continue

    const dayKey = formatYmdInTz(lastAt)
    const disposition = last.disposition ?? null
    const isPending = disposition == null

    const entry = byDay.get(dayKey) ?? { count: 0, registered: 0, pending: 0 }
    entry.count++
    if (isPending) entry.pending++
    else entry.registered++
    byDay.set(dayKey, entry)
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dayKey, stats]) => ({ dayKey, ...stats }))
}

/** Option B: registered/updated by lastCalledAt desc, pendientes at bottom (RUC asc). */
export function sortClientsByActivityQueue<T extends ActivityQueueSortable>(clients: T[]): T[] {
  return [...clients].sort((a, b) => {
    const aPending = isActivityPending(a)
    const bPending = isActivityPending(b)
    if (aPending !== bPending) return aPending ? 1 : -1

    if (!aPending) {
      const aMs = lastCalledAtMs(a)
      const bMs = lastCalledAtMs(b)
      if (aMs === null && bMs === null) return a.ruc.localeCompare(b.ruc, 'es')
      if (aMs === null) return 1
      if (bMs === null) return -1
      const byDate = bMs - aMs
      if (byDate !== 0) return byDate
      return a.ruc.localeCompare(b.ruc, 'es')
    }

    return a.ruc.localeCompare(b.ruc, 'es')
  })
}
