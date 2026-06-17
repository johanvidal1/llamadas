import { prisma } from './prisma'

export const MAX_AGENTS = 25
export const MAX_REGULAR_ADMINS = 1

export interface UserActor {
  id: string
  role: string
  isSuperAdmin: boolean
  isSystemOwner: boolean
}

export interface UserTarget {
  id: string
  role: string
  isSuperAdmin: boolean
  isSystemOwner: boolean
}

export function isSystemOwnerUser(user: { isSystemOwner?: boolean }): boolean {
  return user.isSystemOwner === true
}

export function isSuperAdminOrOwner(user: {
  isSuperAdmin?: boolean
  isSystemOwner?: boolean
}): boolean {
  return user.isSystemOwner === true || user.isSuperAdmin === true
}

export function isAdminUser(user: {
  role: string
  isSuperAdmin?: boolean
  isSystemOwner?: boolean
}): boolean {
  return user.role === 'ADMIN' || user.isSuperAdmin === true || user.isSystemOwner === true
}

/** System owner can manage anyone; super admin cannot touch owner; regular admin only AGENT targets. */
export function canManageUser(actor: UserActor, target: UserTarget): boolean {
  if (target.isSystemOwner && !actor.isSystemOwner) return false
  if (actor.isSystemOwner) return true
  if (actor.isSuperAdmin) return true
  if (
    actor.role === 'ADMIN' &&
    target.role === 'AGENT' &&
    !target.isSuperAdmin &&
    !target.isSystemOwner
  ) {
    return true
  }
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
      isSystemOwner: false,
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
    select: { id: true, role: true, isSuperAdmin: true, isSystemOwner: true },
  })
}
