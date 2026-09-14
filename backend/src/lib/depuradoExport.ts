import { prisma } from './prisma'
import {
  getLastDispositionByCompanyIds,
  isDepuradoNoContesta,
} from './companyDisposition'
import { getAppTimezone } from './appTimezone'
import {
  CONTACTOS_IMPORT_COLUMNS,
  DETALLE_PLAN_IMPORT_COLUMNS,
  PRODUCTOS_MOVIL_IMPORT_COLUMNS,
  formatImportContactPhone,
  formatImportFechaConsulta,
  formatImportMobilePhone,
  rowFromColumns,
  writeImportWorkbookBuffer,
  type ImportContactosRow,
  type ImportDetallePlanRow,
  type ImportMobileRow,
} from './importWorkbook'
import {
  applyOriginalRazonSocial,
  enrichDepuradoRowsFromOriginal,
  readOriginalImportSheetsFromPath,
  type OriginalSheetsByBatch,
} from './originalImportSheets'
import { buildZipBuffer } from './zipFiles'

const SAMPLE_LIMIT = 8

export type DepuradoCompanySample = {
  ruc: string
  razonSocial: string | null
}

export type DepuradoAgentPreview = {
  agentId: string
  agentName: string
  firstName: string
  companyCount: number
  contactCount: number
  sample: DepuradoCompanySample[]
  sharedWithOtherAgentCount: number
}

export type DepuradoExportPreview = {
  agents: DepuradoAgentPreview[]
  skippedAgents: { agentId: string; agentName: string }[]
  totalCompanies: number
  totalContacts: number
  totalSharedWithOtherAgent: number
}

export type DepuradoExportFile = {
  filename: string
  buffer: Buffer
  contentType: string
}

export type DepuradoExportResult = {
  file: DepuradoExportFile
  exportedAgents: { agentId: string; agentName: string; companyCount: number }[]
  skippedAgents: { agentId: string; agentName: string }[]
}

export class DepuradoExportEmptyError extends Error {
  skippedAgents: { agentId: string; agentName: string }[]
  constructor(skippedAgents: { agentId: string; agentName: string }[]) {
    super('Ningún agente seleccionado tiene empresas No contesta — depurado')
    this.name = 'DepuradoExportEmptyError'
    this.skippedAgents = skippedAgents
  }
}

export class DepuradoExportAgentsError extends Error {
  constructor(message = 'Uno o más agentes no son válidos') {
    super(message)
    this.name = 'DepuradoExportAgentsError'
  }
}

export function agentFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || 'Agente'
  const cleaned = first.replace(/[^\p{L}\p{N}_-]/gu, '')
  return cleaned || 'Agente'
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatCompactTimestampInAppTz(date: Date, timeZone = getAppTimezone()): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '00'
  const year = get('year')
  const month = get('month')
  const day = get('day')
  const hour = pad2(Number(get('hour')) % 24)
  const minute = get('minute')
  return `${year}${month}${day}-${hour}${minute}`
}

export function depuradoExportFilename(date: Date, agentName: string): string {
  return `${formatCompactTimestampInAppTz(date)}_nocontestadodep_${agentFirstName(agentName)}.xlsx`
}

export function depuradoExportZipFilename(date: Date): string {
  return `${formatCompactTimestampInAppTz(date)}_nocontestadodep.zip`
}

export function uniqueExportFilenames(
  items: { agentId: string; agentName: string }[],
  date: Date
): Map<string, string> {
  const used = new Map<string, number>()
  const result = new Map<string, string>()
  for (const item of items) {
    const base = depuradoExportFilename(date, item.agentName)
    const count = used.get(base) ?? 0
    used.set(base, count + 1)
    if (count === 0) {
      result.set(item.agentId, base)
      continue
    }
    const first = agentFirstName(item.agentName)
    const stamp = formatCompactTimestampInAppTz(date)
    result.set(item.agentId, `${stamp}_nocontestadodep_${first}_${count + 1}.xlsx`)
  }
  return result
}

type LoadedContact = {
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  dni: string | null
  tipoContacto: string | null
  assignment: { agentId: string } | null
}

type LoadedMobileLine = {
  ruc: string
  numeroTelefono: string | null
  estadoLinea: string | null
  plan: string | null
  rentaBasica: string | null
  rentaBasicaConDesc: string | null
}

export type LoadedDepuradoCompany = {
  id: string
  ruc: string
  razonSocial: string | null
  importBatchId: string
  importStatus: string | null
  fechaConsulta: Date | null
  contacts: LoadedContact[]
  mobileLines: LoadedMobileLine[]
}

export function isDepuradoCompany(
  lastDisposition: string | null | undefined,
  callLogCount: number
): boolean {
  return isDepuradoNoContesta(lastDisposition, callLogCount)
}

export function countSharedWithOtherAgent(
  companies: { contacts: { assignment: { agentId: string } | null }[] }[],
  agentId: string
): number {
  return companies.filter((company) =>
    company.contacts.some((c) => c.assignment && c.assignment.agentId !== agentId)
  ).length
}

export function toImportContactosRows(companies: LoadedDepuradoCompany[]): ImportContactosRow[] {
  const rows: ImportContactosRow[] = []
  for (const company of companies) {
    const fechaConsulta = formatImportFechaConsulta(company.fechaConsulta)
    const estado = company.importStatus ?? ''
    for (const contact of company.contacts) {
      rows.push(
        rowFromColumns(CONTACTOS_IMPORT_COLUMNS, {
          ruc: company.ruc,
          razon_social: company.razonSocial ?? '',
          nombre: contact.nombre,
          tipo_contacto: contact.tipoContacto ?? '',
          dni: contact.dni ?? '',
          email: contact.email ?? '',
          telefono: formatImportContactPhone(contact.telefono),
          estado,
          fecha_consulta: fechaConsulta,
        })
      )
    }
  }
  return rows
}

export function toImportMobileRows(companies: LoadedDepuradoCompany[]): ImportMobileRow[] {
  const rows: ImportMobileRow[] = []
  for (const company of companies) {
    const fechaConsulta = formatImportFechaConsulta(company.fechaConsulta)
    const estado = company.importStatus ?? ''
    const razonSocial = company.razonSocial ?? ''
    for (const line of company.mobileLines) {
      rows.push(
        rowFromColumns(PRODUCTOS_MOVIL_IMPORT_COLUMNS, {
          ruc: line.ruc,
          razon_social: razonSocial,
          numero_telefono: formatImportMobilePhone(line.numeroTelefono),
          estado_linea: line.estadoLinea ?? '',
          plan: line.plan ?? '',
          estado,
          fecha_consulta: fechaConsulta,
        })
      )
    }
  }
  return rows
}

export function toImportDetallePlanRows(companies: LoadedDepuradoCompany[]): ImportDetallePlanRow[] {
  const rows: ImportDetallePlanRow[] = []
  for (const company of companies) {
    const fechaConsulta = formatImportFechaConsulta(company.fechaConsulta)
    const estado = company.importStatus ?? ''
    const razonSocial = company.razonSocial ?? ''
    for (const line of company.mobileLines) {
      rows.push(
        rowFromColumns(DETALLE_PLAN_IMPORT_COLUMNS, {
          ruc: line.ruc,
          razon_social: razonSocial,
          numero_telefono: formatImportMobilePhone(line.numeroTelefono),
          estado_linea: line.estadoLinea ?? '',
          plan_detalle: line.plan ?? '',
          renta_basica: line.rentaBasica ?? '',
          renta_basica_con_desc: line.rentaBasicaConDesc ?? '',
          estado,
          fecha_consulta: fechaConsulta,
        })
      )
    }
  }
  return rows
}

async function loadAssignedCompaniesForAgent(agentId: string): Promise<LoadedDepuradoCompany[]> {
  return prisma.company.findMany({
    where: {
      recoveredAt: null,
      contacts: { some: { assignment: { agentId } } },
    },
    select: {
      id: true,
      ruc: true,
      razonSocial: true,
      importBatchId: true,
      importStatus: true,
      fechaConsulta: true,
      contacts: {
        select: {
          id: true,
          nombre: true,
          telefono: true,
          email: true,
          dni: true,
          tipoContacto: true,
          assignment: { select: { agentId: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
      mobileLines: {
        select: {
          ruc: true,
          numeroTelefono: true,
          estadoLinea: true,
          plan: true,
          rentaBasica: true,
          rentaBasicaConDesc: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
    },
    orderBy: { createdAt: 'asc' },
  })
}

export async function findDepuradoCompaniesForAgent(
  agentId: string
): Promise<LoadedDepuradoCompany[]> {
  const companies = await loadAssignedCompaniesForAgent(agentId)
  if (companies.length === 0) return []

  const lastByCompany = await getLastDispositionByCompanyIds(
    companies.map((c) => c.id),
    agentId
  )

  return companies.filter((company) => {
    const last = lastByCompany.get(company.id)
    return isDepuradoCompany(last?.disposition ?? null, last?.callLogCount ?? 0)
  })
}

async function loadAgents(agentIds: string[]) {
  const uniqueIds = [...new Set(agentIds.filter(Boolean))]
  if (uniqueIds.length === 0) {
    throw new DepuradoExportAgentsError('Selecciona al menos un agente')
  }

  const agents = await prisma.user.findMany({
    where: { id: { in: uniqueIds }, role: 'AGENT' },
    select: { id: true, name: true },
  })
  if (agents.length !== uniqueIds.length) {
    throw new DepuradoExportAgentsError()
  }

  const byId = new Map(agents.map((a) => [a.id, a]))
  return uniqueIds.map((id) => byId.get(id)!)
}

type AgentSelection = {
  agentId: string
  agentName: string
  companies: LoadedDepuradoCompany[]
}

async function selectDepuradoByAgents(agentIds: string[]): Promise<{
  selected: AgentSelection[]
  skipped: { agentId: string; agentName: string }[]
}> {
  const agents = await loadAgents(agentIds)
  const selected: AgentSelection[] = []
  const skipped: { agentId: string; agentName: string }[] = []

  for (const agent of agents) {
    const companies = await findDepuradoCompaniesForAgent(agent.id)
    if (companies.length === 0) {
      skipped.push({ agentId: agent.id, agentName: agent.name })
      continue
    }
    selected.push({ agentId: agent.id, agentName: agent.name, companies })
  }

  return { selected, skipped }
}

export async function previewDepuradoExport(agentIds: string[]): Promise<DepuradoExportPreview> {
  const { selected, skipped } = await selectDepuradoByAgents(agentIds)

  const agents: DepuradoAgentPreview[] = selected.map((row) => {
    const contactCount = row.companies.reduce((sum, c) => sum + c.contacts.length, 0)
    const sharedWithOtherAgentCount = countSharedWithOtherAgent(row.companies, row.agentId)
    return {
      agentId: row.agentId,
      agentName: row.agentName,
      firstName: agentFirstName(row.agentName),
      companyCount: row.companies.length,
      contactCount,
      sample: row.companies.slice(0, SAMPLE_LIMIT).map((c) => ({
        ruc: c.ruc,
        razonSocial: c.razonSocial,
      })),
      sharedWithOtherAgentCount,
    }
  })

  return {
    agents,
    skippedAgents: skipped,
    totalCompanies: agents.reduce((sum, a) => sum + a.companyCount, 0),
    totalContacts: agents.reduce((sum, a) => sum + a.contactCount, 0),
    totalSharedWithOtherAgent: agents.reduce((sum, a) => sum + a.sharedWithOtherAgentCount, 0),
  }
}

async function loadOriginalSheetsForCompanies(
  companies: LoadedDepuradoCompany[]
): Promise<OriginalSheetsByBatch> {
  const result: OriginalSheetsByBatch = new Map()
  const batchIds = [...new Set(companies.map((company) => company.importBatchId).filter(Boolean))]
  if (batchIds.length === 0) return result

  const batches = await prisma.importBatch.findMany({
    where: { id: { in: batchIds } },
    select: { id: true, storagePath: true },
  })

  await Promise.all(
    batches.map(async (batch) => {
      const sheets = await readOriginalImportSheetsFromPath(batch.storagePath)
      if (sheets) result.set(batch.id, sheets)
    })
  )
  return result
}

export async function buildAgentWorkbook(companies: LoadedDepuradoCompany[]): Promise<Buffer> {
  const originals = await loadOriginalSheetsForCompanies(companies)
  const resolved = applyOriginalRazonSocial(companies, originals)
  const enriched = enrichDepuradoRowsFromOriginal(
    toImportContactosRows(resolved),
    toImportMobileRows(resolved),
    toImportDetallePlanRows(resolved),
    resolved,
    originals
  )
  return writeImportWorkbookBuffer(enriched.contactos, enriched.mobiles, enriched.detalle)
}

export async function executeDepuradoExport(agentIds: string[]): Promise<DepuradoExportResult> {
  const { selected, skipped } = await selectDepuradoByAgents(agentIds)
  if (selected.length === 0) {
    throw new DepuradoExportEmptyError(skipped)
  }

  const exportedAt = new Date()
  const filenames = uniqueExportFilenames(
    selected.map((s) => ({ agentId: s.agentId, agentName: s.agentName })),
    exportedAt
  )

  const files = await Promise.all(
    selected.map(async (row) => ({
      agentId: row.agentId,
      agentName: row.agentName,
      companyCount: row.companies.length,
      filename: filenames.get(row.agentId)!,
      buffer: await buildAgentWorkbook(row.companies),
    }))
  )

  await prisma.$transaction(async (tx) => {
    for (const row of selected) {
      const companyIds = row.companies.map((c) => c.id)
      await tx.assignment.deleteMany({
        where: {
          agentId: row.agentId,
          contact: { companyId: { in: companyIds } },
        },
      })
      await tx.company.updateMany({
        where: { id: { in: companyIds }, recoveredAt: null },
        data: {
          recoveredAt: exportedAt,
          recoveredFromAgentId: row.agentId,
        },
      })
    }
  })

  if (files.length === 1) {
    return {
      file: {
        filename: files[0].filename,
        buffer: files[0].buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      exportedAgents: files.map((f) => ({
        agentId: f.agentId,
        agentName: f.agentName,
        companyCount: f.companyCount,
      })),
      skippedAgents: skipped,
    }
  }

  return {
    file: {
      filename: depuradoExportZipFilename(exportedAt),
      buffer: buildZipBuffer(
        files.map((f) => ({ name: f.filename, data: f.buffer })),
        exportedAt
      ),
      contentType: 'application/zip',
    },
    exportedAgents: files.map((f) => ({
      agentId: f.agentId,
      agentName: f.agentName,
      companyCount: f.companyCount,
    })),
    skippedAgents: skipped,
  }
}
