import assert from 'node:assert/strict'
import {
  addDaysYmd,
  listLastCallChipLabel,
  listLastCallQueryParams,
  resolveListLastCallRange,
  todayYmdInAppTz,
} from './listLastCallRange.ts'

function section(name: string) {
  console.log(`\n• ${name}`)
}

const limaAfternoon = new Date('2026-10-07T18:00:00.000-05:00')
const utcPastLimaMidnight = new Date('2026-10-08T02:00:00.000Z')

section('Hoy uses America/Lima, not UTC calendar day')
assert.equal(todayYmdInAppTz(limaAfternoon), '2026-10-07')
assert.equal(todayYmdInAppTz(utcPastLimaMidnight), '2026-10-07')
assert.deepEqual(resolveListLastCallRange('today', '', '', limaAfternoon), {
  from: '2026-10-07',
  to: '2026-10-07',
})
assert.deepEqual(resolveListLastCallRange('today', '', '', utcPastLimaMidnight), {
  from: '2026-10-07',
  to: '2026-10-07',
})

section('Últimos 7 días is inclusive (today and previous 6)')
assert.equal(addDaysYmd('2026-10-07', -6), '2026-10-01')
assert.deepEqual(resolveListLastCallRange('last7', '', '', limaAfternoon), {
  from: '2026-10-01',
  to: '2026-10-07',
})
assert.deepEqual(resolveListLastCallRange('last7', '', '', new Date('2026-10-03T12:00:00.000-05:00')), {
  from: '2026-09-27',
  to: '2026-10-03',
})

section('Rango swaps inverted dates and ignores empty')
assert.equal(resolveListLastCallRange(null), null)
assert.equal(resolveListLastCallRange('range'), null)
assert.deepEqual(resolveListLastCallRange('range', '2026-10-01', '2026-10-07'), {
  from: '2026-10-01',
  to: '2026-10-07',
})
assert.deepEqual(resolveListLastCallRange('range', '2026-10-07', '2026-10-01'), {
  from: '2026-10-01',
  to: '2026-10-07',
})
assert.deepEqual(resolveListLastCallRange('range', '2026-10-07', ''), { from: '2026-10-07' })
assert.deepEqual(resolveListLastCallRange('range', '', '2026-10-07'), { to: '2026-10-07' })

section('Query params and chip labels')
assert.deepEqual(listLastCallQueryParams(null), {})
assert.deepEqual(listLastCallQueryParams({ from: '2026-10-07', to: '2026-10-07' }), {
  registeredFrom: '2026-10-07',
  registeredTo: '2026-10-07',
})
assert.equal(listLastCallChipLabel('today', '', '', limaAfternoon), 'Hoy')
assert.equal(listLastCallChipLabel('last7', '', '', limaAfternoon), 'Últimos 7 días')
assert.equal(listLastCallChipLabel('range', '2026-10-01', '2026-10-07'), '1 oct – 7 oct')
assert.equal(listLastCallChipLabel('range', '2026-10-07', '2026-10-07'), '7 oct')

console.log('\nlistLastCallRange tests passed')
