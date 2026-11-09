import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import {
  OFFER_PLAN_SHEET_NAME,
  parseOfferPlanWorkbook,
  priceFromPlanName,
} from './offerPlanWorkbook'

function section(name: string) {
  console.log(`\n• ${name}`)
}

const REAL_FILE = 'C:\\Users\\franc\\Downloads\\Planes_MAX_Negocios_Editables.xlsx'

const FIXTURE_NAMES = [
  'MAX NEGOCIOS+ 29.9',
  'MAX NEGOCIOS+ 39.9',
  'MAX NEGOCIOS+ 49.9',
  'MAX NEGOCIOS+ 55.9',
  'MAX ILIMITADO + 69.9',
  'MAX ILIMITADO + 79.9',
  'MAX ILIMITADO + 95.9',
  'MAX ILIMITADO + 109.9',
  'MAX ILIMITADO + 125',
  'MAX ILIMITADO + 159.9',
  'MAX ILIMITADO + 189.9',
  'MAX ILIMITADO + 289.9',
]

function fixtureBuffer(): Buffer {
  const header = [
    'Precio (S/)',
    'Min/SMS nacionales',
    'Full Claro (GB)',
    'Apps incluidas',
  ]
  const rows: (string | number)[][] = [
    ['MAX NEGOCIOS +', '', '', ''],
    ['', '', '', ''],
    ['Datos transcritos de las imágenes originales', '', '', ''],
    header,
    ...FIXTURE_NAMES.map((name, i) => [name, 'ILIMITADO', `${30 + i} GB`, 'WhatsApp']),
  ]
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, OFFER_PLAN_SHEET_NAME)
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ignorar']]), 'Otra')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

function assertCatalog(plans: ReturnType<typeof parseOfferPlanWorkbook>, source: string) {
  assert.equal(plans.length, 12, `${source}: expected 12 plans`)
  assert.equal(plans[0].name, 'MAX NEGOCIOS+ 29.9')
  assert.equal(plans[0].priceSoles, 29.9)
  assert.equal(plans.find((p) => p.name.includes('125'))?.priceSoles, 125)
  assert.equal(plans[plans.length - 1].name, 'MAX ILIMITADO + 289.9')
  assert.equal(plans[plans.length - 1].priceSoles, 289.9)
  assert.ok(
    plans[0].benefits.some((b) => b.label.includes('Full Claro')),
    `${source}: keep Excel header "Full Claro"`
  )
  assert.equal(
    plans.some((p) => /transcritos|MAX NEGOCIOS \+/.test(p.name)),
    false,
    `${source}: title rows must be skipped`
  )
  plans.forEach((plan, index) => assert.equal(plan.sortOrder, index))
}

section('price embedded in the plan name')
assert.equal(priceFromPlanName('MAX NEGOCIOS+ 29.9'), 29.9)
assert.equal(priceFromPlanName('MAX ILIMITADO + 125'), 125)
assert.equal(priceFromPlanName('MAX ILIMITADO + 289.9'), 289.9)
assert.equal(priceFromPlanName('MAX NEGOCIOS +'), null)

section('fixture: 12 plans, skip titles, keep Full Claro header')
const fixture = parseOfferPlanWorkbook(fixtureBuffer())
assertCatalog(fixture, 'fixture')
assert.equal(fixture[0].colors.title, null)
assert.equal(fixture[0].colors.header, null)
assert.deepEqual(fixture[0].colors.cells, {})

if (existsSync(REAL_FILE)) {
  section('real Planes_MAX_Negocios_Editables.xlsx')
  assertCatalog(parseOfferPlanWorkbook(readFileSync(REAL_FILE)), 'xlsx')
  const real = parseOfferPlanWorkbook(readFileSync(REAL_FILE))
  const fullClaro = real[0].benefits.find((b) => b.label === 'Full Claro (GB)')
  assert.equal(fullClaro?.value, '45 GB')
  assert.deepEqual(
    real[0].benefits.map((benefit) => benefit.label),
    [
      'Min/SMS nacionales',
      'Min internacionales',
      'Internet base (GB)',
      'Full Claro (GB)',
      'Portabilidad base (GB)',
      'Portabilidad Full Claro (GB)',
      'Apps incluidas',
      'Cobertura internacional min',
      'Cobertura internacional internet',
      'Cobertura internacional SMS',
    ]
  )
  assert.equal(real[0].colors.title, '#B9280B')
  assert.equal(real[0].colors.header, '#182333')
  assert.equal(real[0].colors.headerText, '#FFFFFF')
  assert.equal(real[0].colors.priceHeader, 'Precio (S/)')
  assert.equal(real[0].colors.row, null)
  assert.equal(real[0].colors.cells['Precio (S/)'], '#B9280B')
  assert.equal(real[0].colors.cells['Full Claro (GB)'], '#FFF0E9')
  assert.equal(real[0].colors.cells['Portabilidad Full Claro (GB)'], '#FFF0E9')
  assert.equal(real[0].colors.cells['Portabilidad base (GB)'], undefined)
  const last = real[real.length - 1]
  assert.equal(last.colors.cells['Precio (S/)'], '#B9280B')
  assert.equal(last.colors.cells['Full Claro (GB)'], '#FFF0E9')
  assert.equal(last.colors.row, null)
} else {
  section('real xlsx not on this machine; fixture covered 29.9 and 289.9')
}

console.log('\noffer plan workbook ok')
