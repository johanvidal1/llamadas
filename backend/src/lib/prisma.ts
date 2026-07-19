import { Prisma, PrismaClient } from '@prisma/client'
import { TENANT_SCOPED_TABLES } from './tenant'
import {
  allowUnscopedTenantAccess,
  getTenantIdFromContext,
  requireTenantIdFromContext,
} from './tenantContext'

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined
  prismaBase: PrismaClient | undefined
}

function ensureDatasourceParam(url: string, param: string, value: string): string {
  const paramPattern = new RegExp(`([?&])${param}=[^&]*`)
  if (paramPattern.test(url)) {
    return url.replace(paramPattern, `$1${param}=${value}`)
  }
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${param}=${value}`
}

export function buildDatasourceUrl(): string {
  const base = process.env.DATABASE_URL
  if (!base) throw new Error('DATABASE_URL is required')
  let url = base
  url = ensureDatasourceParam(
    url,
    'connection_limit',
    process.env.DATABASE_CONNECTION_LIMIT ?? '5'
  )
  url = ensureDatasourceParam(url, 'pool_timeout', process.env.DATABASE_POOL_TIMEOUT ?? '20')
  return url
}

const TENANT_SCOPED = new Set<string>(TENANT_SCOPED_TABLES)

const READ_WHERE_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
])

const UNIQUE_READ_OPS = new Set(['findUnique', 'findUniqueOrThrow'])
const UNIQUE_WRITE_OPS = new Set(['update', 'delete'])

function modelDelegate(base: PrismaClient, model: string) {
  const key = model.charAt(0).toLowerCase() + model.slice(1)
  return (base as unknown as Record<string, { count: Function; findFirst: Function }>)[key]
}

function notFoundError(model: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    `No ${model} found for tenant-scoped operation`,
    {
      code: 'P2025',
      clientVersion: Prisma.prismaVersion.client,
      meta: { modelName: model },
    }
  )
}

/** Merge tenantId into where; never trust caller-supplied tenantId. */
function withTenantWhere(
  where: Record<string, unknown> | undefined,
  tenantId: string
): Record<string, unknown> {
  return { ...(where ?? {}), tenantId }
}

/**
 * Stamp tenantId on create payloads (top-level and nested create / createMany / connectOrCreate).
 * Overwrites any client-supplied tenantId.
 */
function stampTenantOnData(data: unknown, tenantId: string): unknown {
  if (data == null || typeof data !== 'object') return data
  if (Array.isArray(data)) {
    return data.map((row) => stampTenantOnData(row, tenantId))
  }

  const obj = data as Record<string, unknown>
  const out: Record<string, unknown> = { ...obj, tenantId }

  for (const [key, val] of Object.entries(out)) {
    if (key === 'tenantId' || val == null || typeof val !== 'object') continue
    if (Array.isArray(val)) continue
    if (val instanceof Date) continue

    const rel = val as Record<string, unknown>
    const isNestedWrite =
      'create' in rel ||
      'createMany' in rel ||
      'connectOrCreate' in rel ||
      'upsert' in rel
    if (!isNestedWrite) continue

    const next = { ...rel }

    if ('create' in rel) {
      next.create = stampTenantOnData(rel.create, tenantId)
    }
    if ('createMany' in rel && rel.createMany && typeof rel.createMany === 'object') {
      const cm = rel.createMany as Record<string, unknown>
      next.createMany = {
        ...cm,
        data: stampTenantOnData(cm.data, tenantId),
      }
    }
    if ('connectOrCreate' in rel) {
      const coc = rel.connectOrCreate
      if (Array.isArray(coc)) {
        next.connectOrCreate = coc.map((item) => stampConnectOrCreate(item, tenantId))
      } else {
        next.connectOrCreate = stampConnectOrCreate(coc, tenantId)
      }
    }
    if ('upsert' in rel) {
      const up = rel.upsert
      if (Array.isArray(up)) {
        next.upsert = up.map((item) => stampNestedUpsert(item, tenantId))
      } else {
        next.upsert = stampNestedUpsert(up, tenantId)
      }
    }

    out[key] = next
  }

  return out
}

function stampConnectOrCreate(item: unknown, tenantId: string): unknown {
  if (item == null || typeof item !== 'object') return item
  const row = item as Record<string, unknown>
  return {
    ...row,
    create: stampTenantOnData(row.create, tenantId),
  }
}

function stampNestedUpsert(item: unknown, tenantId: string): unknown {
  if (item == null || typeof item !== 'object') return item
  const row = item as Record<string, unknown>
  return {
    ...row,
    create: stampTenantOnData(row.create, tenantId),
  }
}

/** Flatten Prisma unique where ({ id } or { compound: { ... } }) into a filter object. */
function uniqueWhereToFilter(where: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(where)
  if (keys.length === 1) {
    const key = keys[0]
    const val = where[key]
    if (val != null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      return { ...(val as Record<string, unknown>) }
    }
  }
  return { ...where }
}

async function assertRowInTenant(
  base: PrismaClient,
  model: string,
  where: Record<string, unknown>,
  tenantId: string
): Promise<boolean> {
  const delegate = modelDelegate(base, model)
  if (!delegate) return false
  const filter = uniqueWhereToFilter(where)
  const count = await delegate.count({
    where: { ...filter, tenantId },
  })
  return count > 0
}

function createPrismaClient() {
  const base =
    globalForPrisma.prismaBase ??
    new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
      datasources: {
        db: { url: buildDatasourceUrl() },
      },
    })

  // Keep base for platform ops that must set tenantId explicitly (bypass ALS stamp).
  globalForPrisma.prismaBase = base

  return base.$extends({
    name: 'tenantIsolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_SCOPED.has(model)) {
            return query(args)
          }

          // Fail-closed on HTTP: missing ALS must not run unfiltered scoped queries
          // (that caused intermittent Optick data on other tenants). Scripts/seed:
          // use runWithTenant, getPrismaBase(), or ALLOW_UNSCOPED_PRISMA=1.
          let tenantId = getTenantIdFromContext()
          if (!tenantId) {
            if (allowUnscopedTenantAccess()) {
              return query(args)
            }
            tenantId = requireTenantIdFromContext()
          }

          const a = args as Record<string, unknown>

          if (READ_WHERE_OPS.has(operation)) {
            a.where = withTenantWhere(a.where as Record<string, unknown> | undefined, tenantId)
            return query(a)
          }

          if (operation === 'create') {
            a.data = stampTenantOnData(a.data, tenantId)
            return query(a)
          }

          if (operation === 'createMany') {
            a.data = stampTenantOnData(a.data, tenantId)
            return query(a)
          }

          if (operation === 'upsert') {
            const where = a.where as Record<string, unknown>
            const existing = await modelDelegate(base, model)?.findFirst({
              where: uniqueWhereToFilter(where),
              select: { id: true, tenantId: true },
            })
            if (
              existing &&
              (existing as { tenantId?: string }).tenantId !== tenantId
            ) {
              throw notFoundError(model)
            }
            a.create = stampTenantOnData(a.create, tenantId)
            return query(a)
          }

          if (UNIQUE_READ_OPS.has(operation)) {
            const result = await query(a)
            if (result == null) return result
            const row = result as { id?: string; tenantId?: string }
            if (row.tenantId != null) {
              if (row.tenantId !== tenantId) {
                if (operation === 'findUniqueOrThrow') throw notFoundError(model)
                return null
              }
              return result
            }
            if (row.id) {
              const ok = await assertRowInTenant(base, model, { id: row.id }, tenantId)
              if (!ok) {
                if (operation === 'findUniqueOrThrow') throw notFoundError(model)
                return null
              }
            }
            return result
          }

          if (UNIQUE_WRITE_OPS.has(operation)) {
            const where = a.where as Record<string, unknown>
            const ok = await assertRowInTenant(base, model, where, tenantId)
            if (!ok) throw notFoundError(model)
            if (operation === 'update' && a.data && typeof a.data === 'object') {
              // Never allow changing tenantId via update
              const data = { ...(a.data as Record<string, unknown>) }
              delete data.tenantId
              a.data = data
            }
            return query(a)
          }

          return query(a)
        },
      },
    },
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

/** Unscoped PrismaClient (no ALS stamp). Use only for platform cross-tenant writes. */
export function getPrismaBase(): PrismaClient {
  if (!globalForPrisma.prismaBase) {
    // Ensure extended client (and base) are initialized.
    void prisma
  }
  if (!globalForPrisma.prismaBase) {
    throw new Error('Prisma base client not initialized')
  }
  return globalForPrisma.prismaBase
}

globalForPrisma.prisma = prisma