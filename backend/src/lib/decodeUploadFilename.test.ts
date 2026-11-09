import assert from 'node:assert/strict'
import { decodeUploadFilename } from './decodeUploadFilename'
import { assertFilenameMatchesOperator } from './operator'

function section(name: string) {
  console.log(`\n• ${name}`)
}

/** UTF-8 bytes interpreted as Latin-1 (multer/busboy). ñ → Ã + ±, written "Ã±". */
function utf8AsLatin1(value: string): string {
  return Buffer.from(value, 'utf8').toString('latin1')
}

section('pestaÃ±as → pestañas')
assert.equal(decodeUploadFilename(utf8AsLatin1('pestañas')), 'pestañas')
assert.equal(
  decodeUploadFilename('pesta' + String.fromCharCode(0xc3, 0xb1) + 'as'),
  'pestañas'
)
assert.equal(decodeUploadFilename('pesta\u00C3\u00F1as'), 'pestañas')

section('entel.xlsx unchanged')
assert.equal(decodeUploadFilename('entel.xlsx'), 'entel.xlsx')

section('already-correct pestañas.xlsx unchanged')
assert.equal(decodeUploadFilename('pestañas.xlsx'), 'pestañas.xlsx')
assert.equal(decodeUploadFilename('Base 2 pestañas_entel_Grande.xlsx'), 'Base 2 pestañas_entel_Grande.xlsx')

section('full lote name recovers ñ and still matches _entel_')
{
  const original = 'Base 2 pestañas_entel_Grande actual Richard.xlsx'
  const decoded = decodeUploadFilename(utf8AsLatin1(original))
  assert.equal(decoded, original)
  assert.doesNotThrow(() => assertFilenameMatchesOperator(decoded, 'ENTEL'))
}

section('other Spanish letters; do not double-decode')
assert.equal(decodeUploadFilename(utf8AsLatin1('José.xlsx')), 'José.xlsx')
assert.equal(decodeUploadFilename(utf8AsLatin1('Ñandú.csv')), 'Ñandú.csv')
assert.equal(decodeUploadFilename('Café.xlsx'), 'Café.xlsx')

section('empty / ascii only')
assert.equal(decodeUploadFilename(''), '')
assert.equal(decodeUploadFilename('lote_movistar_2026.xlsx'), 'lote_movistar_2026.xlsx')

console.log('\ndecodeUploadFilename tests OK')
