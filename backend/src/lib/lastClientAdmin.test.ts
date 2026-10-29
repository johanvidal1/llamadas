import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import {
  LAST_CLIENT_ADMIN_DEACTIVATE_ERROR,
  LAST_CLIENT_ADMIN_DELETE_ERROR,
  ADMIN_DELETE_PASSWORD_INVALID,
  ADMIN_DELETE_PASSWORD_REQUIRED,
  adminDeleteRequiresStepUp,
  evaluateAdminDeleteStepUp,
  evaluateDeactivateTarget,
  evaluateDeleteTarget,
  invalidAdminDeletePassword,
  isCountedClientAdmin,
  wouldLeaveZeroClientAdmins,
} from './lastClientAdmin'

function section(name: string) {
  console.log(`\n• ${name}`)
}

const lastAdmin = {
  id: 'admin-1',
  role: 'ADMIN',
  isSuperAdmin: false,
  isSystemOwner: false,
  isArchivedAgent: false,
  active: true,
}

const secondAdmin = {
  id: 'admin-2',
  role: 'ADMIN',
  isSuperAdmin: false,
  isSystemOwner: false,
  isArchivedAgent: false,
  active: true,
}

const owner = {
  id: 'owner-1',
  role: 'ADMIN',
  isSuperAdmin: true,
  isSystemOwner: true,
  isArchivedAgent: false,
  active: true,
}

const agent = {
  id: 'agent-1',
  role: 'AGENT',
  isSuperAdmin: false,
  isSystemOwner: false,
  isArchivedAgent: false,
  active: true,
}

const superAdmin = {
  id: 'sa-1',
  role: 'ADMIN',
  isSuperAdmin: true,
  isSystemOwner: false,
  isArchivedAgent: false,
  active: true,
}

const inactiveAdmin = {
  id: 'admin-off',
  role: 'ADMIN',
  isSuperAdmin: false,
  isSystemOwner: false,
  isArchivedAgent: false,
  active: false,
}

section('count: role ADMIN / isSuperAdmin, exclude owner, archived, inactive')
assert.equal(isCountedClientAdmin(lastAdmin), true)
assert.equal(isCountedClientAdmin(secondAdmin), true)
assert.equal(isCountedClientAdmin(superAdmin), true)
assert.equal(isCountedClientAdmin(owner), false)
assert.equal(isCountedClientAdmin(agent), false)
assert.equal(isCountedClientAdmin(inactiveAdmin), false)
assert.equal(isCountedClientAdmin({ ...lastAdmin, isArchivedAgent: true }), false)
assert.equal(
  isCountedClientAdmin({ role: 'AGENT', isSuperAdmin: true, isSystemOwner: false, active: true }),
  true,
)

section('owner is not a client admin for the last-admin lock')
assert.equal(wouldLeaveZeroClientAdmins(owner, 0), false)
assert.equal(wouldLeaveZeroClientAdmins(lastAdmin, 0), true)
assert.equal(wouldLeaveZeroClientAdmins(lastAdmin, 1), false)
assert.equal(wouldLeaveZeroClientAdmins(agent, 0), false)

section('last admin cannot be deleted (409); second admin can')
const lastBlocked = evaluateDeleteTarget({
  target: lastAdmin,
  otherClientAdminCount: 0,
  password: 'x',
  actorPasswordMatches: true,
})
assert.equal(lastBlocked.action, 'block')
if (lastBlocked.action === 'block') {
  assert.equal(lastBlocked.status, 409)
  assert.equal(lastBlocked.error, LAST_CLIENT_ADMIN_DELETE_ERROR)
}

const secondAllowed = evaluateDeleteTarget({
  target: secondAdmin,
  otherClientAdminCount: 1,
  password: 'Secret123!',
  actorPasswordMatches: true,
})
assert.equal(secondAllowed.action, 'allow')
if (secondAllowed.action === 'allow') {
  assert.equal(secondAllowed.requirePassword, true)
}

section('owner present does not count: sole client admin is still last')
const ownerPlusOne = evaluateDeleteTarget({
  target: lastAdmin,
  otherClientAdminCount: 0,
})
assert.equal(ownerPlusOne.action, 'block')
if (ownerPlusOne.action === 'block') {
  assert.equal(ownerPlusOne.status, 409)
}

section('agent delete: no password required')
assert.equal(adminDeleteRequiresStepUp(agent), false)
const agentDelete = evaluateDeleteTarget({
  target: agent,
  otherClientAdminCount: 0,
})
assert.equal(agentDelete.action, 'allow')
if (agentDelete.action === 'allow') {
  assert.equal(agentDelete.requirePassword, false)
}

section('admin delete without password → 403')
assert.equal(adminDeleteRequiresStepUp(lastAdmin), true)
assert.equal(adminDeleteRequiresStepUp(superAdmin), true)
assert.equal(adminDeleteRequiresStepUp(owner), false)
const missing = evaluateDeleteTarget({
  target: secondAdmin,
  otherClientAdminCount: 1,
})
assert.equal(missing.action, 'block')
if (missing.action === 'block') {
  assert.ok(missing.status === 401 || missing.status === 403)
  assert.equal(missing.status, 403)
  assert.equal(missing.code, ADMIN_DELETE_PASSWORD_REQUIRED)
}
const emptyPassword = evaluateAdminDeleteStepUp('')
assert.equal(emptyPassword.ok, false)
if (!emptyPassword.ok) {
  assert.ok(emptyPassword.status === 401 || emptyPassword.status === 403)
}

section('wrong password rejected (401) + bcrypt of the logged-in user')
const wrong = evaluateDeleteTarget({
  target: secondAdmin,
  otherClientAdminCount: 1,
  password: 'nope',
  actorPasswordMatches: false,
})
assert.equal(wrong.action, 'block')
if (wrong.action === 'block') {
  assert.equal(wrong.status, 401)
  assert.equal(wrong.code, ADMIN_DELETE_PASSWORD_INVALID)
}
const invalid = invalidAdminDeletePassword()
assert.equal(invalid.status, 401)
assert.equal(invalid.code, ADMIN_DELETE_PASSWORD_INVALID)

section('bcrypt: actor password must match before delete')
const hash = bcrypt.hashSync('Secret123!', 4)
assert.equal(bcrypt.compareSync('Secret123!', hash), true)
assert.equal(bcrypt.compareSync('wrong', hash), false)

section('deactivate last admin is also blocked; second admin can deactivate')
const deactLast = evaluateDeactivateTarget(lastAdmin, 0)
assert.equal(deactLast.action, 'block')
if (deactLast.action === 'block') {
  assert.equal(deactLast.status, 409)
  assert.equal(deactLast.error, LAST_CLIENT_ADMIN_DEACTIVATE_ERROR)
}
const deactSecond = evaluateDeactivateTarget(secondAdmin, 1)
assert.equal(deactSecond.action, 'allow')
const deactAgent = evaluateDeactivateTarget(agent, 0)
assert.equal(deactAgent.action, 'allow')
const deactOwner = evaluateDeactivateTarget(owner, 0)
assert.equal(deactOwner.action, 'allow')

section('inactive admin is not the last *active* client admin')
assert.equal(wouldLeaveZeroClientAdmins(inactiveAdmin, 0), false)
const deleteInactive = evaluateDeleteTarget({
  target: inactiveAdmin,
  otherClientAdminCount: 0,
  password: 'Secret123!',
  actorPasswordMatches: true,
})
assert.equal(deleteInactive.action, 'allow')
if (deleteInactive.action === 'allow') {
  assert.equal(deleteInactive.requirePassword, true)
}

console.log('\nlastClientAdmin tests ok')
