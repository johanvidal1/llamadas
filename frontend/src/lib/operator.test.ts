import assert from 'node:assert/strict'
import {
  detectFilenameOperator,
  filenameOperatorError,
  filenameOperatorTokens,
  isAgentOperatorChromePath,
  MY_LEADS_OPERATOR_KEY,
  operatorChipClassName,
  operatorFilterFromQuery,
  parseImportOperator,
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
assert.equal(detectFilenameOperator('plantillaentel.xlsx'), null)
assert.equal(detectFilenameOperator('claro.xlsx'), null)
assert.equal(detectFilenameOperator('entel.xlsx'), 'ENTEL')
assert.ok(filenameOperatorError('aclaracion.xlsx', 'ENTEL'))
assert.ok(filenameOperatorError('lote_claro.xlsx', 'ENTEL'))
assert.ok(filenameOperatorError('PLANTILLA_movistar_20260928.xlsx', 'ENTEL')?.includes('Movistar'))
assert.equal(filenameOperatorError('lote_entel.xlsx', 'ENTEL'), null)
assert.ok(filenameOperatorError('base.xlsx', null))
assert.deepEqual(filenameOperatorTokens('20260913-1348_nocontestadodep_claro_Richard.xlsx'), [])
assert.deepEqual(
  filenameOperatorTokens('20260913-1348_nocontestadodep_entel_Richard.xlsx'),
  ['ENTEL']
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
writeStoredMyLeadsOperator('ENTEL')
assert.equal(readStoredMyLeadsOperator(), 'ENTEL')
memory.set(MY_LEADS_OPERATOR_KEY, 'CLARO')
assert.equal(readStoredMyLeadsOperator(), 'ENTEL')
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: prevSession,
})

section('historical / missing operator is Entel; CLARO reads as ENTEL')
assert.equal(resolveImportOperator(undefined), 'ENTEL')
assert.equal(resolveImportOperator(null), 'ENTEL')
assert.equal(resolveImportOperator('CLARO'), 'ENTEL')
assert.equal(resolveImportOperator('ENTEL'), 'ENTEL')
assert.equal(resolveImportOperator('MOVISTAR'), 'MOVISTAR')
assert.equal(resolveImportOperator('movistar'), 'ENTEL')
assert.equal(parseImportOperator('CLARO'), 'ENTEL')
assert.equal(parseImportOperator('ENTEL'), 'ENTEL')
assert.equal(parseImportOperator('MOVISTAR'), 'MOVISTAR')
assert.ok(operatorChipClassName('ENTEL').includes('blue'))
assert.ok(operatorChipClassName('MOVISTAR').includes('green'))

section('query param helper')
assert.equal(operatorFilterFromQuery('CLARO'), 'ENTEL')
assert.equal(operatorFilterFromQuery('ENTEL'), 'ENTEL')
assert.equal(operatorFilterFromQuery('MOVISTAR'), 'MOVISTAR')
assert.equal(operatorFilterFromQuery('todos'), '')
assert.equal(operatorFilterFromQuery(null), '')
assert.equal(operatorFilterFromQuery(undefined), '')

console.log('\nAll frontend operator token tests passed.')
