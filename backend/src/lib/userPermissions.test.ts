import 'dotenv/config'
import assert from 'node:assert/strict'
import { excludeArchivedAgentWhere } from './archivedAgent'
import {
  ABSOLUTE_MAX_USERS,
  DEFAULT_MAX_USERS,
  clientAdminSeatWhere,
  clientAgentSeatWhere,
  clientSeatCountWhere,
  occupiesClientSeat,
  validateMaxUsers,
} from './userPermissions'

function section(name: string) {
  console.log(`\n• ${name}`)
}

section('default cap is 25 (not raised)')
assert.equal(DEFAULT_MAX_USERS, 25)
assert.equal(ABSOLUTE_MAX_USERS, 500)

section('occupancy where: active, exclude owner and Agente borrado')
assert.equal(clientSeatCountWhere.active, true)
assert.equal(clientSeatCountWhere.isSystemOwner, false)
assert.equal(clientSeatCountWhere.isArchivedAgent, false)
assert.deepEqual(
  { isArchivedAgent: clientSeatCountWhere.isArchivedAgent },
  excludeArchivedAgentWhere,
)

section('occupancy OR includes AGENT, client ADMIN, client super admin')
const or = clientSeatCountWhere.OR
assert.ok(or.some((c) => c.role === 'AGENT'))
assert.ok(or.some((c) => c.role === 'ADMIN'))
assert.ok(or.some((c) => c.isSuperAdmin === true))

section('occupancy does not count inactive / owner / archived')
assert.notEqual(clientSeatCountWhere.active, false)
assert.notEqual(clientSeatCountWhere.isSystemOwner, true)
assert.notEqual(clientSeatCountWhere.isArchivedAgent, true)

section('agents breakdown: active AGENT only (super admin counted as admin)')
assert.equal(clientAgentSeatWhere.role, 'AGENT')
assert.equal(clientAgentSeatWhere.active, true)
assert.equal(clientAgentSeatWhere.isSystemOwner, false)
assert.equal(clientAgentSeatWhere.isSuperAdmin, false)
assert.equal(clientAgentSeatWhere.isArchivedAgent, false)

section('admins breakdown: client ADMIN + super admin, exclude owner')
assert.equal(clientAdminSeatWhere.active, true)
assert.equal(clientAdminSeatWhere.isSystemOwner, false)
assert.equal(clientAdminSeatWhere.isArchivedAgent, false)
assert.ok(clientAdminSeatWhere.OR.some((c) => c.role === 'ADMIN'))
assert.ok(clientAdminSeatWhere.OR.some((c) => c.isSuperAdmin === true))

section('occupiesClientSeat matches product rules')
assert.equal(occupiesClientSeat({ role: 'AGENT', active: true }), true)
assert.equal(occupiesClientSeat({ role: 'ADMIN', active: true, isSuperAdmin: false }), true)
assert.equal(
  occupiesClientSeat({ role: 'ADMIN', active: true, isSuperAdmin: true, isSystemOwner: false }),
  true,
)
assert.equal(
  occupiesClientSeat({ role: 'ADMIN', active: true, isSuperAdmin: true, isSystemOwner: true }),
  false,
)
assert.equal(occupiesClientSeat({ role: 'AGENT', active: false }), false)
assert.equal(occupiesClientSeat({ role: 'AGENT', active: true, isArchivedAgent: true }), false)
assert.equal(occupiesClientSeat({ role: 'ADMIN', active: true, isSystemOwner: true }), false)

section('cannot lower maxUsers below occupancy')
assert.equal(typeof validateMaxUsers(10, 12), 'string')
assert.match(validateMaxUsers(10, 12)!, /12/)
assert.equal(validateMaxUsers(11, 12), 'No se puede bajar el cupo por debajo de 12 usuarios en uso')
assert.equal(validateMaxUsers(12, 12), null)
assert.equal(validateMaxUsers(13, 12), null)
assert.equal(validateMaxUsers(25, 5), null)
assert.equal(typeof validateMaxUsers(0, 0), 'string')
assert.equal(typeof validateMaxUsers(501, 1), 'string')
assert.equal(validateMaxUsers(500, 1), null)
assert.equal(validateMaxUsers(1, 1), null)
assert.equal(validateMaxUsers(1, 2), 'No se puede bajar el cupo por debajo de 2 usuarios en uso')

console.log('\nuserPermissions tests ok')
