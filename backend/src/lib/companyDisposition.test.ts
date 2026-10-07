import assert from 'node:assert/strict'
import {
  isActiveNoContesta,
  isDepuradoNoContesta,
  isNoContestaDisposition,
  MAX_NO_ANSWER_ATTEMPTS,
  sortClientsByCreatedAtQueue,
  sortClientsByRegisteredCreatedAtQueue,
} from './companyDisposition'

function section(name: string) {
  console.log(`\n• ${name}`)
}

section('MAX_NO_ANSWER_ATTEMPTS is 2')
assert.equal(MAX_NO_ANSWER_ATTEMPTS, 2)

section('isNoContestaDisposition')
assert.equal(isNoContestaDisposition('NO_CONTESTA'), true)
assert.equal(isNoContestaDisposition('NO_ANSWER'), true)
assert.equal(isNoContestaDisposition('SIN_LLEGADA_DECISOR'), false)
assert.equal(isNoContestaDisposition(null), false)

section('depurado uses No-contesta count, not all logs')
assert.equal(isDepuradoNoContesta('NO_CONTESTA', 2), true)
assert.equal(isDepuradoNoContesta('NO_ANSWER', 2), true)
assert.equal(isDepuradoNoContesta('NO_CONTESTA', 1), false)
assert.equal(isDepuradoNoContesta('NO_CONTESTA', 0), false)
assert.equal(isDepuradoNoContesta('SIN_LLEGADA_DECISOR', 2), false)
assert.equal(isDepuradoNoContesta('NO_INTERESADO', 5), false)
assert.equal(isDepuradoNoContesta(null, 2), false)

section('1 No contesta stays active (Detalle + cola No contesta)')
assert.equal(isActiveNoContesta('NO_CONTESTA', 1), true)
assert.equal(isActiveNoContesta('NO_ANSWER', 1), true)
assert.equal(isActiveNoContesta('NO_CONTESTA', 2), false)
assert.equal(isActiveNoContesta('SIN_LLEGADA_DECISOR', 1), false)

section('Sin llegada then one No contesta is not depurado')
assert.equal(isDepuradoNoContesta('NO_CONTESTA', 1), false)
assert.equal(isActiveNoContesta('NO_CONTESTA', 1), true)

section('stable createdAt order: first disposition keeps relative asiento')
const t0 = new Date('2026-01-01T00:00:00Z')
const t1 = new Date('2026-01-02T00:00:00Z')
const t2 = new Date('2026-01-03T00:00:00Z')
const pendingPile = [
  { ruc: '111', createdAt: t0, lastDisposition: null, lastCalledAt: null, _count: { callLogs: 0 } },
  { ruc: '222', createdAt: t1, lastDisposition: null, lastCalledAt: null, _count: { callLogs: 0 } },
  { ruc: '333', createdAt: t2, lastDisposition: null, lastCalledAt: null, _count: { callLogs: 0 } },
]
assert.deepEqual(
  sortClientsByCreatedAtQueue(pendingPile).map((c) => c.ruc),
  ['111', '222', '333']
)
const afterInteresado = pendingPile.map((c) =>
  c.ruc === '222'
    ? { ...c, lastDisposition: 'INTERESADO', lastCalledAt: new Date('2026-10-07T12:00:00Z'), _count: { callLogs: 1 } }
    : c
)
assert.deepEqual(
  sortClientsByCreatedAtQueue(afterInteresado).map((c) => c.ruc),
  ['111', '222', '333']
)
assert.deepEqual(
  sortClientsByRegisteredCreatedAtQueue(afterInteresado).map((c) => c.ruc),
  ['222', '111', '333']
)

section('stable createdAt order: same timestamp ties on RUC')
const sameTs = new Date('2026-02-01T00:00:00Z')
const tied = [
  { ruc: '206', createdAt: sameTs },
  { ruc: '101', createdAt: sameTs },
  { ruc: '155', createdAt: sameTs },
]
assert.deepEqual(
  sortClientsByCreatedAtQueue(tied).map((c) => c.ruc),
  ['101', '155', '206']
)

console.log('\nAll companyDisposition tests passed.')
