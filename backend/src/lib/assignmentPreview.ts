import { prisma } from './prisma'
import { getUnassignedContactsOrdered } from './assignmentOrder'

export type AssignmentPreviewResult = {
  requestedCount: number
  contactIds: string[]
  completeBoundary: boolean
  boundaryCompany: {
    id: string
    ruc: string
    razonSocial: string | null
    included: number
    total: number
    missing: number
  } | null
  suggestions: {
    expandTo: number
    expandAdd: number
    shrinkTo: number
    shrinkRemove: number
    expandContactIds: string[]
    shrinkContactIds: string[]
  } | null
  conflictWarning: {
    hasMixedAgents: boolean
    assignedToOthers: number
    agents: { id: string; name: string }[]
  } | null
}

export async function buildAssignmentPreview(
  agentId: string,
  batchId?: string,
  count?: number
): Promise<AssignmentPreviewResult> {
  const allOrdered = await getUnassignedContactsOrdered(batchId)
  const requestedCount = count ?? allOrdered.length
  const slice = count != null ? allOrdered.slice(0, count) : allOrdered

  if (slice.length === 0) {
    return {
      requestedCount,
      contactIds: [],
      completeBoundary: true,
      boundaryCompany: null,
      suggestions: null,
      conflictWarning: null,
    }
  }

  const lastContact = slice[slice.length - 1]
  const boundaryCompanyId = lastContact.companyId
  const k = slice.filter((c) => c.companyId === boundaryCompanyId).length

  const companyContacts = await prisma.contact.findMany({
    where: {
      companyId: boundaryCompanyId,
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

  const T = companyContacts.length
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
  const conflictWarning =
    conflictAgents.length > 0
      ? {
          hasMixedAgents: true,
          assignedToOthers: assignedToOthers.length,
          agents: conflictAgents,
        }
      : null

  const boundaryCompany = {
    id: lastContact.company.id,
    ruc: lastContact.company.ruc,
    razonSocial: lastContact.company.razonSocial,
    included: k,
    total: T,
    missing: T - k,
  }

  if (k === T) {
    return {
      requestedCount,
      contactIds: slice.map((c) => c.id),
      completeBoundary: true,
      boundaryCompany,
      suggestions: null,
      conflictWarning,
    }
  }

  const missing = T - k
  const contactIds = slice.map((c) => c.id)
  const shrinkContactIds = contactIds.slice(0, contactIds.length - k)
  const expandContactIds = allOrdered.slice(0, requestedCount + missing).map((c) => c.id)

  return {
    requestedCount,
    contactIds,
    completeBoundary: false,
    boundaryCompany,
    suggestions: {
      expandTo: requestedCount + missing,
      expandAdd: missing,
      shrinkTo: requestedCount - k,
      shrinkRemove: k,
      expandContactIds,
      shrinkContactIds,
    },
    conflictWarning,
  }
}
