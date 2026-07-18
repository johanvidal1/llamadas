/**
 * Idempotent backfill: ensure Optick tenant (slug crm) exists and assign
 * any null tenantId rows to it.
 *
 * Preferred path: migration `20260718120000_multi_tenant_optick` already does
 * expand → backfill → constrain in one transaction. This script is for repair
 * or for environments that applied an expand-only migration first.
 *
 * Usage (from backend/, with DATABASE_URL set):
 *   npx ts-node scripts/backfill-tenant-optick.ts
 *
 * On Ubuntu staging (API container):
 *   docker exec -it llamadas-api npx ts-node --transpile-only scripts/backfill-tenant-optick.ts
 */
import 'dotenv/config'
import { PrismaClient, Prisma } from '@prisma/client'
import {
  OPTICK_TENANT_ID,
  OPTICK_TENANT_NAME,
  OPTICK_TENANT_SLUG,
  TENANT_SCOPED_TABLES,
} from '../src/lib/tenant'

const prisma = new PrismaClient()

async function main() {
  console.log(`Ensuring tenant ${OPTICK_TENANT_NAME} (slug=${OPTICK_TENANT_SLUG})...`)

  const tenant = await prisma.tenant.upsert({
    where: { slug: OPTICK_TENANT_SLUG },
    create: {
      id: OPTICK_TENANT_ID,
      name: OPTICK_TENANT_NAME,
      slug: OPTICK_TENANT_SLUG,
      status: 'ACTIVE',
    },
    update: {
      name: OPTICK_TENANT_NAME,
      status: 'ACTIVE',
    },
  })

  console.log(`Tenant id=${tenant.id} slug=${tenant.slug} status=${tenant.status}`)

  let total = 0
  for (const table of TENANT_SCOPED_TABLES) {
    // Raw SQL: works even after Prisma types tenantId as required (NOT NULL).
    const result = await prisma.$executeRaw(
      Prisma.sql`UPDATE ${Prisma.raw(`"${table}"`)} SET "tenantId" = ${tenant.id} WHERE "tenantId" IS NULL`
    )
    if (result > 0) console.log(`  ${table}: ${result} rows backfilled`)
    total += result
  }

  if (total === 0) {
    console.log('No null tenantId rows (already constrained or already backfilled).')
  } else {
    console.log(`Done: ${total} rows assigned to tenant ${tenant.slug}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
