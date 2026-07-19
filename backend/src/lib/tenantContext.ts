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

/**
 * Scripts/seed only: set ALLOW_UNSCOPED_PRISMA=1 to allow scoped Prisma ops
 * and SQL tenant resolution without ALS (Optick fallback). Never set on HTTP servers.
 */
export function allowUnscopedTenantAccess(): boolean {
  return process.env.ALLOW_UNSCOPED_PRISMA === '1'
}

/**
 * Bind ALS for `fn`. If `fn` returns a Promise, the store stays active until
 * that Promise settles (Node ALS contract) — use this for Express so the store
 * survives async route handlers until the response finishes.
 */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return tenantStorage.run({ tenantId }, fn)
}
