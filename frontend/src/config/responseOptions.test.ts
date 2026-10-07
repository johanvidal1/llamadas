import assert from 'node:assert/strict'
import {
  isActiveNoContesta,
  isDepuradoNoContesta,
  isHiddenFromAgentNav,
  isNoContestaDisposition,
  MAX_NO_ANSWER_ATTEMPTS,
} from './responseOptions'

function section(name: string) {
  console.log(`\n• ${name}`)
}

section('MAX_NO_ANSWER_ATTEMPTS is 2')
assert.equal(MAX_NO_ANSWER_ATTEMPTS, 2)

section('depurado counts only No contesta')
assert.equal(isNoContestaDisposition('NO_CONTESTA'), true)
assert.equal(isDepuradoNoContesta('NO_CONTESTA', 2), true)
assert.equal(isDepuradoNoContesta('NO_CONTESTA', 1), false)
assert.equal(isDepuradoNoContesta('SIN_LLEGADA_DECISOR', 2), false)
assert.equal(isActiveNoContesta('NO_CONTESTA', 1), true)
assert.equal(isActiveNoContesta('NO_CONTESTA', 2), false)

section('isHiddenFromAgentNav uses No-contesta count for depurado')
assert.equal(isHiddenFromAgentNav('NO_CONTESTA', 1), false)
assert.equal(isHiddenFromAgentNav('NO_CONTESTA', 2), true)
assert.equal(isHiddenFromAgentNav('SIN_LLEGADA_DECISOR', 2), false)
assert.equal(isHiddenFromAgentNav('NO_INTERESADO', 0), true)

console.log('\nAll responseOptions tests passed.')
