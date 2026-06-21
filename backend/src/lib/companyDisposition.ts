import { prisma } from './prisma'

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

/** Last disposition per company (scoped to assigned contacts; optional agent filter). */
export async function getLastDispositionByCompanyIds(
  companyIds: string[],
  agentUserId?: string
): Promise<Map<string, { disposition: string | null; aclaracion: string | null }>> {
  const result = new Map<string, { disposition: string | null; aclaracion: string | null }>()
  if (companyIds.length === 0) return result

  const logs = await prisma.callLog.findMany({
    where: {
      companyId: { in: companyIds },
      ...(agentUserId
        ? { agentId: agentUserId, contact: { assignment: { agentId: agentUserId } } }
        : { contact: { assignment: { is: {} } } }),
    },
    select: { companyId: true, disposition: true, aclaracion: true, calledAt: true },
    orderBy: { calledAt: 'desc' },
  })

  for (const log of logs) {
    if (!result.has(log.companyId)) {
      result.set(log.companyId, {
        disposition: log.disposition,
        aclaracion: log.aclaracion,
      })
    }
  }

  for (const id of companyIds) {
    if (!result.has(id)) result.set(id, { disposition: null, aclaracion: null })
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

export type RunMetrics = {
  callCount: number
  contactedCompanies: number
  contactedPct: number
  inFunnel: number
  ventaCerrada: number
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

  return { callCount, contactedCompanies, contactedPct, inFunnel, ventaCerrada }
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

  return {
    companyIds,
    companyCount: companyIds.length,
    earliestAssignedAt,
    callCount,
    contactedCompanies,
    contactedPct,
    inFunnel,
    ventaCerrada,
  }
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
