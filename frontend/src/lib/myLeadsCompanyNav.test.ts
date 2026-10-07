import assert from 'node:assert/strict'
import {
  companyIndexById,
  companySummaryHasAgentLog,
  nextCompanyIdAfter,
  nextCompanyIndexAfter,
  nextPendingCompanyIdAfter,
  nextPendingCompanyIndexAfter,
  resolveIndexForCompanyId,
  resolveOpenDetailFromList,
  resolveStayOnSavedCompany,
  shouldApplySavedCompanyPin,
  type CompanyNavItem,
} from './myLeadsCompanyNav.ts'

function section(name: string) {
  console.log(`\n• ${name}`)
}

const r0: CompanyNavItem = { id: 'r0', ruc: '100' }
const r1: CompanyNavItem = { id: 'r1', ruc: '101' }
const r2: CompanyNavItem = { id: 'r2', ruc: '102' }
const r3: CompanyNavItem = { id: 'r3', ruc: '103' }
const x: CompanyNavItem = { id: 'x', ruc: '200' }
const y: CompanyNavItem = { id: 'y', ruc: '201' }
const z: CompanyNavItem = { id: 'z', ruc: '202' }

section('siguiente empresa is the next distinct id (5/20 → 6/20)')
const queue20 = [r0, r1, r2, r3, x, y, z]
assert.equal(nextCompanyIndexAfter(queue20, 'x'), 5)
assert.equal(nextCompanyIdAfter(queue20, 'x'), 'y')
assert.equal(queue20[nextCompanyIndexAfter(queue20, 'x')!]?.id, 'y')

section('index+1 after registered-first reorder can land on the same RUC; id lookup does not')
const preSave = [r0, r1, r2, r3, x, y, z]
const nextId = nextCompanyIdAfter(preSave, 'x')
assert.equal(nextId, 'y')
// x becomes registered and jumps to the front; stale currentIndex+1 would still be x’s old slot.
const postSave = [x, r0, r1, r2, r3, y, z]
assert.equal(postSave[4]?.id, 'r3')
assert.equal(companyIndexById(postSave, nextId!), 5)
assert.notEqual(postSave[4]?.id, 'y')

section('skip duplicate rows / same RUC (contact-looking next)')
const dupes: CompanyNavItem[] = [
  { id: 'c1', ruc: '11111111111' },
  { id: 'c1-contact-2', ruc: '11111111111' },
  { id: 'c1-again', ruc: '11111111111' },
  { id: 'c2', ruc: '22222222222' },
]
assert.equal(nextCompanyIndexAfter(dupes, 'c1'), 3)
assert.equal(nextCompanyIdAfter(dupes, 'c1'), 'c2')

section('last distinct RUC returns -1')
assert.equal(nextCompanyIndexAfter(queue20, 'z'), -1)
assert.equal(nextCompanyIdAfter(queue20, 'z'), null)
assert.equal(nextCompanyIndexAfter(dupes, 'c2'), -1)
assert.equal(nextCompanyIndexAfter(queue20, 'missing'), -1)
assert.equal(nextCompanyIndexAfter([], 'x'), -1)

section('siguiente pendiente skips companies with an agent log')
const mixed: CompanyNavItem[] = [
  { id: 'a', ruc: '1', hasAgentLog: true },
  { id: 'b', ruc: '2', hasAgentLog: true },
  { id: 'c', ruc: '3', hasAgentLog: false },
  { id: 'd', ruc: '4', hasAgentLog: false },
]
assert.equal(
  nextPendingCompanyIdAfter(mixed, 'a', (item) => !companySummaryHasAgentLog(item)),
  'c'
)
assert.equal(
  nextPendingCompanyIndexAfter(mixed, 'c', (item) => !companySummaryHasAgentLog(item)),
  3
)
assert.equal(
  nextPendingCompanyIndexAfter(mixed, 'd', (item) => !companySummaryHasAgentLog(item)),
  -1
)

section('siguiente pendiente skips same RUC even if that row has no log')
const pendingDupes: CompanyNavItem[] = [
  { id: 'p1', ruc: '555', hasAgentLog: false },
  { id: 'p1b', ruc: '555', hasAgentLog: false },
  { id: 'p2', ruc: '666', hasAgentLog: false },
]
assert.equal(
  nextPendingCompanyIdAfter(pendingDupes, 'p1', (item) => !companySummaryHasAgentLog(item)),
  'p2'
)

section('companySummaryHasAgentLog reads list counts')
assert.equal(companySummaryHasAgentLog({ id: 'n', ruc: '1' }), false)
assert.equal(companySummaryHasAgentLog({ id: 'n', ruc: '1', callLogCount: 1 }), true)
assert.equal(
  companySummaryHasAgentLog({
    id: 'n',
    ruc: '1',
    contacts: [{ _count: { callLogs: 2 } }],
  }),
  true
)

const frain: CompanyNavItem = { id: 'frain', ruc: '20609388499' }
const daniel: CompanyNavItem = { id: 'daniel', ruc: '20614370425' }
const visibleAfterDepurado: CompanyNavItem[] = Array.from({ length: 386 }, (_, i) =>
  i === 328 ? frain : { id: `q${i}`, ruc: String(i) }
)

section('Lista click of depurado pins that company, not leftover Detalle index 328')
assert.equal(visibleAfterDepurado[328]?.id, 'frain')
const depuradoPlan = resolveOpenDetailFromList(daniel, visibleAfterDepurado)
assert.equal(depuradoPlan.kind, 'outsideQueue')
assert.equal(depuradoPlan.kind === 'outsideQueue' ? depuradoPlan.company.id : '', 'daniel')
assert.equal(depuradoPlan.kind === 'outsideQueue' ? depuradoPlan.company.ruc : '', '20614370425')
assert.notEqual(companyIndexById(visibleAfterDepurado, 'daniel'), 328)

section('in-queue Lista click still opens that company by id')
const inQueuePlan = resolveOpenDetailFromList(frain, visibleAfterDepurado)
assert.equal(inQueuePlan.kind, 'inQueue')
assert.equal(inQueuePlan.kind === 'inQueue' ? inQueuePlan.companyId : '', 'frain')
assert.equal(companyIndexById(visibleAfterDepurado, 'frain'), 328)

section('stale in-queue click re-resolves by id after cola refresh (328 becomes Frain)')
const staleNav = visibleAfterDepurado.map((c, i) => (i === 328 ? daniel : c))
assert.equal(resolveOpenDetailFromList(daniel, staleNav).kind, 'inQueue')
assert.equal(companyIndexById(staleNav, 'daniel'), 328)
const afterRefresh = resolveIndexForCompanyId(daniel.id, visibleAfterDepurado)
assert.equal(afterRefresh.kind, 'pinOutside')
assert.equal(afterRefresh.kind === 'pinOutside' ? afterRefresh.index : -1, 386)
assert.notEqual(visibleAfterDepurado[328]?.id, daniel.id)

section('savedCompanyPinRef does not apply after a Lista click')
assert.equal(shouldApplySavedCompanyPin('next-pending', 'daniel'), false)
assert.equal(shouldApplySavedCompanyPin('daniel', null), true)
assert.equal(shouldApplySavedCompanyPin(null, 'daniel'), false)
assert.equal(shouldApplySavedCompanyPin(null, null), false)

section('stay on saved company when 2× No contesta leaves the working cola')
assert.deepEqual(resolveStayOnSavedCompany('daniel', visibleAfterDepurado), { kind: 'pinOutside' })
assert.deepEqual(resolveStayOnSavedCompany('frain', visibleAfterDepurado), {
  kind: 'inQueue',
  index: 328,
})

console.log('\nmyLeadsCompanyNav tests passed')
