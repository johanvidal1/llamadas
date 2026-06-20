import { prisma } from './prisma'
import {
  getUnassignedCompaniesOrdered,
  getContactIdsForCompanies,
} from './assignmentOrder'

export type AssignmentPreviewResult = {
  requestedCompanyCount: number
  companyIds: string[]
  contactIds: string[]
  assignedCompanies: number
  assignedContacts: number
  completeBoundary: boolean
  boundaryCompany: null
  suggestions: null
  conflictWarning: {
    hasMixedAgents: boolean
    assignedToOthers: number
    agents: { id: string; name: string }[]
  } | null
}

async function buildConflictWarning(
  agentId: string,
  companyIds: string[],
  batchId?: string
): Promise<AssignmentPreviewResult['conflictWarning']> {
  if (companyIds.length === 0) return null

  const companyContacts = await prisma.contact.findMany({
    where: {
      companyId: { in: companyIds },
      ...(batchId ? { company: { importBatchId: batchId } } : {}),
    },
    select: {
      assignment: {
        select: {
          agentId: true,
          agent: { select: { id: true, name: true } },
        },
      },
    },
  })

  const assignedToOthers = companyContacts.filter(
    (c) => c.assignment && c.assignment.agentId !== agentId
  )
  const agentMap = new Map<string, { id: string; name: string }>()
  for (const c of assignedToOthers) {
    if (c.assignment) {
      agentMap.set(c.assignment.agent.id, c.assignment.agent)
    }
  }
  const conflictAgents = [...agentMap.values()]
  return conflictAgents.length > 0
    ? {
        hasMixedAgents: true,
        assignedToOthers: assignedToOthers.length,
        agents: conflictAgents,
      }
    : null
}

export async function buildAssignmentPreview(
  agentId: string,
  batchId?: string,
  count?: number
): Promise<AssignmentPreviewResult> {
  const allOrdered = await getUnassignedCompaniesOrdered(batchId)
  const requestedCompanyCount = count ?? allOrdered.length
  const selected = count != null ? allOrdered.slice(0, count) : allOrdered
  const companyIds = selected.map((c) => c.id)
  const contactIds = await getContactIdsForCompanies(companyIds, batchId)

  if (selected.length === 0) {
    return {
      requestedCompanyCount,
      companyIds: [],
      contactIds: [],
      assignedCompanies: 0,
      assignedContacts: 0,
      completeBoundary: true,
      boundaryCompany: null,
      suggestions: null,
      conflictWarning: null,
    }
  }

  const conflictWarning = await buildConflictWarning(agentId, companyIds, batchId)

  return {
    requestedCompanyCount,
    companyIds,
    contactIds,
    assignedCompanies: selected.length,
    assignedContacts: contactIds.length,
    completeBoundary: true,
    boundaryCompany: null,
    suggestions: null,
    conflictWarning,
  }
}
