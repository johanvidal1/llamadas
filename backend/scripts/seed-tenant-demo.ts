/**
 * Idempotent seed: tenant `demo` (ACTIVE) + admin user scoped only to that tenant.
 *
 * Staging-only smoke for multi-tenant PR5. Does NOT touch Optick (`crm`) data.
 *
 * Env (optional; safe staging defaults — do NOT reuse in prod):
 *   DEMO_TENANT_ID       default cldemotenantdemo00001
 *   DEMO_ADMIN_EMAIL     default demo-admin@optick.demo
 *   DEMO_ADMIN_PASSWORD  default DemoAdmin123!
 *   DEMO_ADMIN_NAME      default Demo Admin
 *   DEMO_AGENT_EMAIL     default demo-agent@optick.demo
 *   DEMO_AGENT_PASSWORD  default DemoAgent123!
 *
 * Usage (from backend/, DATABASE_URL set):
 *   npx ts-node --transpile-only scripts/seed-tenant-demo.ts
 *
 * On Ubuntu staging (API container):
 *   docker exec -it llamadas-api npx ts-node --transpile-only scripts/seed-tenant-demo.ts
 */
import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEMO_TENANT_ID = process.env.DEMO_TENANT_ID?.trim() || 'cldemotenantdemo00001'
const DEMO_SLUG = 'demo'
const DEMO_NAME = 'Demo'

const ADMIN_EMAIL = (process.env.DEMO_ADMIN_EMAIL?.trim() || 'demo-admin@optick.demo').toLowerCase()
const ADMIN_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || 'DemoAdmin123!'
const ADMIN_NAME = process.env.DEMO_ADMIN_NAME?.trim() || 'Demo Admin'

const AGENT_EMAIL = (process.env.DEMO_AGENT_EMAIL?.trim() || 'demo-agent@optick.demo').toLowerCase()
const AGENT_PASSWORD = process.env.DEMO_AGENT_PASSWORD || 'DemoAgent123!'
const AGENT_NAME = process.env.DEMO_AGENT_NAME?.trim() || 'Demo Agent'

async function upsertUser(opts: {
  tenantId: string
  email: string
  passwordPlain: string
  name: string
  role: 'ADMIN' | 'AGENT'
  isSuperAdmin?: boolean
}) {
  const existing = await prisma.user.findFirst({
    where: { tenantId: opts.tenantId, email: opts.email },
  })
  const password = await bcrypt.hash(opts.passwordPlain, 12)

  if (existing) {
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: opts.name,
        password,
        role: opts.role,
        active: true,
        isSuperAdmin: opts.isSuperAdmin ?? false,
        isSystemOwner: false,
        isArchivedAgent: false,
      },
    })
    return { user, created: false }
  }

  const user = await prisma.user.create({
    data: {
      tenantId: opts.tenantId,
      email: opts.email,
      name: opts.name,
      password,
      role: opts.role,
      active: true,
      isSuperAdmin: opts.isSuperAdmin ?? false,
      isSystemOwner: false,
    },
  })
  return { user, created: true }
}

async function main() {
  console.log(`Ensuring tenant ${DEMO_NAME} (slug=${DEMO_SLUG})...`)

  const tenant = await prisma.tenant.upsert({
    where: { slug: DEMO_SLUG },
    create: {
      id: DEMO_TENANT_ID,
      name: DEMO_NAME,
      slug: DEMO_SLUG,
      status: 'ACTIVE',
    },
    update: {
      name: DEMO_NAME,
      status: 'ACTIVE',
    },
  })

  console.log(`Tenant id=${tenant.id} slug=${tenant.slug} status=${tenant.status}`)

  const admin = await upsertUser({
    tenantId: tenant.id,
    email: ADMIN_EMAIL,
    passwordPlain: ADMIN_PASSWORD,
    name: ADMIN_NAME,
    role: 'ADMIN',
    isSuperAdmin: true,
  })
  console.log(
    `${admin.created ? 'Created' : 'Updated'} admin: ${admin.user.email} (id=${admin.user.id})`
  )

  const agent = await upsertUser({
    tenantId: tenant.id,
    email: AGENT_EMAIL,
    passwordPlain: AGENT_PASSWORD,
    name: AGENT_NAME,
    role: 'AGENT',
  })
  console.log(
    `${agent.created ? 'Created' : 'Updated'} agent: ${agent.user.email} (id=${agent.user.id})`
  )

  // Marker company so list endpoints return ≥1 row for demo (isolation smoke).
  const markerRuc = 'DEMO-00000001'
  const markerRazon = 'Demo Isolation Co'
  const existingCompany = await prisma.company.findFirst({
    where: { tenantId: tenant.id, ruc: markerRuc },
    select: { id: true, razonSocial: true },
  })
  if (!existingCompany) {
    const batch = await prisma.importBatch.create({
      data: {
        tenantId: tenant.id,
        filename: 'demo-seed.csv',
        displayName: 'Demo seed batch',
        totalRecords: 1,
        importedById: admin.user.id,
      },
    })
    const company = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        ruc: markerRuc,
        razonSocial: markerRazon,
        importBatchId: batch.id,
        status: 'PENDING',
      },
    })
    console.log(`Created marker company: ${company.razonSocial} (id=${company.id})`)
  } else {
    console.log(
      `Marker company already exists: ${existingCompany.razonSocial ?? markerRazon} (id=${existingCompany.id})`
    )
  }

  console.log('')
  console.log('=== Demo tenant ready (staging smoke) ===')
  console.log(`Host: https://demo.optickcloud.com  (or Host: demo.optickcloud.com)`)
  console.log(`Admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
  console.log(`Agent: ${AGENT_EMAIL} / ${AGENT_PASSWORD}`)
  console.log('')
  console.log('Note: public wildcard *.optickcloud.com routes to PROD Caddy upstream.')
  console.log('Staging isolation: curl staging API with Host: demo.optickcloud.com')
  console.log('(see docs/MULTI-TENANT-FASE1.md § PR5).')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
