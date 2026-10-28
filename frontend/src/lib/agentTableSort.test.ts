import assert from 'node:assert/strict'
import {
  agentRoleGroupRank,
  compareAgentsForSort,
  defaultAgentTableSortDir,
  lastSeenMs,
  nextAgentTableSort,
  presenceForSort,
  presenceRank,
  sortAgents,
  type SortableAgent,
} from './agentTableSort.ts'

function section(name: string) {
  console.log(`\n• ${name}`)
}

const ana: SortableAgent = { id: 'ana', name: 'Ana', assignedCompanies: 2, callsToday: 1, callbacksToday: 0 }
const beth: SortableAgent = { id: 'beth', name: 'Beth', assignedCompanies: 8, callsToday: 12, callbacksToday: 4 }
const carla: SortableAgent = { id: 'carla', name: 'Carla', assignedCompanies: 5, callsToday: 12, callbacksToday: 1 }
const diego: SortableAgent = { id: 'diego', name: 'Diego', assignedCompanies: 0, callsToday: 0, callbacksToday: 0 }

const recent = '2026-10-24T14:00:00.000Z'
const older = '2026-10-20T14:00:00.000Z'
const oldest = '2026-09-01T14:00:00.000Z'

const presence = {
  ana: { status: 'online' as const, lastSeenAt: recent },
  beth: { status: 'recent' as const, lastSeenAt: recent },
  carla: { status: 'offline' as const, lastSeenAt: older },
  diego: { status: 'offline' as const, lastSeenAt: oldest },
}

const presenceOf = (u: SortableAgent) => presence[u.id as keyof typeof presence]

section('presence rank: online < recent < offline')
assert.equal(presenceRank('online'), 0)
assert.equal(presenceRank('recent'), 1)
assert.equal(presenceRank('offline'), 2)
assert.equal(presenceRank(undefined), 2)
assert.ok(lastSeenMs(recent) > lastSeenMs(older))
assert.equal(lastSeenMs(null), 0)

section('default Estado: online → recent → offline; stale lastSeen at the bottom')
assert.deepEqual(
  sortAgents([diego, carla, beth, ana], 'status', 'asc', presenceOf).map((u) => u.id),
  ['ana', 'beth', 'carla', 'diego'],
)

section('within offline, more recent lastSeen first')
assert.ok(
  compareAgentsForSort(carla, diego, 'status', 'asc', presenceOf) < 0,
  'Carla (offline, newer lastSeen) before Diego (offline, stale)',
)

section('missing presence sorts as offline with no lastSeen (bottom)')
assert.deepEqual(
  sortAgents([diego, ana, { id: 'ghost', name: 'Ghost' }], 'status', 'asc', (u) =>
    u.id === 'ghost' ? undefined : presenceOf(u),
  ).map((u) => u.id),
  ['ana', 'diego', 'ghost'],
)

section('presenceForSort uses newest session lastSeenAt')
assert.deepEqual(
  presenceForSort({
    status: 'recent',
    sessions: [{ lastSeenAt: older }, { lastSeenAt: recent }],
  }),
  { status: 'recent', lastSeenAt: recent },
)

section('callsToday first click = more first; name tie-break')
assert.deepEqual(
  sortAgents([ana, beth, carla], 'callsToday', 'desc').map((u) => u.id),
  ['beth', 'carla', 'ana'],
)
assert.equal(defaultAgentTableSortDir('callsToday'), 'desc')
assert.equal(defaultAgentTableSortDir('callbacksToday'), 'desc')
assert.equal(defaultAgentTableSortDir('assignedCompanies'), 'desc')

section('Usuario first click A–Z then Z–A')
assert.equal(defaultAgentTableSortDir('name'), 'asc')
assert.deepEqual(
  sortAgents([carla, ana, beth], 'name', 'asc').map((u) => u.id),
  ['ana', 'beth', 'carla'],
)
assert.deepEqual(
  sortAgents([carla, ana, beth], 'name', 'desc').map((u) => u.id),
  ['carla', 'beth', 'ana'],
)

section('toggle keeps column and flips direction; new column uses default')
assert.deepEqual(nextAgentTableSort('status', 'asc', 'status'), { key: 'status', dir: 'desc' })
assert.deepEqual(nextAgentTableSort('status', 'asc', 'callsToday'), { key: 'callsToday', dir: 'desc' })
assert.deepEqual(nextAgentTableSort('callsToday', 'desc', 'name'), { key: 'name', dir: 'asc' })
assert.deepEqual(nextAgentTableSort('status', 'asc', 'role'), { key: 'role', dir: 'asc' })
assert.deepEqual(nextAgentTableSort('role', 'asc', 'role'), { key: 'role', dir: 'desc' })

section('Rol: Admin group rank 0, Agent rank 1; Superadmin without owner is Admin')
assert.equal(agentRoleGroupRank({ id: 'a', name: 'A', role: 'ADMIN' }), 0)
assert.equal(agentRoleGroupRank({ id: 's', name: 'S', role: 'AGENT', isSuperAdmin: true }), 0)
assert.equal(agentRoleGroupRank({ id: 'g', name: 'G', role: 'AGENT' }), 1)
assert.equal(defaultAgentTableSortDir('role'), 'asc')

const owner: SortableAgent = { id: 'own', name: 'Zeta Owner', role: 'ADMIN', isSystemOwner: true }
const adminAna: SortableAgent = { id: 'admA', name: 'Ana Adm', role: 'ADMIN' }
const adminBruno: SortableAgent = { id: 'admB', name: 'Bruno', role: 'ADMIN' }
const superSergio: SortableAgent = {
  id: 'super',
  name: 'Sergio',
  role: 'ADMIN',
  isSuperAdmin: true,
}
const agentAda: SortableAgent = { id: 'agA', name: 'Ada', role: 'AGENT' }
const agentZara: SortableAgent = { id: 'agZ', name: 'Zara', role: 'AGENT' }
const roleUsers = [agentZara, owner, adminBruno, agentAda, superSergio, adminAna]

section('Rol first click: owner pinned, then Admin A–Z, then Agent A–Z')
assert.deepEqual(
  sortAgents(roleUsers, 'role', 'asc').map((u) => u.id),
  ['own', 'admA', 'admB', 'super', 'agA', 'agZ'],
)

section('Rol second click: owner still first; Agent group then Admin; names A–Z inside groups')
assert.deepEqual(
  sortAgents(roleUsers, 'role', 'desc').map((u) => u.id),
  ['own', 'agA', 'agZ', 'admA', 'admB', 'super'],
)

section('Rol: owner is not flipped relative to groups')
assert.ok(compareAgentsForSort(owner, adminAna, 'role', 'desc') < 0, 'owner before admin even in desc')
assert.ok(compareAgentsForSort(owner, agentAda, 'role', 'desc') < 0, 'owner before agent even in desc')
assert.ok(compareAgentsForSort(agentAda, adminAna, 'role', 'desc') < 0, 'agents before admins in desc')

console.log('\nagentTableSort tests passed')
