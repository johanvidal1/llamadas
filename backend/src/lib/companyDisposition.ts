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
