export const LAST_CLIENT_ADMIN_DELETE_TOOLTIP =
  'No se puede eliminar al último administrador del espacio'
export const LAST_CLIENT_ADMIN_DEACTIVATE_TOOLTIP =
  'No se puede desactivar al último administrador del espacio'

export type ClientAdminUser = {
  role: string
  isSuperAdmin?: boolean
  isSystemOwner?: boolean
  active?: boolean
}

/** Same count as backend: ADMIN and/or isSuperAdmin, not owner, preferably active. */
export function isCountedClientAdmin(user: ClientAdminUser): boolean {
  if (user.isSystemOwner === true) return false
  if (user.active === false) return false
  return user.role === 'ADMIN' || user.isSuperAdmin === true
}

export function countCountedClientAdmins(users: ClientAdminUser[]): number {
  return users.filter(isCountedClientAdmin).length
}

export function isLastCountedClientAdmin(user: ClientAdminUser, users: ClientAdminUser[]): boolean {
  if (!isCountedClientAdmin(user)) return false
  return countCountedClientAdmins(users) <= 1
}

/** Password step-up when deleting a client admin (not the owner). */
export function adminDeleteRequiresStepUp(user: ClientAdminUser): boolean {
  if (user.isSystemOwner === true) return false
  return user.role === 'ADMIN' || user.isSuperAdmin === true
}
