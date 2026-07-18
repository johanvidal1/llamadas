import { AsyncLocalStorage } from 'async_hooks'

export type TenantStore = {
  tenantId: string
}

/**
 * Per-request tenant for Prisma extension scoping.
 * Set in resolveTenant via runWithTenant; read by prisma.ts $extends.
 */
export const tenantStorage = new AsyncLocalStorage<TenantStore>()

export function getTenantIdFromContext(): string | undefined {
  return tenantStorage.getStore()?.tenantId
}

export function requireTenantIdFromContext(): string {
  const id = getTenantIdFromContext()
  if (!id) {
    throw new Error('Tenant context missing: query rejected')
  }
  return id
}

export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return tenantStorage.run({ tenantId }, fn)
}
