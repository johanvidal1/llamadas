import assert from 'node:assert/strict'
import { filterNonEmptyDayGroups, filterNonEmptyDaySummaries } from './clientsDayGroups.ts'

function section(name: string) {
  console.log(`\n• ${name}`)
}

section('hides day rows with 0 empresas')
assert.deepEqual(
  filterNonEmptyDayGroups([
    { key: '2026-10-28', title: 'Hoy', clients: [{ id: 'a' }] },
    { key: '2026-10-27', title: 'Ayer', clients: [] },
    { key: '2026-10-26', title: '26 oct', clients: [] },
  ]).map((g) => g.key),
  ['2026-10-28']
)

section('empty period is a single empty list, not a calendar of zeros')
assert.deepEqual(
  filterNonEmptyDayGroups([
    { key: '2026-10-28', title: 'Hoy', clients: [] },
    { key: '2026-10-01', title: '1 oct', clients: [] },
  ]),
  []
)

section('day-summary headers with count 0 are hidden')
assert.deepEqual(
  filterNonEmptyDaySummaries([
    { dayKey: '2026-10-28', count: 3 },
    { dayKey: '2026-10-27', count: 0 },
  ]),
  [{ dayKey: '2026-10-28', count: 3 }]
)

console.log('\nOK clientsDayGroups')
