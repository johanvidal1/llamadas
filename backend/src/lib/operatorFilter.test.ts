import assert from 'node:assert/strict'
import {
  assignmentOperatorWhere,
  callbackOperatorWhere,
  companyOperatorWhere,
  contactOperatorWhere,
  importBatchOperatorWhere,
  parseImportOperator,
  resolveImportOperator,
  sqlCallLogCompanyOperatorFilter,
} from './operator'

function section(name: string) {
  console.log(`\n• ${name}`)
}

section('parseImportOperator')
assert.equal(parseImportOperator('ENTEL'), 'ENTEL')
assert.equal(parseImportOperator('CLARO'), 'ENTEL')
assert.equal(parseImportOperator('movistar'), 'MOVISTAR')
assert.equal(parseImportOperator('todos'), null)
assert.equal(parseImportOperator(undefined), null)

section('missing operator is Entel')
assert.equal(resolveImportOperator(undefined), 'ENTEL')
assert.equal(resolveImportOperator(null), 'ENTEL')
assert.equal(resolveImportOperator('CLARO'), 'ENTEL')
assert.equal(resolveImportOperator('MOVISTAR'), 'MOVISTAR')

section('where fragments empty when unfiltered')
assert.deepEqual(companyOperatorWhere(null), {})
assert.deepEqual(contactOperatorWhere(undefined), {})
assert.deepEqual(assignmentOperatorWhere(null), {})
assert.deepEqual(callbackOperatorWhere(null), {})
assert.deepEqual(importBatchOperatorWhere(null), {})

section('where fragments when Entel / Movistar')
assert.deepEqual(companyOperatorWhere('ENTEL'), { importBatch: { operator: 'ENTEL' } })
assert.deepEqual(contactOperatorWhere('MOVISTAR'), {
  company: { importBatch: { operator: 'MOVISTAR' } },
})
assert.deepEqual(assignmentOperatorWhere('ENTEL'), {
  contact: { company: { importBatch: { operator: 'ENTEL' } } },
})
assert.deepEqual(callbackOperatorWhere('MOVISTAR'), {
  company: { importBatch: { operator: 'MOVISTAR' } },
})
assert.deepEqual(importBatchOperatorWhere('ENTEL'), { operator: 'ENTEL' })

section('SQL filter empty vs operator')
const emptySql = sqlCallLogCompanyOperatorFilter(null)
assert.equal(emptySql.text.includes('ImportBatch'), false)
const entelSql = sqlCallLogCompanyOperatorFilter('ENTEL')
assert.ok(entelSql.text.includes('ImportBatch'))
assert.deepEqual(entelSql.values, ['ENTEL'])

console.log('\noperatorFilter tests ok')
