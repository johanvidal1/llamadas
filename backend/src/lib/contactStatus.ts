import { prisma } from './prisma'

export const dispositionToStatus: Record<string, string> = {
  INTERESTED: 'INTERESTED',
  NOT_INTERESTED: 'NOT_INTERESTED',
  NO_ANSWER: 'IN_PROGRESS',
  BUSY: 'IN_PROGRESS',
  CALLBACK: 'IN_PROGRESS',
  DO_NOT_CALL: 'DO_NOT_CALL',
  OTHER: 'IN_PROGRESS',
}

/**
 * Derive company.status from its contacts:
 * CONVERTED if any CONVERTED; else INTERESTED if any INTERESTED;
 * else all DO_NOT_CALL → DO_NOT_CALL; all NOT_INTERESTED → NOT_INTERESTED;
 * all PENDING → PENDING; else IN_PROGRESS (mixed or in-progress contacts).
 */
export function deriveCompanyStatusFromContacts(statuses: string[]): string {
  if (statuses.length === 0) return 'PENDING'
  if (statuses.some((s) => s === 'CONVERTED')) return 'CONVERTED'
  if (statuses.some((s) => s === 'INTERESTED')) return 'INTERESTED'
  if (statuses.every((s) => s === 'DO_NOT_CALL')) return 'DO_NOT_CALL'
  if (statuses.every((s) => s === 'NOT_INTERESTED')) return 'NOT_INTERESTED'
  if (statuses.every((s) => s === 'PENDING')) return 'PENDING'
  return 'IN_PROGRESS'
}

export async function recomputeCompanyStatus(companyId: string): Promise<void> {
  const contacts = await prisma.contact.findMany({
    where: { companyId },
    select: { status: true },
  })
  const status = deriveCompanyStatusFromContacts(contacts.map((c) => c.status))
  await prisma.company.update({
    where: { id: companyId },
    data: { status },
  })
}
