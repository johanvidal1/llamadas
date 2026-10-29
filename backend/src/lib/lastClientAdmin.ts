import { prisma } from './prisma'
import { clientAdminSeatWhere } from './userPermissions'

/** UI / API copy: last remaining *client* admin (owner is not counted). */
export const LAST_CLIENT_ADMIN_DELETE_ERROR =
  'No se puede eliminar al último administrador del espacio'
export const LAST_CLIENT_ADMIN_DEACTIVATE_ERROR =
  'No se puede desactivar al último administrador del espacio'

export const ADMIN_DELETE_PASSWORD_REQUIRED = 'ADMIN_DELETE_PASSWORD_REQUIRED'
export const ADMIN_DELETE_PASSWORD_INVALID = 'ADMIN_DELETE_PASSWORD_INVALID'

export type ClientAdminShape = {
  id?: string
  role: string
  isSuperAdmin?: boolean
  isSystemOwner?: boolean
  isArchivedAgent?: boolean
  active?: boolean
}

/**
 * Client admin for the last-admin lock:
 * role ADMIN and/or isSuperAdmin, NOT owner, NOT archived, active (preferred).
 * The system owner is never a client admin for this count.
 */
export function isCountedClientAdmin(user: ClientAdminShape): boolean {
  if (user.isSystemOwner === true) return false
  if (user.isArchivedAgent === true) return false
  if (user.active === false) return false
  return user.role === 'ADMIN' || user.isSuperAdmin === true
}

/** Deleting this person requires the logged-in user's password (not a shared clave). */
export function adminDeleteRequiresStepUp(user: ClientAdminShape): boolean {
  if (user.isSystemOwner === true) return false
  return user.role === 'ADMIN' || user.isSuperAdmin === true
}

export function wouldLeaveZeroClientAdmins(
  target: ClientAdminShape,
  otherClientAdminCount: number,
): boolean {
  if (!isCountedClientAdmin(target)) return false
  return otherClientAdminCount <= 0
}

export async function countOtherClientAdmins(excludeUserId: string): Promise<number> {
  return prisma.user.count({
    where: {
      ...clientAdminSeatWhere,
      id: { not: excludeUserId },
    },
  })
}

export function evaluateAdminDeleteStepUp(password: unknown):
  | { ok: true; password: string }
  | { ok: false; status: 401 | 403; error: string; code: string } {
  if (typeof password !== 'string' || password.length === 0) {
    return {
      ok: false,
      status: 403,
      error: 'Confirma con tu contraseña para eliminar a un administrador',
      code: ADMIN_DELETE_PASSWORD_REQUIRED,
    }
  }
  return { ok: true, password }
}

export function invalidAdminDeletePassword(): {
  status: 401
  error: string
  code: string
} {
  return {
    status: 401,
    error: 'Contraseña incorrecta',
    code: ADMIN_DELETE_PASSWORD_INVALID,
  }
}

export type DeleteGuardResult =
  | { action: 'allow'; requirePassword: boolean }
  | { action: 'block'; status: number; error: string; code?: string }

export function evaluateDeleteTarget(input: {
  target: ClientAdminShape
  otherClientAdminCount: number
  password?: unknown
  actorPasswordMatches?: boolean
}): DeleteGuardResult {
  const { target, otherClientAdminCount, password, actorPasswordMatches } = input
  if (wouldLeaveZeroClientAdmins(target, otherClientAdminCount)) {
    return { action: 'block', status: 409, error: LAST_CLIENT_ADMIN_DELETE_ERROR }
  }
  if (!adminDeleteRequiresStepUp(target)) {
    return { action: 'allow', requirePassword: false }
  }
  const step = evaluateAdminDeleteStepUp(password)
  if (!step.ok) {
    return { action: 'block', status: step.status, error: step.error, code: step.code }
  }
  if (actorPasswordMatches === false) {
    const invalid = invalidAdminDeletePassword()
    return { action: 'block', status: invalid.status, error: invalid.error, code: invalid.code }
  }
  return { action: 'allow', requirePassword: true }
}

export function evaluateDeactivateTarget(
  target: ClientAdminShape,
  otherClientAdminCount: number,
): DeleteGuardResult {
  if (wouldLeaveZeroClientAdmins(target, otherClientAdminCount)) {
    return { action: 'block', status: 409, error: LAST_CLIENT_ADMIN_DEACTIVATE_ERROR }
  }
  return { action: 'allow', requirePassword: false }
}
