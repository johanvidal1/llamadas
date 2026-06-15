import { prisma } from './prisma'

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
  return prisma.contact.findMany({
    where: {
      assignment: null,
      ...(batchId ? { company: { importBatchId: batchId } } : {}),
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
