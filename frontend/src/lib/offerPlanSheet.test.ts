import assert from 'node:assert/strict'
import {
  catalogBenefitLabels,
  catalogCellFill,
  catalogCellStyle,
  catalogCellValue,
  catalogHeaderStyle,
  catalogHeaders,
  catalogPngFilename,
  catalogPriceHeader,
  inkOnStoredFill,
  slugAscii,
  type OfferPlanSheetRow,
} from './offerPlanSheet.ts'

function section(name: string) {
  console.log(`\n• ${name}`)
}

const NEW_HEADERS = [
  'Min/SMS nacionales',
  'Min internacionales',
  'Lineas nueva Gbs',
  'Lineass nuevas Internet',
  'Portabilidad base (GB)',
  'Portabilidad internet',
  'Apps incluidas',
  'Cobertura internacional min',
  'Cobertura internacional internet',
  'Cobertura internacional SMS',
]

function plan(partial: Partial<OfferPlanSheetRow> & { name: string }): OfferPlanSheetRow {
  return {
    benefits: [],
    ...partial,
  }
}

section('headers keep Excel labels; no INTERNET/DATOS remap')
const updated: OfferPlanSheetRow[] = [
  plan({
    name: 'MAX NEGOCIOS+ 29.9',
    colors: {
      title: null,
      header: '#182333',
      headerText: '#FFFFFF',
      priceHeader: 'Precio (S/)',
      row: null,
      cells: { 'Precio (S/)': '#B9280B', 'Lineas nueva Gbs': '#FFF0E9' },
    },
    benefits: NEW_HEADERS.map((label, i) => ({
      label,
      value: i === 2 ? '30 GB' : i === 3 ? '' : 'x',
    })),
  }),
  plan({
    name: 'MAX ILIMITADO + 289.9',
    benefits: NEW_HEADERS.map((label) => ({ label, value: 'y' })),
  }),
]
assert.deepEqual(catalogHeaders(updated), ['Precio (S/)', ...NEW_HEADERS])
assert.equal(catalogHeaders(updated).includes('INTERNET'), false)
assert.equal(catalogHeaders(updated).includes('DATOS'), false)
assert.equal(catalogPriceHeader(updated), 'Precio (S/)')
assert.deepEqual(catalogBenefitLabels(updated), NEW_HEADERS)

section('empty cells stay blank')
assert.equal(catalogCellValue(updated[0], 'Lineass nuevas Internet', 'Precio (S/)'), '')
assert.equal(catalogCellValue(updated[0], 'Precio (S/)', 'Precio (S/)'), 'MAX NEGOCIOS+ 29.9')
assert.equal(catalogCellValue(updated[0], 'Lineas nueva Gbs', 'Precio (S/)'), '30 GB')
assert.equal(catalogCellValue(updated[0], 'missing', 'Precio (S/)'), '')

section('stored fills only; missing stays null')
assert.equal(catalogCellFill(updated[0].colors, 'Precio (S/)'), '#B9280B')
assert.equal(catalogCellFill(updated[0].colors, 'Lineas nueva Gbs'), '#FFF0E9')
assert.equal(catalogCellFill(updated[0].colors, 'Apps incluidas'), null)
assert.equal(catalogCellFill(null, 'Precio (S/)'), null)
assert.deepEqual(catalogHeaderStyle(updated), { fill: '#182333', ink: '#FFFFFF' })
assert.deepEqual(catalogHeaderStyle([{ name: 'x', benefits: [] }]), { fill: null, ink: null })
assert.deepEqual(catalogCellStyle(updated[0], 'Precio (S/)'), { fill: '#B9280B', ink: '#FFFFFF' })
assert.deepEqual(catalogCellStyle(updated[0], 'Lineas nueva Gbs'), { fill: '#FFF0E9', ink: '#182333' })
assert.deepEqual(catalogCellStyle(updated[0], 'Apps incluidas'), { fill: null, ink: null })
assert.equal(inkOnStoredFill(null), null)
assert.equal(inkOnStoredFill('#182333'), '#FFFFFF')

section('row fill is used when the cell has no own fill')
const rowPainted = plan({
  name: 'MAX NEGOCIOS+ 39.9',
  colors: {
    title: null,
    header: null,
    headerText: '#182333',
    priceHeader: 'Precio (S/)',
    row: '#FFF7F2',
    cells: {},
  },
  benefits: [{ label: 'Apps incluidas', value: 'WhatsApp' }],
})
assert.equal(catalogCellFill(rowPainted.colors, 'Apps incluidas'), '#FFF7F2')
assert.equal(catalogPriceHeader([{ name: 'solo', benefits: [] }]), 'Precio (S/)')

section('PNG filename is ASCII')
assert.equal(slugAscii('Planes MAX Negocios noviembre'), 'planes-max-negocios-noviembre')
assert.equal(slugAscii('  '), 'catalogo')
assert.equal(
  catalogPngFilename('Planes MAX Negocios', new Date(2026, 10, 23)),
  'Planes-planes-max-negocios-2026-11-23.png'
)

console.log('\noffer plan sheet ok')
