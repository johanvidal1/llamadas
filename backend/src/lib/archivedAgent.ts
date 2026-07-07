import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

export const ARCHIVED_AGENT_EMAIL = 'archived-agent@system.internal'
export const ARCHIVED_AGENT_NAME = 'Agente borrado'

/** Prisma filter to exclude the system wildcard agent from normal lists. */
export const excludeArchivedAgentWhere = { isArchivedAgent: false } as const

/** Active real agents (excludes archived wildcard). */
export const activeAgentUserWhere = {
  role: 'AGENT' as const,
  active: true,
  ...excludeArchivedAgentWhere,
} as const

export async function ensureArchivedAgent(): Promise<{ id: string }> {
  const existing = await prisma.user.findUnique({
    where: { email: ARCHIVED_AGENT_EMAIL },
    select: { id: true, isArchivedAgent: true, active: true },
  })

  if (existing) {
    if (!existing.isArchivedAgent || existing.active) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { isArchivedAgent: true, active: false, role: 'AGENT' },
      })
    }
    return { id: existing.id }
  }

  const password = await bcrypt.hash(
    `archived-agent-${Date.now()}-${Math.random().toString(36)}`,
    12
  )

  const user = await prisma.user.create({
    data: {
      name: ARCHIVED_AGENT_NAME,
      email: ARCHIVED_AGENT_EMAIL,
      password,
      role: 'AGENT',
      active: false,
      isArchivedAgent: true,
      isSuperAdmin: false,
      isSystemOwner: false,
    },
    select: { id: true },
  })

  return user
}

export function isArchivedAgentUser(user: { isArchivedAgent?: boolean }): boolean {
  return user.isArchivedAgent === true
}
