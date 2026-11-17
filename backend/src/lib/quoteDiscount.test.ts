import assert from 'node:assert/strict'
import {
  mixHasRoaming,
  QUOTE_PLAN_DATA_LABELS,
  QUOTE_PLAN_INTERNET_LABELS,
  quotePlanData,
  quotePlanInternet,
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
assert.equal(quotePlanInternet([{ label: 'Internet base (GB)', value: '20 GB' }]), '20 GB')
assert.equal(quotePlanData([{ label: 'Full Claro (GB)', value: '45 GB' }]), '45 GB')
assert.equal(
  quotePlanData([{ label: 'Portabilidad Full Claro (GB)', value: '30 GB' }]),
  '30 GB'
)

section('updated MAX Negocios labels fill INTERNET and DATOS')
assert.equal(quotePlanInternet([{ label: 'Lineas nueva Gbs', value: '30 GB' }]), '30 GB')
assert.equal(
  quotePlanData([{ label: 'Lineass nuevas Internet', value: '30 GB' }]),
  '30 GB'
)
assert.equal(quotePlanData([{ label: 'Portabilidad internet', value: '55 GB' }]), '55 GB')
assert.equal(
  quotePlanData([{ label: 'Portabilidad  internet', value: '55 GB' }]),
  '55 GB'
)

section('Full Claro still wins over Portabilidad when both exist')
assert.equal(
  quotePlanData([
    { label: 'Full Claro (GB)', value: '45 GB' },
    { label: 'Portabilidad Full Claro (GB)', value: '30 GB' },
  ]),
  '45 GB'
)
assert.equal(
  quotePlanData([
    { label: 'Lineass nuevas Internet', value: '30 GB' },
    { label: 'Portabilidad internet', value: '55 GB' },
  ]),
  '30 GB'
)

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

console.log('\nquote discount catalog aliases ok')
