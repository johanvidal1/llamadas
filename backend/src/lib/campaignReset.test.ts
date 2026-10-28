import assert from 'node:assert/strict'
import {
  CAMPAIGN_RESET_FK_DELETE_ORDER,
  CAMPAIGN_RESET_KEPT_TABLES,
  CAMPAIGN_RESET_USER_FIELDS_CLEARED,
  CAMPAIGN_RESET_WIPED_TABLES,
} from './campaignResetTables'

function section(name: string) {
  console.log(`\n• ${name}`)
}

function indexOf(table: string): number {
  return (CAMPAIGN_RESET_FK_DELETE_ORDER as readonly string[]).indexOf(table)
}

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

console.log('\nOK campaignReset tables')
