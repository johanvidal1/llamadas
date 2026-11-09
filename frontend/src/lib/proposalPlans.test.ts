import assert from 'node:assert/strict'
import {
  buildProposalShareText,
  buildProposalSummary,
  formatCurrentPlanGroup,
  groupCurrentPlans,
  lineTotal,
  splitPortabilityBenefits,
} from './proposalPlans.ts'

function section(name: string) {
  console.log(`\n• ${name}`)
}

const pro = 'Empresa PRO 2.0 36.9'

section('same plan and rentas collapse to one row with a count')
const grouped = groupCurrentPlans([
  { plan: pro, rentaBasica: '', rentaBasicaConDesc: '' },
  { plan: `  ${pro}  `, rentaBasica: '   ', rentaBasicaConDesc: null },
  { plan: pro },
  { plan: 'Empresa MAX', rentaBasica: '20', rentaBasicaConDesc: '15' },
  { plan: pro, rentaBasica: '36.9' },
])
assert.equal(grouped.length, 3)
assert.deepEqual(grouped[0], { plan: pro, rentaBasica: '', rentaConDesc: '', count: 3 })
assert.equal(formatCurrentPlanGroup(grouped[0]), `${pro} · 3 líneas`)
assert.equal(formatCurrentPlanGroup(grouped[0]).includes('Renta'), false)
assert.equal(formatCurrentPlanGroup(grouped[1]), 'Empresa MAX · Renta 20 · c/desc 15 · 1 línea')
assert.equal(formatCurrentPlanGroup(grouped[2]), `${pro} · Renta 36.9 · 1 línea`)

section('empty renta is omitted; discount alone still prints')
assert.equal(
  formatCurrentPlanGroup({ plan: pro, rentaBasica: '', rentaConDesc: '29.9', count: 2 }),
  `${pro} · c/desc 29.9 · 2 líneas`
)
assert.equal(formatCurrentPlanGroup({ plan: '', rentaBasica: '', rentaConDesc: '', count: 1 }), '— · 1 línea')

section('no lines stay an empty group list')
assert.deepEqual(groupCurrentPlans([]), [])

section('portabilidad labels are the spoken offer; other benefits stay apart')
const split = splitPortabilityBenefits([
  { label: 'Min/SMS nacionales', value: 'ILIMITADO' },
  { label: 'Portabilidad base (GB)', value: '20 GB' },
  { label: 'Full Claro (GB)', value: '45 GB' },
  { label: 'Portabilidad Full Claro (GB)', value: '30 GB' },
])
assert.deepEqual(
  split.portability.map((benefit) => benefit.label),
  ['Portabilidad base (GB)', 'Portabilidad Full Claro (GB)']
)
assert.deepEqual(
  split.rest.map((benefit) => benefit.label),
  ['Min/SMS nacionales', 'Full Claro (GB)']
)

section('message lists each group once and keeps the portabilidad figures')
const summary = buildProposalSummary({
  contactName: 'María',
  razonSocial: 'ACME SAC',
  ruc: '20123456789',
  currentPlans: grouped,
  planName: 'MAX NEGOCIOS+ 29.9',
  price: 29.9,
  lines: 3,
  total: lineTotal(29.9, 3),
  benefits: [
    { label: 'Min/SMS nacionales', value: 'ILIMITADO' },
    { label: 'Portabilidad base (GB)', value: '20 GB' },
    { label: 'Portabilidad Full Claro (GB)', value: '30 GB' },
  ],
})
assert.equal(summary.split(pro).length - 1, 2)
assert.ok(summary.includes(`${pro} · 3 líneas`))
assert.ok(summary.includes('Portabilidad base (GB): 20 GB'))
assert.ok(summary.includes('Portabilidad Full Claro (GB): 30 GB'))
assert.equal(summary.includes('Renta —'), false)
assert.ok(summary.includes('Total mensual: S/ 89.70'))
assert.equal(lineTotal(29.9, 3), 89.7)

section('chat and mail carry a short greeting plus the link')
const shareUrl = 'http://localhost:5173/api/quotes/public/abc'
const share = buildProposalShareText('María', shareUrl)
assert.equal(share, `Estimado/a María, le compartimos su propuesta comercial: ${shareUrl}`)
assert.equal(share.includes('S/'), false)
assert.equal(share.toLowerCase().includes('portabilidad'), false)
assert.equal(share.includes('MAX'), false)
assert.equal(
  buildProposalShareText('  ', shareUrl),
  `Estimado/a cliente, le compartimos su propuesta comercial: ${shareUrl}`
)

console.log('\nOK proposalPlans')
