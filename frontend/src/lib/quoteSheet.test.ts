import assert from 'node:assert/strict'
import {
  addMixItem,
  addOtherOriginMixItem,
  applyOriginChip,
  commitMixItemLines,
  compactOriginShortLabel,
  defaultQuotePlanOrigin,
  discountedLineTotal,
  discountedUnit,
  displayBenefit,
  displayDatosBenefit,
  formatQuoteCel,
  mixHasRoaming,
  mixOfferHeader,
  mixOfferSummary,
  mobileHeadline,
  QUOTE_HEADLINE_SUFFIX_DEFAULT,
  normalizeQuoteDiscountPercent,
  quoteDiscountPercentsFromSettings,
  quotePlanApps,
  quotePlanAppsShort,
  quotePlanData,
  quotePlanInternet,
  quotePlanNameWithOrigin,
  quoteDisplayCargo,
  formatQuoteAgentName,
  QUOTE_DEFAULT_CARGO,
  planMixLayout,
  QUOTE_MIX_ORIGIN_DISPLAY_ORDER,
  sortQuoteMixRows,
  QUOTE_PLAN_DATA_LABELS,
  QUOTE_PLAN_INTERNET_LABELS,
  QUOTE_PLAN_INTERNET_LABELS_PORTABILIDAD,
  quoteTableHeaders,
  setMixItemOrigin,
  MAX_MIX_PLANS,
  MAX_MIX_ROWS,
  MAX_MIX_UNIQUE_PLANS,
  uniqueMixPlanCount,
} from './quoteSheet.ts'
import { lineTotal } from './proposalPlans.ts'

function section(name: string) {
  console.log(`\n• ${name}`)
}

section('mix header counts plans and lines')
assert.equal(mixOfferHeader(1, 1), 'Oferta · 1 plan · 1 línea')
assert.equal(mixOfferHeader(2, 5), 'Oferta · 2 planes · 5 líneas')
assert.equal(mobileHeadline(1), `1 línea móvil ${QUOTE_HEADLINE_SUFFIX_DEFAULT}`)
assert.equal(mobileHeadline(6), `6 líneas móviles ${QUOTE_HEADLINE_SUFFIX_DEFAULT}`)
assert.equal(mobileHeadline(6, ''), '6 líneas móviles.')
assert.equal(mobileHeadline(1, ''), '1 línea móvil.')
assert.equal(mobileHeadline(2, 'en plan corporativo.'), '2 líneas móviles en plan corporativo.')

section('mix summary lists each plan then the monthly total')
const firstSubtotal = lineTotal(29.9, 3)
const secondSubtotal = lineTotal(39.9, 2)
const summary = mixOfferSummary(
  [
    { name: 'MAX NEGOCIOS+ 29.9', lines: 3, priceSoles: 29.9, subtotal: firstSubtotal },
    { name: 'MAX NEGOCIOS+ 39.9', lines: 2, priceSoles: 39.9, subtotal: secondSubtotal },
  ],
  firstSubtotal + secondSubtotal
)
assert.ok(summary.includes('MAX NEGOCIOS+ 29.9 · 3 líneas'))
assert.ok(summary.includes('MAX NEGOCIOS+ 39.9 · 2 líneas'))
assert.ok(summary.includes('Total mensual:'))
assert.equal(summary.includes('Propuesta:'), false)

section('quote discount is 0, 25 or 50 and does not invent 50% at 0')
assert.equal(discountedUnit(29.9, 0), 29.9)
assert.equal(discountedUnit(29.9, 50), 14.95)
assert.equal(discountedLineTotal(29.9, 3, 0), 89.7)
assert.equal(discountedLineTotal(29.9, 3, 50), 44.85)
assert.equal(normalizeQuoteDiscountPercent(17), 0)
assert.equal(normalizeQuoteDiscountPercent(50, [25]), 0)
assert.deepEqual(quoteDiscountPercentsFromSettings([50]), [50])
assert.deepEqual(quoteDiscountPercentsFromSettings([]), [])
assert.equal(quoteTableHeaders(0).some((col) => col.key === 'dcto'), false)
assert.equal(quoteTableHeaders(50).some((col) => col.key === 'dcto'), true)
const headerCols = quoteTableHeaders(0)
const datosHeader = headerCols.find((col) => col.key === 'datos')
const internetHeader = headerCols.find((col) => col.key === 'internet')
assert.equal(datosHeader?.label, 'INTERNET')
assert.equal(internetHeader?.label, 'DATOS')
const datosHeaderIdx = headerCols.findIndex((col) => col.key === 'datos')
const internetHeaderIdx = headerCols.findIndex((col) => col.key === 'internet')
assert.ok(datosHeaderIdx >= 0 && internetHeaderIdx === datosHeaderIdx + 1)

section('catalog benefits fill internet and apps; empty stays dash')
const benefits = [
  { label: 'Min/SMS nacionales', value: 'ILIMITADO' },
  { label: 'Internet base (GB)', value: '20 GB' },
  { label: 'Full Claro (GB)', value: '45 GB' },
  { label: 'Apps incluidas', value: 'Facebook, WhatsApp.' },
]
assert.equal(quotePlanInternet(benefits), '20 GB')
assert.equal(quotePlanData(benefits), '45 GB')
assert.equal(quotePlanApps(benefits).includes('Waze'), false)
assert.equal(quotePlanAppsShort(benefits), 'Ilimitadas')
assert.equal(quotePlanAppsShort([{ label: 'Apps incluidas', value: 'Ilimitadas' }]), 'Ilimitadas')
assert.equal(displayBenefit(''), '—')
assert.equal(displayDatosBenefit('Ilimitado'), 'ILIMITADO')
assert.equal(displayDatosBenefit('ilimitado'), 'ILIMITADO')
assert.equal(displayDatosBenefit('ILIMITADO'), 'ILIMITADO')
assert.equal(displayDatosBenefit('45 GB'), '45 GB')
assert.equal(displayDatosBenefit(''), '—')
assert.equal(displayBenefit('Ilimitado'), 'Ilimitado')
assert.equal(quotePlanInternet([]), '')
assert.equal(formatQuoteCel('999111222'), '999 111 222')
assert.equal(
  mixHasRoaming([
    {
      benefits: [
        { label: 'Cobertura internacional min', value: '300 min' },
        { label: 'Cobertura internacional internet', value: '' },
        { label: 'Cobertura internacional SMS', value: '  ' },
      ],
    },
  ]),
  true
)
assert.equal(
  mixHasRoaming([
    {
      benefits: [
        { label: 'Cobertura internacional min', value: '' },
        { label: 'Cobertura internacional internet', value: '   ' },
        { label: 'Apps incluidas', value: 'WhatsApp' },
      ],
    },
  ]),
  false
)

section('updated MAX Negocios headers fill DATOS and INTERNET; old names still work')
assert.deepEqual([...QUOTE_PLAN_INTERNET_LABELS], ['Internet base (GB)', 'Lineas nueva Gbs'])
assert.deepEqual(
  [...QUOTE_PLAN_DATA_LABELS],
  [
    'Full Claro (GB)',
    'Portabilidad Full Claro (GB)',
    'Lineass nuevas Internet',
    'Portabilidad internet',
  ]
)
assert.equal(quotePlanInternet([{ label: 'Lineas nueva Gbs', value: '30 GB' }], 'nueva'), '30 GB')
assert.equal(quotePlanData([{ label: 'Lineass nuevas Internet', value: '30 GB' }], 'nueva'), '30 GB')
assert.equal(quotePlanInternet([{ label: 'Internet base (GB)', value: '20 GB' }], 'nueva'), '20 GB')
assert.equal(quotePlanData([{ label: 'Full Claro (GB)', value: '45 GB' }], 'nueva'), '45 GB')
assert.equal(
  quotePlanInternet([{ label: 'Portabilidad base (GB)', value: '52 GB' }], 'portabilidad'),
  '52 GB'
)
assert.equal(quotePlanData([{ label: 'Portabilidad internet', value: '55 GB' }], 'portabilidad'), '55 GB')
assert.equal(
  quotePlanData([{ label: 'Portabilidad Full Claro (GB)', value: '30 GB' }], 'portabilidad'),
  '30 GB'
)
assert.deepEqual([...QUOTE_PLAN_INTERNET_LABELS_PORTABILIDAD], ['Portabilidad base (GB)'])
assert.equal(
  mixHasRoaming([
    {
      benefits: [
        { label: 'Lineas nueva Gbs', value: '30 GB' },
        { label: 'Lineass nuevas Internet', value: '30 GB' },
        { label: 'Cobertura internacional min', value: '' },
      ],
    },
  ]),
  false
)

section('origin isolates DATOS and INTERNET; same plan can appear twice')
const mixed = [
  { label: 'Internet base (GB)', value: '21 GB' },
  { label: 'Full Claro (GB)', value: '41 GB' },
  { label: 'Portabilidad base (GB)', value: '52 GB' },
  { label: 'Portabilidad Full Claro (GB)', value: '62 GB' },
]
assert.equal(quotePlanInternet(mixed, 'nueva'), '21 GB')
assert.equal(quotePlanData(mixed, 'nueva'), '41 GB')
assert.equal(quotePlanInternet(mixed, 'portabilidad'), '52 GB')
assert.equal(quotePlanData(mixed, 'portabilidad'), '62 GB')
assert.equal(quotePlanInternet(mixed), '21 GB')
assert.equal(quotePlanData(mixed), '41 GB')
assert.equal(quotePlanNameWithOrigin('MAX NEGOCIOS+ 29.9', 'nueva'), 'MAX NEGOCIOS+ 29.9 · nueva')
assert.equal(quotePlanNameWithOrigin('MAX NEGOCIOS+ 29.9', 'portabilidad'), 'MAX NEGOCIOS+ 29.9 · porta')
assert.equal(quotePlanNameWithOrigin('MAX NEGOCIOS+ 29.9'), 'MAX NEGOCIOS+ 29.9')
assert.equal(quoteTableHeaders(0).find((col) => col.key === 'plan')?.headerAlign, 'center')
assert.equal(quoteDisplayCargo(''), QUOTE_DEFAULT_CARGO)
assert.equal(quoteDisplayCargo('Consultor senior'), 'Consultor senior')
assert.equal(formatQuoteAgentName('Ana Pérez'), 'Ana Pérez')
assert.equal(formatQuoteAgentName('ANA PEREZ'), 'Ana Perez')

section('default origin follows Plan actual; mix uniqueness is plan plus origin')
assert.equal(defaultQuotePlanOrigin(0), 'nueva')
assert.equal(defaultQuotePlanOrigin(3), 'portabilidad')
const first = addMixItem([], 'plan-a', 'portabilidad')
assert.equal(first.items.length, 1)
assert.equal(first.items[0].origin, 'portabilidad')
const both = addMixItem(first.items, 'plan-a', 'portabilidad')
assert.equal(both.items.length, 2)
assert.deepEqual(
  both.items.map((item) => item.origin).sort(),
  ['nueva', 'portabilidad']
)
const blocked = addMixItem(both.items, 'plan-a', 'portabilidad')
assert.equal(blocked.items.length, 2)
const switched = setMixItemOrigin(first.items, 'plan-a', 'portabilidad', 'nueva')
assert.equal(switched[0].origin, 'nueva')
const noSwap = setMixItemOrigin(both.items, 'plan-a', 'portabilidad', 'nueva')
assert.equal(noSwap, both.items)
const extra = addOtherOriginMixItem(first.items, 'plan-a')
assert.equal(extra.items.length, 2)

section('inactive origin chip adds the other row and does not duplicate')
const viaChip = applyOriginChip(first.items, 'plan-a', 'portabilidad', 'nueva')
assert.equal(viaChip.items.length, 2)
assert.deepEqual(
  viaChip.items.map((item) => item.origin).sort(),
  ['nueva', 'portabilidad']
)
const sameChip = applyOriginChip(first.items, 'plan-a', 'portabilidad', 'portabilidad')
assert.equal(sameChip.items, first.items)
assert.equal(sameChip.items.length, 1)
const noDupChip = applyOriginChip(both.items, 'plan-a', 'portabilidad', 'nueva')
assert.equal(noDupChip.items.length, 2)
assert.equal(noDupChip.items, both.items)
const noDupAdd = addOtherOriginMixItem(both.items, 'plan-a')
assert.equal(noDupAdd.items.length, 2)
assert.equal(noDupAdd.items, both.items)

section('mix cap is 16 unique plans; porta+nueva of the same plan count as one')
assert.equal(MAX_MIX_PLANS, 16)
assert.equal(MAX_MIX_UNIQUE_PLANS, 16)
assert.equal(MAX_MIX_ROWS, 32)
const sixteenUnique = Array.from({ length: MAX_MIX_UNIQUE_PLANS }, (_, index) => ({
  planId: `plan-${index}`,
  linesInput: '1',
  origin: 'portabilidad' as const,
}))
assert.equal(uniqueMixPlanCount(sixteenUnique), 16)
const extraOriginAt16 = addOtherOriginMixItem(sixteenUnique, 'plan-0')
assert.equal(extraOriginAt16.items.length, 17)
assert.equal(extraOriginAt16.notice, '')
assert.equal(uniqueMixPlanCount(extraOriginAt16.items), 16)
const viaChipAt16 = applyOriginChip(sixteenUnique, 'plan-0', 'portabilidad', 'nueva')
assert.equal(viaChipAt16.items.length, 17)
assert.equal(viaChipAt16.notice, '')
const seventeenth = addMixItem(sixteenUnique, 'plan-16', 'portabilidad')
assert.equal(seventeenth.items.length, 16)
assert.ok(seventeenth.notice.includes('16'))
assert.equal(seventeenth.notice.includes('8 filas'), false)
assert.equal(seventeenth.notice.includes('hasta 8'), false)

const sixteenBothOrigins = sixteenUnique.flatMap((item) => [
  item,
  { planId: item.planId, linesInput: '1', origin: 'nueva' as const },
])
assert.equal(sixteenBothOrigins.length, 32)
assert.equal(uniqueMixPlanCount(sixteenBothOrigins), 16)
const stillOk32 = addMixItem(sixteenBothOrigins, 'plan-0', 'portabilidad')
assert.equal(stillOk32.items.length, 32)
assert.equal(stillOk32.notice, '')
const blockedRowCap = addMixItem(sixteenBothOrigins, 'plan-99', 'nueva')
assert.equal(blockedRowCap.items.length, 32)
assert.ok(blockedRowCap.notice.includes('16'))

const eightBothOrigins = Array.from({ length: 8 }, (_, index) => [
  { planId: `plan-${index}`, linesInput: '1', origin: 'portabilidad' as const },
  { planId: `plan-${index}`, linesInput: '1', origin: 'nueva' as const },
]).flat()
assert.equal(eightBothOrigins.length, 16)
assert.equal(uniqueMixPlanCount(eightBothOrigins), 8)
const ninthUnique = addMixItem(eightBothOrigins, 'plan-8', 'portabilidad')
assert.equal(ninthUnique.items.length, 17)
assert.equal(ninthUnique.notice, '')
assert.equal(ninthUnique.notice.includes('8 filas'), false)
assert.equal(ninthUnique.notice.includes('hasta 8'), false)

section('mix preview order is cheapest first, then porta before nueva')
const unsorted = [
  { name: '49.9', priceSoles: 49.9, origin: 'nueva' as const },
  { name: '29.9', priceSoles: 29.9, origin: 'nueva' as const },
  { name: '39.9', priceSoles: 39.9, origin: 'portabilidad' as const },
  { name: '29.9', priceSoles: 29.9, origin: 'portabilidad' as const },
  { name: '49.9', priceSoles: 49.9, origin: 'portabilidad' as const },
]
assert.deepEqual(
  sortQuoteMixRows(unsorted).map((row) => `${row.priceSoles}:${row.origin}`),
  ['29.9:portabilidad', '29.9:nueva', '39.9:portabilidad', '49.9:portabilidad', '49.9:nueva']
)
assert.equal(sortQuoteMixRows([{ name: 'solo', priceSoles: 29.9 }])[0]?.origin, undefined)

section('compact both-origins layout hides duplicate chips and empty qty drops origin')
assert.equal(planMixLayout(['portabilidad']), 'single')
assert.equal(planMixLayout(['nueva']), 'single')
assert.equal(planMixLayout(['portabilidad', 'nueva']), 'dual')
assert.equal(planMixLayout(['nueva', 'portabilidad']), 'dual')
assert.deepEqual([...QUOTE_MIX_ORIGIN_DISPLAY_ORDER], ['portabilidad', 'nueva'])
assert.equal(compactOriginShortLabel('portabilidad'), 'Porta')
assert.equal(compactOriginShortLabel('nueva'), 'Nueva')
const dualItems = [
  { planId: 'plan-a', linesInput: '24', origin: 'portabilidad' as const },
  { planId: 'plan-a', linesInput: '4', origin: 'nueva' as const },
]
const emptied = commitMixItemLines(dualItems, 'plan-a', 'nueva', '')
assert.equal(emptied.length, 1)
assert.equal(emptied[0]?.origin, 'portabilidad')
assert.equal(planMixLayout(emptied.map((item) => item.origin)), 'single')
const zeroed = commitMixItemLines(dualItems, 'plan-a', 'portabilidad', '0')
assert.equal(zeroed.length, 1)
assert.equal(zeroed[0]?.origin, 'nueva')
const kept = commitMixItemLines(dualItems, 'plan-a', 'nueva', '8')
assert.equal(kept.find((item) => item.origin === 'nueva')?.linesInput, '8')
const lastGone = commitMixItemLines(emptied, 'plan-a', 'portabilidad', '   ')
assert.equal(lastGone.length, 0)

console.log('\nquote sheet mix helpers ok')
