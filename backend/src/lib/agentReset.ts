import { AssignmentRunStatus } from '@prisma/client'
import { ensureArchivedAgent, ARCHIVED_AGENT_NAME } from './archivedAgent'
import { isAdminUser } from './userPermissions'
import { prisma } from './prisma'

export class AgentResetBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentResetBlockedError'
  }
}

/** Latest reset timestamp per agent (originalAgentId). */
export async function getLatestResetAtByAgentIds(
  agentIds?: string[]
): Promise<Map<string, Date>> {
  const resets = await prisma.agentResetLog.findMany({
    where: agentIds ? { originalAgentId: { in: agentIds } } : {},
    orderBy: { createdAt: 'desc' },
    select: { originalAgentId: true, createdAt: true },
  })
  const map = new Map<string, Date>()
  for (const row of resets) {
    if (!map.has(row.originalAgentId)) {
      map.set(row.originalAgentId, row.createdAt)
    }
  }
  return map
}

export function isAssignmentAfterReset(assignedAt: Date, resetAt: Date | undefined): boolean {
  if (!resetAt) return true
  return assignedAt.getTime() >= resetAt.getTime()
}

export type AgentResetPreview = {
  agent: { id: string; name: string; email: string }
  callLogsToArchive: number
  pendingCompaniesToRelease: number
  workedCompaniesCount: number
  pendingCallbacksCount: number
  completedCallbacksCount: number
  sharedWithOtherAgentsCount: number
}

async function loadResetTarget(agentId: string) {
  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isArchivedAgent: true,
      isSuperAdmin: true,
      isSystemOwner: true,
    },
  })

  if (!agent) {
    throw new AgentResetBlockedError('Usuario no encontrado')
  }
  if (agent.isArchivedAgent) {
    throw new AgentResetBlockedError('No se puede resetear al agente comodín del sistema')
  }
  if (agent.role !== 'AGENT' || isAdminUser(agent)) {
    throw new AgentResetBlockedError('Solo se puede resetear usuarios con rol Agente')
  }

  return agent
}

export async function buildAgentResetPreview(agentId: string): Promise<AgentResetPreview> {
  const agent = await loadResetTarget(agentId)

  const [assignments, workedRows, pendingCallbacksCount, completedCallbacksCount, callLogsToArchive] =
    await Promise.all([
      prisma.assignment.findMany({
        where: { agentId },
        select: { contact: { select: { companyId: true } } },
      }),
      prisma.callLog.findMany({
        where: { agentId },
        select: { companyId: true },
        distinct: ['companyId'],
      }),
      prisma.callback.count({ where: { agentId, completed: false } }),
      prisma.callback.count({ where: { agentId, completed: true } }),
      prisma.callLog.count({ where: { agentId } }),
    ])

  const assignedCompanyIds = [...new Set(assignments.map((a) => a.contact.companyId))]
  const workedCompanyIds = new Set(workedRows.map((r) => r.companyId))
  const pendingCompaniesToRelease = assignedCompanyIds.filter((id) => !workedCompanyIds.has(id)).length

  let sharedWithOtherAgentsCount = 0
  if (assignedCompanyIds.length > 0) {
    const otherAssignments = await prisma.assignment.findMany({
      where: {
        agentId: { not: agentId },
        contact: { companyId: { in: assignedCompanyIds } },
      },
      select: { contact: { select: { companyId: true } } },
      distinct: ['contactId'],
    })
    sharedWithOtherAgentsCount = new Set(otherAssignments.map((a) => a.contact.companyId)).size
  }

  return {
    agent: { id: agent.id, name: agent.name, email: agent.email },
    callLogsToArchive,
    pendingCompaniesToRelease,
    workedCompaniesCount: workedCompanyIds.size,
    pendingCallbacksCount,
    completedCallbacksCount,
    sharedWithOtherAgentsCount,
  }
}

export type AgentResetResult = {
  message: string
  counts: {
    callLogsReassigned: number
    callbacksReassigned: number
    pendingCallbacksDeleted: number
    assignmentsDeleted: number
    runsClosed: number
    metricsDeleted: number
  }
}

export async function executeAgentReset(
  agentId: string,
  resetById: string,
  options: { deletePendingCallbacks: boolean; reason?: string }
): Promise<AgentResetResult> {
  const preview = await buildAgentResetPreview(agentId)
  const archivedAgent = await ensureArchivedAgent()

  if (archivedAgent.id === agentId) {
    throw new AgentResetBlockedError('No se puede resetear al agente comodín del sistema')
  }

  const result = await prisma.$transaction(async (tx) => {
    const callLogsReassigned = await tx.callLog.updateMany({
      where: { agentId },
      data: { agentId: archivedAgent.id },
    })

    const callbacksReassigned = await tx.callback.updateMany({
      where: { agentId, completed: true },
      data: { agentId: archivedAgent.id },
    })

    const pendingCallbacksDeleted = options.deletePendingCallbacks
      ? await tx.callback.deleteMany({ where: { agentId, completed: false } })
      : { count: 0 }

    const assignmentsDeleted = await tx.assignment.deleteMany({ where: { agentId } })

    const runsClosed = await tx.assignmentRun.updateMany({
      where: {
        agentId,
        status: {
          in: [
            AssignmentRunStatus.ACTIVE,
            AssignmentRunStatus.PARTIALLY_RELEASED,
            AssignmentRunStatus.PAUSED,
          ],
        },
      },
      data: {
        status: AssignmentRunStatus.CLOSED,
        releasedAt: new Date(),
        releaseNote: 'Cerrada por reset de agente',
      },
    })

    const metricsDeleted = await tx.dailyAgentMetrics.deleteMany({ where: { agentId } })

    await tx.userSession.deleteMany({ where: { userId: agentId } })
    await tx.user.update({
      where: { id: agentId },
      data: { tokenVersion: { increment: 1 } },
    })

    await tx.agentResetLog.create({
      data: {
        originalAgentId: agentId,
        originalAgentName: preview.agent.name,
        resetById,
        reason: options.reason?.trim() || null,
        callLogsReassigned: callLogsReassigned.count,
        callbacksReassigned: callbacksReassigned.count,
        pendingCallbacksDeleted: pendingCallbacksDeleted.count,
        assignmentsDeleted: assignmentsDeleted.count,
        runsClosed: runsClosed.count,
        metricsDeleted: metricsDeleted.count,
      },
    })

    return {
      callLogsReassigned: callLogsReassigned.count,
      callbacksReassigned: callbacksReassigned.count,
      pendingCallbacksDeleted: pendingCallbacksDeleted.count,
      assignmentsDeleted: assignmentsDeleted.count,
      runsClosed: runsClosed.count,
      metricsDeleted: metricsDeleted.count,
    }
  })

  return {
    message: `Cola de ${preview.agent.name} reseteada. El historial comercial quedó en "${ARCHIVED_AGENT_NAME}".`,
    counts: result,
  }
}
