import assert from 'node:assert/strict'
import {
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
  quotePlanInternet,
  quoteTableHeaders,
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
  { label: 'Apps incluidas', value: 'Facebook, WhatsApp.' },
]
assert.equal(quotePlanInternet(benefits), '20 GB')
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

console.log('\nquote sheet mix helpers ok')
