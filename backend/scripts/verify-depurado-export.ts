import 'dotenv/config'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../src/lib/prisma'
import { OPTICK_TENANT_ID } from '../src/lib/tenant'
import { runWithTenant } from '../src/lib/tenantContext'
import {
  executeDepuradoExport,
  findDepuradoCompaniesForAgent,
  previewDepuradoExport,
  toImportContactosRows,
  toImportDetallePlanRows,
  toImportMobileRows,
} from '../src/lib/depuradoExport'
import { countUnassignedCompanies } from '../src/lib/assignmentOrder'
import { parseExcel } from '../src/lib/parseFile'
import { writeImportWorkbookBuffer } from '../src/lib/importWorkbook'
import { isDepuradoNoContesta } from '../src/lib/companyDisposition'

const MARKER = 'depurado-export-fixture'
const RICHARD_EMAIL = 'depurado.export.richard@local.test'
const MARIA_EMAIL = 'depurado.export.maria@local.test'
const ADMIN_EMAIL = 'depurado.export.admin@local.test'

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: [RICHARD_EMAIL, MARIA_EMAIL, ADMIN_EMAIL] } },
    select: { id: true },
  })
  const userIds = users.map((u) => u.id)
  const batches = await prisma.importBatch.findMany({
    where: { filename: { startsWith: MARKER } },
    select: { id: true },
  })
  const batchIds = batches.map((b) => b.id)
  const companies = await prisma.company.findMany({
    where: { importBatchId: { in: batchIds.length ? batchIds : ['__none__'] } },
    select: { id: true },
  })
  const companyIds = companies.map((c) => c.id)
  const contacts = await prisma.contact.findMany({
    where: { companyId: { in: companyIds.length ? companyIds : ['__none__'] } },
    select: { id: true },
  })
  const contactIds = contacts.map((c) => c.id)

  if (contactIds.length) {
    await prisma.assignment.deleteMany({ where: { contactId: { in: contactIds } } })
  }
  if (companyIds.length) {
    await prisma.callLog.deleteMany({ where: { companyId: { in: companyIds } } })
    await prisma.callback.deleteMany({ where: { companyId: { in: companyIds } } })
    await prisma.mobileLine.deleteMany({ where: { companyId: { in: companyIds } } })
  }
  if (contactIds.length) {
    await prisma.contact.deleteMany({ where: { id: { in: contactIds } } })
  }
  if (companyIds.length) {
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } })
  }
  if (batchIds.length) {
    await prisma.assignmentRun.deleteMany({ where: { importBatchId: { in: batchIds } } })
    await prisma.importBatch.deleteMany({ where: { id: { in: batchIds } } })
  }
  if (userIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
  }
}

async function seed() {
  await cleanup()
  const password = await bcrypt.hash('Fixture123!', 12)
  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN', active: true },
    select: { id: true },
  })
  if (!adminUser) throw new Error('Need an existing admin to own the fixture batch')

  const richard = await prisma.user.create({
    data: {
      tenantId: OPTICK_TENANT_ID,
      name: 'Richard Fixture',
      email: RICHARD_EMAIL,
      password,
      role: 'AGENT',
      active: true,
    },
  })
  const maria = await prisma.user.create({
    data: {
      tenantId: OPTICK_TENANT_ID,
      name: 'Maria Fixture',
      email: MARIA_EMAIL,
      password,
      role: 'AGENT',
      active: true,
    },
  })
  const admin = await prisma.user.create({
    data: {
      tenantId: OPTICK_TENANT_ID,
      name: 'Admin Fixture',
      email: ADMIN_EMAIL,
      password,
      role: 'ADMIN',
      active: true,
    },
  })

  const batch = await prisma.importBatch.create({
    data: {
      tenantId: OPTICK_TENANT_ID,
      filename: `${MARKER}.xlsx`,
      displayName: 'Fixture depurado export',
      totalRecords: 5,
      importedById: adminUser.id,
    },
  })

  async function company(opts: {
    ruc: string
    name: string
    contacts: { nombre: string; agentId?: string }[]
    logs: { agentId: string; disposition: string }[]
    recovered?: boolean
    mobile?: boolean
  }) {
    const created = await prisma.company.create({
      data: {
        tenantId: OPTICK_TENANT_ID,
        ruc: opts.ruc,
        razonSocial: opts.name,
        importStatus: 'OK',
        status: 'IN_PROGRESS',
        importBatchId: batch.id,
        recoveredAt: opts.recovered ? new Date() : null,
        recoveredFromAgentId: opts.recovered ? richard.id : null,
        contacts: {
          create: opts.contacts.map((c) => ({
            tenantId: OPTICK_TENANT_ID,
            nombre: c.nombre,
            telefono: '987654321',
            email: `${c.nombre.toLowerCase()}@fixture.test`,
          })),
        },
      },
      include: { contacts: true },
    })
    for (let i = 0; i < opts.contacts.length; i++) {
      const agentId = opts.contacts[i].agentId
      if (!agentId) continue
      await prisma.assignment.create({
        data: {
          tenantId: OPTICK_TENANT_ID,
          contactId: created.contacts[i].id,
          agentId,
        },
      })
    }
    for (const log of opts.logs) {
      const contact = created.contacts.find((_, idx) => opts.contacts[idx].agentId === log.agentId)
      await prisma.callLog.create({
        data: {
          tenantId: OPTICK_TENANT_ID,
          companyId: created.id,
          contactId: contact?.id ?? created.contacts[0].id,
          agentId: log.agentId,
          disposition: log.disposition,
        },
      })
    }
    if (opts.mobile) {
      await prisma.mobileLine.create({
        data: {
          tenantId: OPTICK_TENANT_ID,
          companyId: created.id,
          ruc: opts.ruc,
          numeroTelefono: '999111222',
          estadoLinea: 'Activa',
          plan: 'Max',
          rentaBasica: '69.90',
          rentaBasicaConDesc: '49.90',
          importBatchId: batch.id,
        },
      })
    }
    return created
  }

  const depurado = await company({
    ruc: '20111111111',
    name: 'Depurado Solo Richard',
    contacts: [
      { nombre: 'Ana', agentId: richard.id },
      { nombre: 'Luis', agentId: richard.id },
    ],
    logs: [
      { agentId: richard.id, disposition: 'NO_CONTESTA' },
      { agentId: richard.id, disposition: 'NO_CONTESTA' },
    ],
    mobile: true,
  })
  await company({
    ruc: '20222222222',
    name: 'Activo No Contesta',
    contacts: [{ nombre: 'Pedro', agentId: richard.id }],
    logs: [{ agentId: richard.id, disposition: 'NO_CONTESTA' }],
  })
  await company({
    ruc: '20333333333',
    name: 'No Interesado',
    contacts: [{ nombre: 'Carla', agentId: richard.id }],
    logs: [
      { agentId: richard.id, disposition: 'NO_INTERESADO' },
      { agentId: richard.id, disposition: 'NO_INTERESADO' },
    ],
  })
  const shared = await company({
    ruc: '20444444444',
    name: 'Compartida',
    contacts: [
      { nombre: 'RichardContact', agentId: richard.id },
      { nombre: 'MariaContact', agentId: maria.id },
    ],
    logs: [
      { agentId: richard.id, disposition: 'NO_CONTESTA' },
      { agentId: richard.id, disposition: 'NO_CONTESTA' },
      { agentId: maria.id, disposition: 'NO_CONTESTA' },
      { agentId: maria.id, disposition: 'NO_CONTESTA' },
    ],
  })
  await company({
    ruc: '20777777777',
    name: 'Depurado Solo Maria',
    contacts: [{ nombre: 'Sofia', agentId: maria.id }],
    logs: [
      { agentId: maria.id, disposition: 'NO_ANSWER' },
      { agentId: maria.id, disposition: 'NO_ANSWER' },
    ],
  })
  await company({
    ruc: '20555555555',
    name: 'Ya recuperada',
    contacts: [{ nombre: 'Old', agentId: richard.id }],
    logs: [
      { agentId: richard.id, disposition: 'NO_CONTESTA' },
      { agentId: richard.id, disposition: 'NO_CONTESTA' },
    ],
    recovered: true,
  })
  const leftover = await prisma.company.create({
    data: {
      tenantId: OPTICK_TENANT_ID,
      ruc: '20666666666',
      razonSocial: 'Sobrante no recuperada',
      importBatchId: batch.id,
      contacts: {
        create: {
          tenantId: OPTICK_TENANT_ID,
          nombre: 'Libre',
          telefono: '911111111',
        },
      },
    },
  })

  return { richard, maria, admin, batch, depurado, shared, leftover }
}

async function main() {
  const fixture = await seed()
  const unassignedBefore = await countUnassignedCompanies(fixture.batch.id)
  if (unassignedBefore.companies !== 1) {
    throw new Error(`Expected 1 leftover unassigned, got ${unassignedBefore.companies}`)
  }

  const preview = await previewDepuradoExport([fixture.richard.id])
  if (preview.agents.length !== 1 || preview.agents[0].companyCount !== 2) {
    throw new Error(`Preview count mismatch: ${JSON.stringify(preview, null, 2)}`)
  }
  if (preview.agents[0].contactCount !== 4) {
    throw new Error(`Expected 4 contacts (2+2), got ${preview.agents[0].contactCount}`)
  }
  if (preview.agents[0].sharedWithOtherAgentCount !== 1) {
    throw new Error(`Expected 1 shared RUC, got ${preview.agents[0].sharedWithOtherAgentCount}`)
  }
  const rucs = preview.agents[0].sample.map((s) => s.ruc).sort()
  if (rucs.join(',') !== '20111111111,20444444444') {
    throw new Error(`Unexpected preview RUCs: ${rucs.join(',')}`)
  }

  const mariaPreview = await previewDepuradoExport([fixture.maria.id])
  if (mariaPreview.agents[0]?.companyCount !== 2) {
    throw new Error(`Maria should have shared + exclusive depurado before export`)
  }

  const richardCompanies = await findDepuradoCompaniesForAgent(fixture.richard.id)
  const xlsxBuffer = writeImportWorkbookBuffer(
    toImportContactosRows(richardCompanies),
    toImportMobileRows(richardCompanies),
    toImportDetallePlanRows(richardCompanies)
  )
  const parsed = await parseExcel(xlsxBuffer)
  if (parsed.companies.length !== 2) throw new Error(`Excel companies ${parsed.companies.length}`)
  if (parsed.companies.find((c) => c.ruc === '20111111111')?.contacts.length !== 2) {
    throw new Error('Excel missing all contacts of depurado company')
  }
  if (parsed.mobileLines.length !== 1 || parsed.mobileLines[0].rentaBasica !== '69.90') {
    throw new Error('Excel missing mobile/renta')
  }

  const exported = await executeDepuradoExport([fixture.richard.id])
  if (!exported.file.filename.endsWith('_nocontestadodep_Richard.xlsx')) {
    throw new Error(`Unexpected filename: ${exported.file.filename}`)
  }
  const parsedAfterExport = await parseExcel(exported.file.buffer)
  if (parsedAfterExport.companies.length !== 2) {
    throw new Error(`Export xlsx companies ${parsedAfterExport.companies.length}`)
  }

  const extra = await prisma.company.create({
    data: {
      tenantId: OPTICK_TENANT_ID,
      ruc: '20888888888',
      razonSocial: 'Segundo depurado Richard',
      importBatchId: fixture.batch.id,
      contacts: {
        create: {
          tenantId: OPTICK_TENANT_ID,
          nombre: 'Nico',
          telefono: '988888888',
        },
      },
    },
    include: { contacts: true },
  })
  await prisma.assignment.create({
    data: {
      tenantId: OPTICK_TENANT_ID,
      contactId: extra.contacts[0].id,
      agentId: fixture.richard.id,
    },
  })
  await prisma.callLog.createMany({
    data: [
      {
        tenantId: OPTICK_TENANT_ID,
        companyId: extra.id,
        contactId: extra.contacts[0].id,
        agentId: fixture.richard.id,
        disposition: 'NO_CONTESTA',
      },
      {
        tenantId: OPTICK_TENANT_ID,
        companyId: extra.id,
        contactId: extra.contacts[0].id,
        agentId: fixture.richard.id,
        disposition: 'NO_CONTESTA',
      },
    ],
  })

  const zipExport = await executeDepuradoExport([fixture.richard.id, fixture.maria.id])
  if (!zipExport.file.filename.endsWith('_nocontestadodep.zip')) {
    throw new Error(`Expected ZIP for two agents, got ${zipExport.file.filename}`)
  }
  if (zipExport.exportedAgents.length !== 2) {
    throw new Error(`ZIP agents ${zipExport.exportedAgents.length}`)
  }

  const recovered = await prisma.company.findMany({
    where: { id: { in: [fixture.depurado.id, fixture.shared.id] } },
    select: { id: true, recoveredAt: true, recoveredFromAgentId: true, ruc: true },
  })
  if (recovered.some((c) => !c.recoveredAt || c.recoveredFromAgentId !== fixture.richard.id)) {
    throw new Error('Companies were not marked recovered')
  }

  const richardAssignments = await prisma.assignment.count({
    where: {
      agentId: fixture.richard.id,
      contact: { companyId: { in: [fixture.depurado.id, fixture.shared.id] } },
    },
  })
  if (richardAssignments !== 0) throw new Error('Richard assignments were not removed')

  const mariaAssignments = await prisma.assignment.count({
    where: { agentId: fixture.maria.id, contact: { companyId: fixture.shared.id } },
  })
  if (mariaAssignments !== 1) throw new Error('Maria assignment on shared RUC was removed')

  const logs = await prisma.callLog.count({
    where: { companyId: fixture.depurado.id, agentId: fixture.richard.id },
  })
  if (logs !== 2) throw new Error('Call logs were deleted')

  const unassignedAfter = await countUnassignedCompanies(fixture.batch.id)
  if (unassignedAfter.companies !== 1) {
    throw new Error(`Recovered companies leaked into unassigned pool: ${unassignedAfter.companies}`)
  }

  const second = await previewDepuradoExport([fixture.richard.id])
  if (second.agents.length !== 0) {
    throw new Error('Second export still includes recovered depurados')
  }

  const mariaAfter = await previewDepuradoExport([fixture.maria.id])
  if (mariaAfter.agents.length !== 0) {
    throw new Error('Recovered shared company was exportable again for Maria')
  }

  const token = jwt.sign(
    {
      id: fixture.admin.id,
      email: fixture.admin.email,
      role: fixture.admin.role,
      name: fixture.admin.name,
      tenantId: OPTICK_TENANT_ID,
      tokenVersion: 0,
    },
    process.env.JWT_SECRET as string,
    { expiresIn: '1h' }
  )

  const previewRes = await fetch(
    `http://127.0.0.1:3001/api/imports/depurado-export/preview?agentIds=${fixture.richard.id}`,
    { headers: { Authorization: `Bearer ${token}`, Host: 'localhost' } }
  )
  const previewJson = (await previewRes.json()) as { agents?: unknown[] }
  if (previewRes.status !== 200 || (previewJson.agents ?? []).length !== 0) {
    throw new Error(`HTTP preview after export should be empty: ${previewRes.status} ${JSON.stringify(previewJson)}`)
  }

  const zeroRes = await fetch('http://127.0.0.1:3001/api/imports/depurado-export', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Host: 'localhost',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ agentIds: [fixture.richard.id] }),
  })
  if (zeroRes.status !== 409) {
    throw new Error(`Expected 409 for 0 depurados, got ${zeroRes.status}`)
  }

  if (!isDepuradoNoContesta('NO_CONTESTA', 2)) throw new Error('sanity')

  await cleanup()
  console.log(
    JSON.stringify(
      {
        ok: true,
        filename: exported.file.filename,
        previewCompanies: 2,
        sharedWarning: 1,
        unassignedAfter: unassignedAfter.companies,
        httpZeroExport: zeroRes.status,
      },
      null,
      2
    )
  )
}

runWithTenant(OPTICK_TENANT_ID, () => main())
  .catch(async (err) => {
    console.error(err)
    try {
      await runWithTenant(OPTICK_TENANT_ID, () => cleanup())
    } catch (cleanupErr) {
      console.error('cleanup failed', cleanupErr)
    }
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
