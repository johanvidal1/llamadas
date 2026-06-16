import { prisma } from './prisma'

export class BatchBlockedError extends Error {
  constructor() {
    super('Este lote está bloqueado y no puede usarse para nuevas asignaciones')
    this.name = 'BatchBlockedError'
  }
}

export async function assertBatchNotBlocked(batchId: string): Promise<void> {
  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    select: { blocked: true },
  })
  if (batch?.blocked) {
    throw new BatchBlockedError()
  }
}

export type OrderedContact = {
  id: string
  companyId: string
  company: {
    id: string
    ruc: string
    razonSocial: string | null
    createdAt: Date
  }
}

/** Unassigned contacts in Excel/RUC order: company.createdAt, then contact.createdAt. */
export async function getUnassignedContactsOrdered(
  batchId?: string,
  limit?: number
): Promise<OrderedContact[]> {
  if (batchId) {
    await assertBatchNotBlocked(batchId)
  }

  let assignedIds: string[] = []
  if (batchId) {
    const batchContacts = await prisma.contact.findMany({
      where: { company: { importBatchId: batchId } },
      select: { id: true },
    })
    const batchContactIds = batchContacts.map((c) => c.id)
    if (batchContactIds.length > 0) {
      const assigned = await prisma.assignment.findMany({
        where: { contactId: { in: batchContactIds } },
        select: { contactId: true },
      })
      assignedIds = assigned.map((a) => a.contactId)
    }
  } else {
    const assigned = await prisma.assignment.findMany({ select: { contactId: true } })
    assignedIds = assigned.map((a) => a.contactId)
  }

  return prisma.contact.findMany({
    where: {
      ...(batchId
        ? { company: { importBatchId: batchId } }
        : { company: { importBatch: { blocked: false } } }),
      ...(assignedIds.length > 0 ? { id: { notIn: assignedIds } } : {}),
    },
    select: {
      id: true,
      companyId: true,
      company: {
        select: {
          id: true,
          ruc: true,
          razonSocial: true,
          createdAt: true,
        },
      },
    },
    orderBy: [{ company: { createdAt: 'asc' } }, { createdAt: 'asc' }, { id: 'asc' }],
    take: limit ?? undefined,
  })
}
