import assert from 'node:assert/strict'
import {
  defaultQuotePlanOrigin,
  mixHasRoaming,
  QUOTE_PLAN_DATA_LABELS,
  QUOTE_PLAN_INTERNET_LABELS,
  QUOTE_PLAN_INTERNET_LABELS_PORTABILIDAD,
  displayBenefit,
  displayDatosBenefit,
  quotePlanData,
  quotePlanInternet,
  quotePlanNameWithOrigin,
  sortQuoteMixRows,
} from './quoteDiscount'

function section(name: string) {
  console.log(`\n• ${name}`)
}

section('alias lists keep old MAX Negocios names and the updated GB headers')
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

section('old labels fill INTERNET and DATOS')
assert.equal(quotePlanInternet([{ label: 'Internet base (GB)', value: '20 GB' }], 'nueva'), '20 GB')
assert.equal(quotePlanData([{ label: 'Full Claro (GB)', value: '45 GB' }], 'nueva'), '45 GB')
assert.equal(
  quotePlanData([{ label: 'Portabilidad Full Claro (GB)', value: '30 GB' }], 'portabilidad'),
  '30 GB'
)
assert.deepEqual([...QUOTE_PLAN_INTERNET_LABELS_PORTABILIDAD], ['Portabilidad base (GB)'])

section('updated MAX Negocios labels fill INTERNET and DATOS')
assert.equal(quotePlanInternet([{ label: 'Lineas nueva Gbs', value: '30 GB' }], 'nueva'), '30 GB')
assert.equal(
  quotePlanData([{ label: 'Lineass nuevas Internet', value: '30 GB' }], 'nueva'),
  '30 GB'
)
assert.equal(quotePlanData([{ label: 'Portabilidad internet', value: '55 GB' }], 'portabilidad'), '55 GB')
assert.equal(
  quotePlanData([{ label: 'Portabilidad  internet', value: '55 GB' }], 'portabilidad'),
  '55 GB'
)
assert.equal(
  quotePlanInternet([{ label: 'Portabilidad base (GB)', value: '52 GB' }], 'portabilidad'),
  '52 GB'
)

section('DATOS and INTERNET stay inside the chosen origin group')
const mixed = [
  { label: 'Full Claro (GB)', value: '45 GB' },
  { label: 'Portabilidad Full Claro (GB)', value: '30 GB' },
  { label: 'Lineass nuevas Internet', value: '31 GB' },
  { label: 'Portabilidad internet', value: '55 GB' },
  { label: 'Internet base (GB)', value: '20 GB' },
  { label: 'Portabilidad base (GB)', value: '52 GB' },
]
assert.equal(quotePlanData(mixed, 'nueva'), '45 GB')
assert.equal(quotePlanInternet(mixed, 'nueva'), '20 GB')
assert.equal(quotePlanData(mixed, 'portabilidad'), '30 GB')
assert.equal(quotePlanInternet(mixed, 'portabilidad'), '52 GB')
assert.equal(quotePlanData(mixed), '45 GB')
assert.equal(quotePlanInternet(mixed), '20 GB')
assert.equal(defaultQuotePlanOrigin(0), 'nueva')
assert.equal(defaultQuotePlanOrigin(2), 'portabilidad')
assert.equal(quotePlanNameWithOrigin('MAX NEGOCIOS+ 29.9', 'portabilidad'), 'MAX NEGOCIOS+ 29.9 · porta')

section('mixHasRoaming still keys off cobertura headers only')
assert.equal(
  mixHasRoaming([
    {
      benefits: [
        { label: 'Lineas nueva Gbs', value: '30 GB' },
        { label: 'Lineass nuevas Internet', value: '30 GB' },
        { label: 'Portabilidad internet', value: '55 GB' },
        { label: 'Cobertura internacional min', value: '30 min' },
      ],
    },
  ]),
  true
)
assert.equal(
  mixHasRoaming([
    {
      benefits: [
        { label: 'Lineas nueva Gbs', value: '30 GB' },
        { label: 'Lineass nuevas Internet', value: '30 GB' },
        { label: 'Portabilidad internet', value: '55 GB' },
        { label: 'Cobertura internacional min', value: '' },
        { label: 'Cobertura internacional internet', value: '  ' },
        { label: 'Cobertura internacional SMS', value: '' },
      ],
    },
  ]),
  false
)

section('DATOS cell uppercases ilimitado; INTERNET stays as catalog')
assert.equal(displayDatosBenefit('Ilimitado'), 'ILIMITADO')
assert.equal(displayDatosBenefit('ilimitado'), 'ILIMITADO')
assert.equal(displayDatosBenefit('ILIMITADO'), 'ILIMITADO')
assert.equal(displayDatosBenefit('45 GB'), '45 GB')
assert.equal(displayBenefit('Ilimitado'), 'Ilimitado')
assert.equal(quotePlanInternet([{ label: 'Internet base (GB)', value: 'Ilimitado' }], 'nueva'), 'Ilimitado')
assert.equal(quotePlanData([{ label: 'Full Claro (GB)', value: 'Ilimitado' }], 'nueva'), 'Ilimitado')
assert.equal(
  displayDatosBenefit(quotePlanData([{ label: 'Full Claro (GB)', value: 'Ilimitado' }], 'nueva')),
  'ILIMITADO'
)

section('mix PDF order is cheapest first, then porta before nueva')
assert.deepEqual(
  sortQuoteMixRows([
    { name: '49.9', priceSoles: 49.9, origin: 'nueva' as const },
    { name: '29.9', priceSoles: 29.9, origin: 'nueva' as const },
    { name: '39.9', priceSoles: 39.9, origin: 'portabilidad' as const },
    { name: '29.9', priceSoles: 29.9, origin: 'portabilidad' as const },
    { name: '49.9', priceSoles: 49.9, origin: 'portabilidad' as const },
  ]).map((row) => `${row.priceSoles}:${row.origin}`),
  ['29.9:portabilidad', '29.9:nueva', '39.9:portabilidad', '49.9:portabilidad', '49.9:nueva']
)

console.log('\nquote discount catalog aliases ok')
