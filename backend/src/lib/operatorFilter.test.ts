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
assert.equal(parseImportOperator('CLARO'), 'CLARO')
assert.equal(parseImportOperator('movistar'), 'MOVISTAR')
assert.equal(parseImportOperator('todos'), null)
assert.equal(parseImportOperator(undefined), null)

section('missing operator is Claro')
assert.equal(resolveImportOperator(undefined), 'CLARO')
assert.equal(resolveImportOperator(null), 'CLARO')
assert.equal(resolveImportOperator('MOVISTAR'), 'MOVISTAR')

section('where fragments empty when unfiltered')
assert.deepEqual(companyOperatorWhere(null), {})
assert.deepEqual(contactOperatorWhere(undefined), {})
assert.deepEqual(assignmentOperatorWhere(null), {})
assert.deepEqual(callbackOperatorWhere(null), {})
assert.deepEqual(importBatchOperatorWhere(null), {})

section('where fragments when Claro / Movistar')
assert.deepEqual(companyOperatorWhere('CLARO'), { importBatch: { operator: 'CLARO' } })
assert.deepEqual(contactOperatorWhere('MOVISTAR'), {
  company: { importBatch: { operator: 'MOVISTAR' } },
})
assert.deepEqual(assignmentOperatorWhere('CLARO'), {
  contact: { company: { importBatch: { operator: 'CLARO' } } },
})
assert.deepEqual(callbackOperatorWhere('MOVISTAR'), {
  company: { importBatch: { operator: 'MOVISTAR' } },
})
assert.deepEqual(importBatchOperatorWhere('CLARO'), { operator: 'CLARO' })

section('SQL filter empty vs operator')
const emptySql = sqlCallLogCompanyOperatorFilter(null)
assert.equal(emptySql.text.includes('ImportBatch'), false)
const claroSql = sqlCallLogCompanyOperatorFilter('CLARO')
assert.ok(claroSql.text.includes('ImportBatch'))
assert.deepEqual(claroSql.values, ['CLARO'])

console.log('\noperatorFilter tests ok')
