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

export type OrderedCompany = {
  id: string
  ruc: string
  razonSocial: string | null
  contactCount: number
  createdAt: Date
}

function companyScopeWhere(batchId?: string): Record<string, unknown> {
  return batchId ? { importBatchId: batchId } : { importBatch: { blocked: false } }
}

/** Companies with at least one contact and zero assignments on any contact. */
export async function getUnassignedCompaniesOrdered(
  batchId?: string,
  limit?: number
): Promise<OrderedCompany[]> {
  if (batchId) {
    await assertBatchNotBlocked(batchId)
  }

  const scope = companyScopeWhere(batchId)

  const assignedCompanyIds = (
    await prisma.contact.findMany({
      where: {
        assignment: { isNot: null },
        company: scope,
      },
      select: { companyId: true },
      distinct: ['companyId'],
    })
  ).map((c) => c.companyId)

  const companies = await prisma.company.findMany({
    where: {
      ...scope,
      ...(assignedCompanyIds.length > 0 ? { id: { notIn: assignedCompanyIds } } : {}),
      contacts: { some: {} },
    },
    select: {
      id: true,
      ruc: true,
      razonSocial: true,
      createdAt: true,
      _count: { select: { contacts: true } },
    },
    orderBy: { createdAt: 'asc' },
    ...(limit != null ? { take: limit } : {}),
  })

  return companies.map((c) => ({
    id: c.id,
    ruc: c.ruc,
    razonSocial: c.razonSocial,
    contactCount: c._count.contacts,
    createdAt: c.createdAt,
  }))
}

export async function countUnassignedCompanies(
  batchId?: string
): Promise<{ companies: number; contactCount: number }> {
  if (batchId) {
    await assertBatchNotBlocked(batchId)
  }

  const scope = companyScopeWhere(batchId)

  const assignedCompanyIds = (
    await prisma.contact.findMany({
      where: {
        assignment: { isNot: null },
        company: scope,
      },
      select: { companyId: true },
      distinct: ['companyId'],
    })
  ).map((c) => c.companyId)

  const companies = await prisma.company.findMany({
    where: {
      ...scope,
      ...(assignedCompanyIds.length > 0 ? { id: { notIn: assignedCompanyIds } } : {}),
      contacts: { some: {} },
    },
    select: { _count: { select: { contacts: true } } },
  })

  return {
    companies: companies.length,
    contactCount: companies.reduce((sum, c) => sum + c._count.contacts, 0),
  }
}

export async function getContactIdsForCompanies(
  companyIds: string[],
  batchId?: string
): Promise<string[]> {
  if (companyIds.length === 0) return []

  const contacts = await prisma.contact.findMany({
    where: {
      companyId: { in: companyIds },
      ...(batchId ? { company: { importBatchId: batchId } } : {}),
    },
    select: { id: true },
    orderBy: [{ company: { createdAt: 'asc' } }, { createdAt: 'asc' }, { id: 'asc' }],
  })

  return contacts.map((c) => c.id)
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
