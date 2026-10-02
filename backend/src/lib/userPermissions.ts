import { excludeArchivedAgentWhere } from './archivedAgent'
import { prisma } from './prisma'

/** Default client seat cap for new tenants and missing Tenant.maxUsers. Do not raise. */
export const DEFAULT_MAX_USERS = 25
export const ABSOLUTE_MAX_USERS = 500

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

export type ClientSeatSnapshot = {
  used: number
  max: number
  available: number
  agents: number
  admins: number
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

/**
 * Occupancy filter (active-only client seats).
 * COUNTS: AGENT + client ADMIN (role=ADMIN, not owner) + client super admin (isSuperAdmin, not owner).
 * DOES NOT COUNT: isSystemOwner, isArchivedAgent (Agente borrado), active=false.
 */
export const clientSeatCountWhere = {
  active: true,
  isSystemOwner: false,
  ...excludeArchivedAgentWhere,
  OR: [{ role: 'AGENT' }, { role: 'ADMIN' }, { isSuperAdmin: true }],
}

/** Active agents in the client pool (super admin counted under admins). */
export const clientAgentSeatWhere = {
  role: 'AGENT' as const,
  active: true,
  isSystemOwner: false,
  isSuperAdmin: false,
  ...excludeArchivedAgentWhere,
}

/** Client admins + client super admin; exclude owner. */
export const clientAdminSeatWhere = {
  active: true,
  isSystemOwner: false,
  ...excludeArchivedAgentWhere,
  OR: [{ role: 'ADMIN' }, { isSuperAdmin: true }],
}

export function occupiesClientSeat(user: {
  role: string
  active?: boolean
  isSuperAdmin?: boolean
  isSystemOwner?: boolean
  isArchivedAgent?: boolean
}): boolean {
  if (user.active === false) return false
  if (user.isArchivedAgent === true) return false
  if (user.isSystemOwner === true) return false
  return user.role === 'AGENT' || user.role === 'ADMIN' || user.isSuperAdmin === true
}

export function validateMaxUsers(maxUsers: number, occupancy: number): string | null {
  if (!Number.isInteger(maxUsers) || maxUsers < 1) {
    return 'El cupo debe ser un entero de al menos 1'
  }
  if (maxUsers < occupancy) {
    return `No se puede bajar el cupo por debajo de ${occupancy} usuario${occupancy === 1 ? '' : 's'} en uso`
  }
  if (maxUsers > ABSOLUTE_MAX_USERS) {
    return `El cupo máximo es ${ABSOLUTE_MAX_USERS}`
  }
  return null
}

export async function getClientSeatSnapshot(tenantId: string): Promise<ClientSeatSnapshot> {
  const [agents, admins, tenant] = await Promise.all([
    prisma.user.count({ where: clientAgentSeatWhere }),
    prisma.user.count({ where: clientAdminSeatWhere }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { maxUsers: true } }),
  ])
  const used = agents + admins
  const max = tenant?.maxUsers ?? DEFAULT_MAX_USERS
  return {
    used,
    max,
    available: Math.max(0, max - used),
    agents,
    admins,
  }
}

export async function assertClientSeatLimit(tenantId: string): Promise<void> {
  const { used, max } = await getClientSeatSnapshot(tenantId)
  if (used >= max) {
    throw new Error(`Límite de usuarios activos alcanzado (${max} máximo)`)
  }
}

export async function loadActor(actorId: string): Promise<UserActor | null> {
  return prisma.user.findUnique({
    where: { id: actorId },
    select: { id: true, role: true, isSuperAdmin: true, isSystemOwner: true },
  })
}
