import { prisma } from './prisma'

export const MAX_AGENTS = 25
export const MAX_REGULAR_ADMINS = 1

export interface UserActor {
  id: string
  role: string
  isSuperAdmin: boolean
}

export interface UserTarget {
  id: string
  role: string
  isSuperAdmin: boolean
}

export function isAdminUser(user: { role: string; isSuperAdmin?: boolean }): boolean {
  return user.role === 'ADMIN' || user.isSuperAdmin === true
}

/** Super admin can manage anyone; regular admin only AGENT targets. */
export function canManageUser(actor: UserActor, target: UserTarget): boolean {
  if (actor.isSuperAdmin) return true
  if (actor.role === 'ADMIN' && target.role === 'AGENT' && !target.isSuperAdmin) return true
  return false
}

export async function countAgents(): Promise<number> {
  return prisma.user.count({ where: { role: 'AGENT' } })
}

export async function countRegularAdmins(excludeUserId?: string): Promise<number> {
  return prisma.user.count({
    where: {
      role: 'ADMIN',
      isSuperAdmin: false,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  })
}

export async function assertAgentLimit(): Promise<void> {
  const count = await countAgents()
  if (count >= MAX_AGENTS) {
    throw new Error(`Límite de agentes alcanzado (${MAX_AGENTS} máximo)`)
  }
}

export async function assertRegularAdminLimit(excludeUserId?: string): Promise<void> {
  const count = await countRegularAdmins(excludeUserId)
  if (count >= MAX_REGULAR_ADMINS) {
    throw new Error(`Límite de administradores alcanzado (${MAX_REGULAR_ADMINS} máximo además del super admin)`)
  }
}

export async function loadActor(actorId: string): Promise<UserActor | null> {
  return prisma.user.findUnique({
    where: { id: actorId },
    select: { id: true, role: true, isSuperAdmin: true },
  })
}
