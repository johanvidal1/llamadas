import assert from 'node:assert/strict'
import {
  LAST_CLIENT_ADMIN_DELETE_TOOLTIP,
  adminDeleteRequiresStepUp,
  countCountedClientAdmins,
  isCountedClientAdmin,
  isLastCountedClientAdmin,
} from './clientAdminGuard.ts'

function section(name: string) {
  console.log(`\n• ${name}`)
}

const owner = { role: 'ADMIN', isSuperAdmin: true, isSystemOwner: true, active: true }
const lastAdmin = { role: 'ADMIN', isSuperAdmin: false, isSystemOwner: false, active: true }
const secondAdmin = { role: 'ADMIN', isSuperAdmin: false, isSystemOwner: false, active: true }
const agent = { role: 'AGENT', isSuperAdmin: false, isSystemOwner: false, active: true }

section('owner is not counted as client admin')
assert.equal(isCountedClientAdmin(owner), false)
assert.equal(isCountedClientAdmin(lastAdmin), true)
assert.equal(isCountedClientAdmin(agent), false)
assert.equal(countCountedClientAdmins([owner, lastAdmin, agent]), 1)

section('last remaining client admin: trash disabled')
assert.equal(isLastCountedClientAdmin(lastAdmin, [owner, lastAdmin, agent]), true)
assert.equal(isLastCountedClientAdmin(lastAdmin, [owner, lastAdmin, secondAdmin, agent]), false)
assert.equal(isLastCountedClientAdmin(agent, [lastAdmin, agent]), false)
assert.equal(LAST_CLIENT_ADMIN_DELETE_TOOLTIP, 'No se puede eliminar al último administrador del espacio')

section('agent delete: no password; admin delete: password')
assert.equal(adminDeleteRequiresStepUp(agent), false)
assert.equal(adminDeleteRequiresStepUp(lastAdmin), true)
assert.equal(adminDeleteRequiresStepUp(owner), false)

console.log('\nclientAdminGuard tests ok')
