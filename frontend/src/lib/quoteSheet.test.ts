import assert from 'node:assert/strict'
import {
  addMixItem,
  addOtherOriginMixItem,
  defaultQuotePlanOrigin,
  discountedLineTotal,
  discountedUnit,
  displayBenefit,
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
  QUOTE_PLAN_DATA_LABELS,
  QUOTE_PLAN_INTERNET_LABELS,
  QUOTE_PLAN_INTERNET_LABELS_PORTABILIDAD,
  quoteTableHeaders,
  setMixItemOrigin,
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

console.log('\nquote sheet mix helpers ok')
