import assert from 'node:assert/strict'
import {
  CAMPAIGN_RESET_CHUNKED_TABLES,
  CAMPAIGN_RESET_FK_DELETE_ORDER,
  CAMPAIGN_RESET_KEPT_TABLES,
  CAMPAIGN_RESET_USER_FIELDS_CLEARED,
  CAMPAIGN_RESET_USES_INTERACTIVE_TRANSACTION,
  CAMPAIGN_RESET_WIPED_TABLES,
} from './campaignResetTables'
import {
  CAMPAIGN_RESET_CHUNK_SIZE,
  CampaignResetPartialError,
  campaignResetOthersSessionWhere,
  deleteManyChunked,
  formatPartialResetError,
  runSequentialCampaignResetSteps,
} from './campaignResetWipe'

function section(name: string) {
  console.log(`\n• ${name}`)
}

function indexOf(table: string): number {
  return (CAMPAIGN_RESET_FK_DELETE_ORDER as readonly string[]).indexOf(table)
}

async function main() {
section('wipes assignment history, metrics, sessions, reset logs, tickets')
for (const table of [
  'AssignmentRun',
  'AssignmentRelease',
  'DailyAgentMetrics',
  'UserSession',
  'AgentResetLog',
  'SupportTicket',
  'SupportTicketAttachment',
  'MobileLine',
  'Callback',
  'CallLog',
  'Assignment',
  'Contact',
  'Company',
  'ImportBatch',
]) {
  assert.ok(
    (CAMPAIGN_RESET_WIPED_TABLES as readonly string[]).includes(table),
    `expected ${table} in wiped list`
  )
}

section('never deletes User, Tenant, or ReleaseNote (Novedades / owner / plan)')
for (const table of ['User', 'Tenant', 'ReleaseNote']) {
  assert.ok((CAMPAIGN_RESET_KEPT_TABLES as readonly string[]).includes(table))
  assert.equal((CAMPAIGN_RESET_WIPED_TABLES as readonly string[]).includes(table), false)
}

section('FK order: releases and runs before import batches')
assert.ok(indexOf('AssignmentRelease') < indexOf('AssignmentRun'))
assert.ok(indexOf('Assignment') < indexOf('AssignmentRun'))
assert.ok(indexOf('AssignmentRun') < indexOf('ImportBatch'))
assert.ok(indexOf('Company') < indexOf('ImportBatch'))
assert.ok(indexOf('CallLog') < indexOf('Company'))
assert.ok(indexOf('Callback') < indexOf('Company'))
assert.ok(indexOf('SupportTicketAttachment') < indexOf('SupportTicket'))
assert.ok(indexOf('MobileLine') < indexOf('Company'))
assert.ok(indexOf('UserSession') < indexOf('AgentResetLog'))
assert.ok(indexOf('Contact') < indexOf('Company'))

section('FK order list matches wiped tables')
assert.deepEqual(
  [...CAMPAIGN_RESET_FK_DELETE_ORDER].sort(),
  [...CAMPAIGN_RESET_WIPED_TABLES].sort()
)

section('clears lote pins on User rows without deleting users')
assert.deepEqual(
  [...CAMPAIGN_RESET_USER_FIELDS_CLEARED],
  ['workingBatchId', 'workingBatchIdEntel', 'workingBatchIdMovistar']
)

section('does not wrap the wipe in one interactive transaction')
assert.equal(CAMPAIGN_RESET_USES_INTERACTIVE_TRANSACTION, false)

section('chunks CallLog, Contact and Company')
assert.deepEqual([...CAMPAIGN_RESET_CHUNKED_TABLES], ['CallLog', 'Contact', 'Company'])
assert.ok(CAMPAIGN_RESET_CHUNK_SIZE >= 1000)

section('deleteManyChunked loops by id take')
{
  const ids = Array.from({ length: 12 }, (_, i) => `id-${i}`)
  let remaining = [...ids]
  const deleteCalls: string[][] = []
  const model = {
    findMany: async ({ take }: { take: number }) => remaining.slice(0, take).map((id) => ({ id })),
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
      const batch = (where.id as { in: string[] }).in
      deleteCalls.push(batch)
      remaining = remaining.filter((id) => !batch.includes(id))
      return { count: batch.length }
    },
  }
  const total = await deleteManyChunked(model, { tenantId: 't1' }, 5)
  assert.equal(total, 12)
  assert.equal(deleteCalls.length, 3)
  assert.deepEqual(deleteCalls[0], ids.slice(0, 5))
  assert.deepEqual(deleteCalls[1], ids.slice(5, 10))
  assert.deepEqual(deleteCalls[2], ids.slice(10, 12))
}

section('deleteManyChunked empty table returns 0')
{
  const total = await deleteManyChunked(
    {
      findMany: async () => [],
      deleteMany: async () => {
        throw new Error('deleteMany should not run on empty')
      },
    },
    { tenantId: 't1' },
    5
  )
  assert.equal(total, 0)
}

section('chunked deleteMany keeps tenantId in where')
{
  let seenWhere: Record<string, unknown> | undefined
  const model = {
    findMany: async () => [{ id: 'a' }],
    deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
      seenWhere = where
      return { count: 1 }
    },
  }
  await deleteManyChunked(model, { tenantId: 'optick' }, 5)
  assert.equal(seenWhere?.tenantId, 'optick')
  assert.deepEqual((seenWhere?.id as { in: string[] }).in, ['a'])
}

section('operator session is excluded until the last pass')
assert.deepEqual(campaignResetOthersSessionWhere('t1'), { tenantId: 't1' })
assert.deepEqual(campaignResetOthersSessionWhere('t1', 'admin-1'), {
  tenantId: 't1',
  userId: { not: 'admin-1' },
})

section('sequential wipe commits per step; later failure reports what already landed')
{
  const ran: string[] = []
  await assert.rejects(
    () =>
      runSequentialCampaignResetSteps([
        {
          name: 'callbacks',
          label: 'callbacks',
          run: async () => {
            ran.push('callbacks')
            return 4
          },
        },
        {
          name: 'callLogs',
          label: 'llamadas',
          run: async () => {
            ran.push('callLogs')
            return 10
          },
        },
        {
          name: 'contacts',
          label: 'contactos',
          run: async () => {
            ran.push('contacts')
            throw new Error('simulated timeout')
          },
        },
        {
          name: 'companies',
          label: 'empresas',
          run: async () => {
            ran.push('companies')
            return 99
          },
        },
      ]),
    (err: unknown) => {
      assert.ok(err instanceof CampaignResetPartialError)
      assert.equal(err.failedStep, 'contacts')
      assert.deepEqual(err.completedSteps, ['callbacks', 'llamadas'])
      assert.deepEqual(err.deleted, { callbacks: 4, callLogs: 10 })
      assert.match(err.message, /contactos/)
      assert.match(err.message, /Ya se eliminó \(y no se revirtió\): callbacks, llamadas/)
      assert.match(err.message, /Recarga Clientes/)
      return true
    }
  )
  assert.deepEqual(ran, ['callbacks', 'callLogs', 'contacts'])
}

section('partial error copy lists nothing when the first step fails')
assert.equal(
  formatPartialResetError('adjuntos de tickets', []),
  'El reset de campaña se detuvo en «adjuntos de tickets». Ya se eliminó (y no se revirtió): nada todavía. Recarga Clientes antes de reintentar.'
)

section('all sequential steps succeed and return counts')
{
  const { counts, completedLabels } = await runSequentialCampaignResetSteps([
    { name: 'a', label: 'uno', run: async () => 1 },
    { name: 'b', label: 'dos', run: async () => 2 },
  ])
  assert.deepEqual(counts, { a: 1, b: 2 })
  assert.deepEqual(completedLabels, ['uno', 'dos'])
}

console.log('\nOK campaignReset tables')
}

void main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
