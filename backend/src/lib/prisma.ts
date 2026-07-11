import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

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

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: {
      db: { url: buildDatasourceUrl() },
    },
  })

globalForPrisma.prisma = prisma
