/**
 * Multi-tenant Phase 1 helpers.
 * Host → slug → Tenant; Optick aliases keep pruebacrm/crm/localhost on slug `crm`.
 */
export const OPTICK_TENANT_ID = 'clopticktenantcrm0001'
export const OPTICK_TENANT_SLUG = 'crm'
export const OPTICK_TENANT_NAME = 'Optick'

export const TENANT_ROOT_DOMAIN = 'optickcloud.com'

/** Explicit host → slug (subdomain may differ from tenant slug). */
export const HOST_SLUG_ALIASES: Record<string, string> = {
  'pruebacrm.optickcloud.com': OPTICK_TENANT_SLUG,
  'crm.optickcloud.com': OPTICK_TENANT_SLUG,
  localhost: OPTICK_TENANT_SLUG,
  '127.0.0.1': OPTICK_TENANT_SLUG,
}

/** Subdomains that must not resolve as tenant slugs. */
export const RESERVED_SUBDOMAINS = new Set([
  'www',
  'api',
  'mail',
  'status',
])

/** Tables that carry denormalized tenantId (must stay in sync with schema + backfill). */
export const TENANT_SCOPED_TABLES = [
  'User',
  'ImportBatch',
  'Company',
  'Contact',
  'AssignmentRun',
  'Assignment',
  'CallLog',
  'Callback',
  'DailyAgentMetrics',
  'UserSession',
  'AgentResetLog',
  'AssignmentRelease',
  'MobileLine',
] as const

export type TenantContext = {
  id: string
  slug: string
  name: string
  status: string
}

/**
 * Explicit where fragment for routes/libs that prefer manual scoping.
 * Prefer req.tenant.id when available; Prisma extension also injects via ALS.
 */
export function tenantWhere(tenantId: string): { tenantId: string } {
  return { tenantId }
}

/** Normalize Host / X-Forwarded-Host to hostname without port. */
export function normalizeHost(hostHeader: string | undefined): string {
  const raw = (hostHeader ?? '').split(',')[0]?.trim() ?? ''
  return raw.split(':')[0].toLowerCase()
}

/**
 * Resolve tenant slug from Host.
 * 1) Explicit aliases (pruebacrm → crm, localhost → crm, …)
 * 2) First label of `*.optickcloud.com` if not reserved
 */
export function slugFromHost(hostHeader: string | undefined): string | null {
  const host = normalizeHost(hostHeader)
  if (!host) return null

  const aliased = HOST_SLUG_ALIASES[host]
  if (aliased) return aliased

  const root = TENANT_ROOT_DOMAIN
  if (host === root || host === `www.${root}`) return null
  if (!host.endsWith(`.${root}`)) return null

  const slug = host.slice(0, -(root.length + 1)).split('.')[0]
  if (!slug || RESERVED_SUBDOMAINS.has(slug)) return null
  // pruebacrm / crm are Optick via aliases above; if somehow hit here, map to crm
  if (slug === 'pruebacrm' || slug === 'crm') return OPTICK_TENANT_SLUG
  return slug
}
