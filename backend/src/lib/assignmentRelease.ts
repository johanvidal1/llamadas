import { AssignmentRunStatus } from '@prisma/client'
import { prisma } from './prisma'
import { OPTICK_TENANT_ID } from './tenant'

export type ReleaseCompanySummary = {
  id: string
  ruc: string
  razonSocial: string | null
  status: string
  contactCount: number
}

export type ReleaseContext =
  | { type: 'run'; runId: string; agentId: string; importBatchId: string | null }
  | { type: 'legacy'; agentId: string; batchId: string }

export class ReleaseBlockedError extends Error {
  constructor(
    message: string,
    public blockedByCallbacks: number
  ) {
    super(message)
    this.name = 'ReleaseBlockedError'
  }
}

export class ReleaseNothingError extends Error {
  constructor(message = 'No hay empresas pendientes para liberar') {
    super(message)
    this.name = 'ReleaseNothingError'
  }
}

export async function getRunCompanyIds(runId: string): Promise<string[]> {
  const assignments = await prisma.assignment.findMany({
    where: { assignmentRunId: runId },
    select: { contact: { select: { companyId: true } } },
  })
  return [...new Set(assignments.map((a) => a.contact.companyId))]
}

export async function getLegacyCompanyIds(agentId: string, batchId: string): Promise<string[]> {
  const assignments = await prisma.assignment.findMany({
    where: {
      agentId,
      assignmentRunId: null,
      contact: { company: { importBatchId: batchId } },
    },
    select: { contact: { select: { companyId: true } } },
  })
  return [...new Set(assignments.map((a) => a.contact.companyId))]
}

export async function classifyRunCompanies(
  companyIds: string[],
  agentId: string
): Promise<{ releasable: string[]; retained: string[] }> {
  if (companyIds.length === 0) {
    return { releasable: [], retained: [] }
  }

  const workedRows = await prisma.callLog.findMany({
    where: {
      agentId,
      companyId: { in: companyIds },
    },
    select: { companyId: true },
    distinct: ['companyId'],
  })
  const retainedSet = new Set(workedRows.map((r) => r.companyId))
  const retained = companyIds.filter((id) => retainedSet.has(id))
  const releasable = companyIds.filter((id) => !retainedSet.has(id))

  return { releasable, retained }
}

export async function countPendingCallbacks(
  companyIds: string[],
  agentId: string
): Promise<number> {
  if (companyIds.length === 0) return 0
  return prisma.callback.count({
    where: {
      agentId,
      companyId: { in: companyIds },
      completed: false,
    },
  })
}

async function buildCompanySummaries(
  companyIds: string[],
  agentId: string,
  runId?: string,
  batchId?: string
): Promise<ReleaseCompanySummary[]> {
  if (companyIds.length === 0) return []

  const assignments = await prisma.assignment.findMany({
    where: {
      agentId,
      contact: { companyId: { in: companyIds } },
      ...(runId ? { assignmentRunId: runId } : {}),
      ...(batchId && !runId
        ? {
            assignmentRunId: null,
            contact: { company: { importBatchId: batchId } },
          }
        : {}),
    },
    select: {
      contact: {
        select: {
          company: {
            select: { id: true, ruc: true, razonSocial: true, status: true },
          },
        },
      },
    },
  })

  const companyMap = new Map<string, ReleaseCompanySummary>()
  for (const a of assignments) {
    const company = a.contact.company
    const existing = companyMap.get(company.id)
    if (existing) {
      existing.contactCount += 1
    } else {
      companyMap.set(company.id, {
        id: company.id,
        ruc: company.ruc,
        razonSocial: company.razonSocial,
        status: company.status,
        contactCount: 1,
      })
    }
  }

  return [...companyMap.values()].sort((a, b) =>
    (a.razonSocial ?? a.ruc).localeCompare(b.razonSocial ?? b.ruc, 'es')
  )
}

export type ReleasePreviewResult = {
  run: {
    id: string | null
    isLegacy: boolean
    agentId: string
    importBatchId: string | null
    status: AssignmentRunStatus | null
    companyCount: number
    contactCount: number
  }
  releasableCompanies: ReleaseCompanySummary[]
  retainedCompanies: ReleaseCompanySummary[]
  releasableCount: number
  retainedCount: number
  releasableContactCount: number
  blockedByCallbacks?: number
}

async function countContactsForCompanies(
  companyIds: string[],
  agentId: string,
  runId?: string,
  batchId?: string
): Promise<number> {
  if (companyIds.length === 0) return 0
  return prisma.assignment.count({
    where: {
      agentId,
      contact: { companyId: { in: companyIds } },
      ...(runId ? { assignmentRunId: runId } : {}),
      ...(batchId && !runId
        ? {
            assignmentRunId: null,
            contact: { company: { importBatchId: batchId } },
          }
        : {}),
    },
  })
}

export async function resolveRunContext(runId: string): Promise<ReleaseContext> {
  const run = await prisma.assignmentRun.findUnique({
    where: { id: runId },
    select: { id: true, agentId: true, importBatchId: true, status: true },
  })
  if (!run) {
    throw new Error('Asignación no encontrada')
  }
  if (run.status !== AssignmentRunStatus.ACTIVE) {
    throw new Error('Esta asignación ya fue liberada o cerrada')
  }
  return {
    type: 'run',
    runId: run.id,
    agentId: run.agentId,
    importBatchId: run.importBatchId,
  }
}

export async function buildReleasePreviewForContext(
  ctx: ReleaseContext
): Promise<ReleasePreviewResult> {
  const companyIds =
    ctx.type === 'run'
      ? await getRunCompanyIds(ctx.runId)
      : await getLegacyCompanyIds(ctx.agentId, ctx.batchId)

  const { releasable, retained } = await classifyRunCompanies(companyIds, ctx.agentId)

  const [releasableCompanies, retainedCompanies, releasableContactCount, blockedByCallbacks] =
    await Promise.all([
      buildCompanySummaries(
        releasable,
        ctx.agentId,
        ctx.type === 'run' ? ctx.runId : undefined,
        ctx.type === 'legacy' ? ctx.batchId : undefined
      ),
      buildCompanySummaries(
        retained,
        ctx.agentId,
        ctx.type === 'run' ? ctx.runId : undefined,
        ctx.type === 'legacy' ? ctx.batchId : undefined
      ),
      countContactsForCompanies(
        releasable,
        ctx.agentId,
        ctx.type === 'run' ? ctx.runId : undefined,
        ctx.type === 'legacy' ? ctx.batchId : undefined
      ),
      countPendingCallbacks(releasable, ctx.agentId),
    ])

  let runMeta: ReleasePreviewResult['run']
  if (ctx.type === 'run') {
    const run = await prisma.assignmentRun.findUniqueOrThrow({
      where: { id: ctx.runId },
      select: {
        id: true,
        agentId: true,
        importBatchId: true,
        status: true,
        companyCount: true,
        contactCount: true,
      },
    })
    runMeta = {
      id: run.id,
      isLegacy: false,
      agentId: run.agentId,
      importBatchId: run.importBatchId,
      status: run.status,
      companyCount: run.companyCount,
      contactCount: run.contactCount,
    }
  } else {
    runMeta = {
      id: null,
      isLegacy: true,
      agentId: ctx.agentId,
      importBatchId: ctx.batchId,
      status: null,
      companyCount: companyIds.length,
      contactCount: await countContactsForCompanies(
        companyIds,
        ctx.agentId,
        undefined,
        ctx.batchId
      ),
    }
  }

  return {
    run: runMeta,
    releasableCompanies,
    retainedCompanies,
    releasableCount: releasable.length,
    retainedCount: retained.length,
    releasableContactCount,
    ...(blockedByCallbacks > 0 ? { blockedByCallbacks } : {}),
  }
}

export type ReleaseResult = {
  releasedCompanies: number
  releasedContacts: number
  retainedCompanies: number
  status?: AssignmentRunStatus
}

export async function executeReleaseRemainder(
  ctx: ReleaseContext,
  releasedById: string,
  reason?: string
): Promise<ReleaseResult> {
  const preview = await buildReleasePreviewForContext(ctx)

  if (preview.releasableCount === 0) {
    throw new ReleaseNothingError()
  }

  if (preview.blockedByCallbacks && preview.blockedByCallbacks > 0) {
    throw new ReleaseBlockedError(
      `No se puede liberar: ${preview.blockedByCallbacks} empresa${preview.blockedByCallbacks !== 1 ? 's' : ''} con devoluciones de llamada pendientes del agente`,
      preview.blockedByCallbacks
    )
  }

  const releasableIds = preview.releasableCompanies.map((c) => c.id)

  const deleteResult = await prisma.assignment.deleteMany({
    where: {
      agentId: ctx.agentId,
      contact: { companyId: { in: releasableIds } },
      ...(ctx.type === 'run' ? { assignmentRunId: ctx.runId } : {}),
      ...(ctx.type === 'legacy'
        ? {
            assignmentRunId: null,
            contact: { company: { importBatchId: ctx.batchId } },
          }
        : {}),
    },
  })

  const newStatus: AssignmentRunStatus =
    preview.retainedCount > 0
      ? AssignmentRunStatus.PARTIALLY_RELEASED
      : AssignmentRunStatus.CLOSED

  if (ctx.type === 'run') {
    await prisma.assignmentRun.update({
      where: { id: ctx.runId },
      data: {
        status: newStatus,
        releasedAt: new Date(),
        releaseNote: reason?.trim() || null,
      },
    })
  }

  await prisma.assignmentRelease.create({
    data: {
      tenantId: OPTICK_TENANT_ID,
      assignmentRunId: ctx.type === 'run' ? ctx.runId : null,
      releasedById,
      agentId: ctx.agentId,
      importBatchId:
        ctx.type === 'run' ? ctx.importBatchId : ctx.batchId,
      companyCount: preview.releasableCount,
      contactCount: deleteResult.count,
      reason: reason?.trim() || null,
    },
  })

  return {
    releasedCompanies: preview.releasableCount,
    releasedContacts: deleteResult.count,
    retainedCompanies: preview.retainedCount,
    ...(ctx.type === 'run' ? { status: newStatus } : {}),
  }
}
