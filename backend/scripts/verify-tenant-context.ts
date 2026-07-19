/**
 * Lightweight checks for tenant ALS helpers (no DB).
 * Usage (from backend/):
 *   npx ts-node --transpile-only scripts/verify-tenant-context.ts
 */
import assert from 'assert'
import {
  allowUnscopedTenantAccess,
  getTenantIdFromContext,
  requireTenantIdFromContext,
  runWithTenant,
} from '../src/lib/tenantContext'
import { resolveTenantIdForSql } from '../src/lib/tenant'

const DEMO = 'cldemotenantdemo00001'

async function main() {
  assert.strictEqual(getTenantIdFromContext(), undefined)
  assert.throws(() => requireTenantIdFromContext(), /Tenant context missing/)

  // Without ALLOW_UNSCOPED_PRISMA, SQL helper must not fall back to Optick
  delete process.env.ALLOW_UNSCOPED_PRISMA
  assert.strictEqual(allowUnscopedTenantAccess(), false)
  assert.throws(() => resolveTenantIdForSql(), /Tenant context missing/)
  assert.strictEqual(resolveTenantIdForSql(DEMO), DEMO)

  await runWithTenant(DEMO, async () => {
    assert.strictEqual(getTenantIdFromContext(), DEMO)
    assert.strictEqual(requireTenantIdFromContext(), DEMO)
    assert.strictEqual(resolveTenantIdForSql(), DEMO)
    // Nested await must still see ALS (same contract Express relies on)
    await Promise.resolve()
    assert.strictEqual(getTenantIdFromContext(), DEMO)
  })

  assert.strictEqual(getTenantIdFromContext(), undefined)

  // Script escape hatch
  process.env.ALLOW_UNSCOPED_PRISMA = '1'
  assert.strictEqual(allowUnscopedTenantAccess(), true)
  assert.strictEqual(resolveTenantIdForSql(), 'clopticktenantcrm0001')
  delete process.env.ALLOW_UNSCOPED_PRISMA

  console.log('OK: tenant context helpers')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
