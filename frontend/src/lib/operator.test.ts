import assert from 'node:assert/strict'
import {
  detectFilenameOperator,
  filenameOperatorError,
  filenameOperatorTokens,
  isAgentOperatorChromePath,
  MY_LEADS_OPERATOR_KEY,
  operatorChipClassName,
  operatorFilterFromQuery,
  readStoredMyLeadsOperator,
  resolveImportOperator,
  writeStoredMyLeadsOperator,
} from './operator.ts'

function section(name: string) {
  console.log(`\n• ${name}`)
}

section('filename token is a segment, not a substring')
assert.deepEqual(filenameOperatorTokens('PLANTILLA_movistar_20260928_124441.xlsx'), ['MOVISTAR'])
assert.equal(detectFilenameOperator('aclaracion.xlsx'), null)
assert.equal(detectFilenameOperator('plantillaclaro.xlsx'), null)
assert.equal(detectFilenameOperator('claro.xlsx'), 'CLARO')
assert.ok(filenameOperatorError('aclaracion.xlsx', 'CLARO'))
assert.ok(filenameOperatorError('PLANTILLA_movistar_20260928.xlsx', 'CLARO')?.includes('Movistar'))
assert.equal(filenameOperatorError('lote_claro.xlsx', 'CLARO'), null)
assert.ok(filenameOperatorError('base.xlsx', null))
assert.deepEqual(
  filenameOperatorTokens('20260913-1348_nocontestadodep_claro_Richard.xlsx'),
  ['CLARO']
)
assert.deepEqual(
  filenameOperatorTokens('20260913-1348_nocontestadodep_movistar_Carlos.xlsx'),
  ['MOVISTAR']
)
assert.equal(detectFilenameOperator('20260913-1348_nocontestadodep.zip'), null)

section('working operator storage + calling-context paths')
assert.equal(isAgentOperatorChromePath('/my-leads'), true)
assert.equal(isAgentOperatorChromePath('/my-leads/foo'), true)
assert.equal(isAgentOperatorChromePath('/callbacks'), true)
assert.equal(isAgentOperatorChromePath('/callbacks/x'), true)
assert.equal(isAgentOperatorChromePath('/'), false)
assert.equal(isAgentOperatorChromePath('/imports'), false)
assert.equal(MY_LEADS_OPERATOR_KEY, 'myLeadsOperator')

const memory = new Map<string, string>()
const prevSession = globalThis.sessionStorage
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, String(value))
    },
    removeItem: (key: string) => {
      memory.delete(key)
    },
    clear: () => memory.clear(),
    key: () => null,
    get length() {
      return memory.size
    },
  },
})
assert.equal(readStoredMyLeadsOperator(), null)
writeStoredMyLeadsOperator('MOVISTAR')
assert.equal(readStoredMyLeadsOperator(), 'MOVISTAR')
writeStoredMyLeadsOperator('CLARO')
assert.equal(readStoredMyLeadsOperator(), 'CLARO')
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: prevSession,
})

section('historical / missing operator is Claro')
assert.equal(resolveImportOperator(undefined), 'CLARO')
assert.equal(resolveImportOperator(null), 'CLARO')
assert.equal(resolveImportOperator('CLARO'), 'CLARO')
assert.equal(resolveImportOperator('MOVISTAR'), 'MOVISTAR')
assert.equal(resolveImportOperator('movistar'), 'CLARO')
assert.ok(operatorChipClassName('CLARO').includes('red'))
assert.ok(operatorChipClassName('MOVISTAR').includes('green'))

section('query param helper')
assert.equal(operatorFilterFromQuery('CLARO'), 'CLARO')
assert.equal(operatorFilterFromQuery('MOVISTAR'), 'MOVISTAR')
assert.equal(operatorFilterFromQuery('todos'), '')
assert.equal(operatorFilterFromQuery(null), '')
assert.equal(operatorFilterFromQuery(undefined), '')

console.log('\nAll frontend operator token tests passed.')
