import assert from 'node:assert/strict'
import {
  contactIdxForStayAfterSave,
  prefillFromContactLogs,
  shouldSkipCompanyLatestContactResolve,
  sortContactsStable,
  type PrefillCallLog,
} from './myLeadsContactPrefill.ts'

function section(name: string) {
  console.log(`\n• ${name}`)
}

const selectable = (d: string) => d !== 'AUDIT_ONLY'

const mario = { id: 'mario' }
const lucia = { id: 'lucia' }
const contacts = [mario, lucia]

section('stay-after-save skips company-latest resolve only when a contact is pinned')
assert.equal(shouldSkipCompanyLatestContactResolve(true, 'lucia'), true)
assert.equal(shouldSkipCompanyLatestContactResolve(true, null), false)
assert.equal(shouldSkipCompanyLatestContactResolve(false, 'lucia'), false)

section('contactIdxForStayAfterSave forces the saved tab, not the first contact')
assert.equal(contactIdxForStayAfterSave(contacts, 'lucia', 0), 1)
assert.equal(contactIdxForStayAfterSave(contacts, 'mario', 1), 0)
assert.equal(contactIdxForStayAfterSave(contacts, 'missing', 0), 0)
assert.equal(contactIdxForStayAfterSave(contacts, null, 1), 1)

section('prefillFromContactLogs uses that contact’s latest selectable log')
const logs: PrefillCallLog[] = [
  {
    id: 'old-lucia',
    agentId: 'agent',
    calledAt: '2026-10-07T10:00:00.000Z',
    disposition: 'NO_CONTESTA',
    notes: 'lucia old',
    contact: { id: 'lucia' },
  },
  {
    id: 'mario-latest',
    agentId: 'agent',
    calledAt: '2026-10-07T12:00:00.000Z',
    disposition: 'SIN_LLEGADA',
    notes: 'mario latest — would steal the tab if company-sorted',
    contact: { id: 'mario' },
  },
  {
    id: 'lucia-latest',
    agentId: 'agent',
    calledAt: '2026-10-07T11:00:00.000Z',
    disposition: 'VOLVER_A_LLAMAR',
    notes: 'lucia latest',
    contact: { id: 'lucia' },
  },
  {
    id: 'other-agent',
    agentId: 'other',
    calledAt: '2026-10-07T13:00:00.000Z',
    disposition: 'NO_CONTESTA',
    notes: 'not mine',
    contact: { id: 'lucia' },
  },
]

const luciaPrefill = prefillFromContactLogs(logs, 'lucia', 'agent', selectable)
assert.equal(luciaPrefill?.id, 'lucia-latest')
assert.equal(luciaPrefill?.notes, 'lucia latest')

const marioPrefill = prefillFromContactLogs(logs, 'mario', 'agent', selectable)
assert.equal(marioPrefill?.id, 'mario-latest')

section('tab with no agent log returns null (empty Respuesta, not the other tab)')
assert.equal(prefillFromContactLogs(logs, 'unknown', 'agent', selectable), null)

section('pinned just-saved log wins even if a newer row exists')
const pinned = prefillFromContactLogs(logs, 'lucia', 'agent', selectable, 'old-lucia')
assert.equal(pinned?.id, 'old-lucia')

section('sortContactsStable is createdAt then id — not registered / has-log')
const tied = [
  { id: 'c', createdAt: '2026-10-07T12:00:00.000Z', hasLog: true },
  { id: 'a', createdAt: '2026-10-07T12:00:00.000Z', hasLog: false },
  { id: 'b', createdAt: '2026-10-07T12:00:00.000Z', hasLog: true },
]
assert.deepEqual(
  sortContactsStable(tied).map((c) => c.id),
  ['a', 'b', 'c']
)

const mixedTime = [
  { id: 'z', createdAt: '2026-10-07T12:00:02.000Z' },
  { id: 'm', createdAt: '2026-10-07T12:00:00.000Z' },
  { id: 'n', createdAt: '2026-10-07T12:00:01.000Z' },
]
assert.deepEqual(
  sortContactsStable(mixedTime).map((c) => c.id),
  ['m', 'n', 'z']
)

const registeredLastWouldWin = [
  { id: 'lucia', createdAt: '2026-10-07T12:00:00.000Z', registered: true },
  { id: 'mario', createdAt: '2026-10-07T12:00:00.000Z', registered: false },
]
assert.deepEqual(
  sortContactsStable(registeredLastWouldWin).map((c) => c.id),
  ['lucia', 'mario']
)

const original = [...tied]
sortContactsStable(tied)
assert.deepEqual(
  tied.map((c) => c.id),
  original.map((c) => c.id)
)

console.log('\nmyLeadsContactPrefill tests passed')
