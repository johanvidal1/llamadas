import assert from 'node:assert/strict'
import {
  isActiveNoContesta,
  isDepuradoNoContesta,
  isNoContestaDisposition,
  MAX_NO_ANSWER_ATTEMPTS,
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

console.log('\nAll companyDisposition tests passed.')
