import { prisma } from './prisma'
import {
  getLastDispositionByCompanyIds,
  isDepuradoNoContesta,
} from './companyDisposition'
import { getAppTimezone } from './appTimezone'
import {
  CONTACTOS_IMPORT_COLUMNS,
  DETALLE_PLAN_IMPORT_COLUMNS,
  MOVISTAR_PRODUCTOS_COLUMNS,
  MOVISTAR_RESUMEN_COLUMNS,
  MOVISTAR_RESUMEN_DUOS_ACTIVOS_COLUMN,
  MOVISTAR_RESUMEN_INTERNET_MOVIL_ACTIVOS_COLUMN,
  MOVISTAR_RESUMEN_MONOPRODUCTOS_ACTIVOS_COLUMN,
  MOVISTAR_RESUMEN_MOVILES_ACTIVOS_COLUMN,
  MOVISTAR_RESUMEN_TRIOS_ACTIVOS_COLUMN,
  MOVISTAR_USUARIOS_COLUMNS,
  PRODUCTOS_MOVIL_IMPORT_COLUMNS,
  formatImportContactPhone,
  formatImportFechaConsulta,
  formatImportMobilePhone,
  rowFromColumns,
  writeImportWorkbookBuffer,
  writeMovistarImportWorkbookBuffer,
  type ImportContactosRow,
  type ImportDetallePlanRow,
  type ImportMobileRow,
  type ImportMovistarProductosRow,
  type ImportMovistarResumenRow,
  type ImportMovistarUsuariosRow,
} from './importWorkbook'
import {
  applyOriginalRazonSocial,
  enrichDepuradoRowsFromOriginal,
  originalMovistarRowsForRuc,
  readOriginalImportSheetsFromPath,
  readOriginalMovistarSheetsFromPath,
  type OriginalMovistarSheetsByBatch,
  type OriginalSheetsByBatch,
} from './originalImportSheets'
import { operatorFilenameSegment, resolveImportOperator, type ImportOperator } from './operator'
import {
  classifyMovistarProductCaja,
  extractMsisdnFromCodigoProducto,
  type MovistarCajaCategory,
} from './parseMovistarWorkbook'
import { mobileDigits } from './mobileLine'
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
  entelCount: number
  movistarCount: number
  sample: DepuradoCompanySample[]
  sharedWithOtherAgentCount: number
}

export type DepuradoExportPreview = {
  agents: DepuradoAgentPreview[]
  skippedAgents: { agentId: string; agentName: string }[]
  totalCompanies: number
  totalContacts: number
  totalSharedWithOtherAgent: number
  totalEntel: number
  totalMovistar: number
  fileCount: number
  operatorFilter: ImportOperator | null
}

export type DepuradoExportFile = {
  filename: string
  buffer: Buffer
  contentType: string
}

export type DepuradoExportResult = {
  file: DepuradoExportFile
  exportedAgents: {
    agentId: string
    agentName: string
    operator: ImportOperator
    companyCount: number
  }[]
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

export function depuradoExportFilename(
  date: Date,
  agentName: string,
  operator: ImportOperator
): string {
  const stamp = formatCompactTimestampInAppTz(date)
  const segment = operatorFilenameSegment(operator)
  return `${stamp}_nocontestadodep_${segment}_${agentFirstName(agentName)}.xlsx`
}

export function depuradoExportZipFilename(date: Date): string {
  return `${formatCompactTimestampInAppTz(date)}_nocontestadodep.zip`
}

export function depuradoExportUnitKey(agentId: string, operator: ImportOperator): string {
  return `${agentId}:${operator}`
}

export function uniqueExportFilenames(
  items: { agentId: string; agentName: string; operator: ImportOperator }[],
  date: Date
): Map<string, string> {
  const used = new Map<string, number>()
  const result = new Map<string, string>()
  for (const item of items) {
    const key = depuradoExportUnitKey(item.agentId, item.operator)
    const base = depuradoExportFilename(date, item.agentName, item.operator)
    const count = used.get(base) ?? 0
    used.set(base, count + 1)
    if (count === 0) {
      result.set(key, base)
      continue
    }
    const first = agentFirstName(item.agentName)
    const stamp = formatCompactTimestampInAppTz(date)
    const segment = operatorFilenameSegment(item.operator)
    result.set(key, `${stamp}_nocontestadodep_${segment}_${first}_${count + 1}.xlsx`)
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
  notes: string | null
  plan: string | null
  importBatchId: string
  importStatus: string | null
  fechaConsulta: Date | null
  importBatch: { operator: string | null } | null
  contacts: LoadedContact[]
  mobileLines: LoadedMobileLine[]
}

export function companyImportOperator(
  company: { importBatch?: { operator?: string | null } | null }
): ImportOperator {
  return resolveImportOperator(company.importBatch?.operator)
}

export function filterCompaniesByOperator(
  companies: LoadedDepuradoCompany[],
  operator?: ImportOperator | null
): LoadedDepuradoCompany[] {
  if (!operator) return companies
  return companies.filter((company) => companyImportOperator(company) === operator)
}

export type DepuradoExportUnit = {
  agentId: string
  agentName: string
  operator: ImportOperator
  companies: LoadedDepuradoCompany[]
}

export function splitCompaniesByOperator(
  companies: LoadedDepuradoCompany[]
): { operator: ImportOperator; companies: LoadedDepuradoCompany[] }[] {
  const entel = companies.filter((company) => companyImportOperator(company) === 'ENTEL')
  const movistar = companies.filter((company) => companyImportOperator(company) === 'MOVISTAR')
  const groups: { operator: ImportOperator; companies: LoadedDepuradoCompany[] }[] = []
  if (entel.length) groups.push({ operator: 'ENTEL', companies: entel })
  if (movistar.length) groups.push({ operator: 'MOVISTAR', companies: movistar })
  return groups
}

export function toExportUnits(
  selected: { agentId: string; agentName: string; companies: LoadedDepuradoCompany[] }[]
): DepuradoExportUnit[] {
  const units: DepuradoExportUnit[] = []
  for (const row of selected) {
    for (const group of splitCompaniesByOperator(row.companies)) {
      units.push({
        agentId: row.agentId,
        agentName: row.agentName,
        operator: group.operator,
        companies: group.companies,
      })
    }
  }
  return units
}

export function isDepuradoCompany(
  lastDisposition: string | null | undefined,
  noContestaCount: number
): boolean {
  return isDepuradoNoContesta(lastDisposition, noContestaCount)
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
      notes: true,
      plan: true,
      importBatchId: true,
      importStatus: true,
      fechaConsulta: true,
      importBatch: { select: { operator: true } },
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
    return isDepuradoCompany(last?.disposition ?? null, last?.noContestaCount ?? 0)
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

async function selectDepuradoByAgents(
  agentIds: string[],
  operator?: ImportOperator | null
): Promise<{
  selected: AgentSelection[]
  skipped: { agentId: string; agentName: string }[]
}> {
  const agents = await loadAgents(agentIds)
  const selected: AgentSelection[] = []
  const skipped: { agentId: string; agentName: string }[] = []

  for (const agent of agents) {
    const companies = filterCompaniesByOperator(
      await findDepuradoCompaniesForAgent(agent.id),
      operator
    )
    if (companies.length === 0) {
      skipped.push({ agentId: agent.id, agentName: agent.name })
      continue
    }
    selected.push({ agentId: agent.id, agentName: agent.name, companies })
  }

  return { selected, skipped }
}

function operatorCounts(companies: LoadedDepuradoCompany[]) {
  let entelCount = 0
  let movistarCount = 0
  for (const company of companies) {
    if (companyImportOperator(company) === 'MOVISTAR') movistarCount += 1
    else entelCount += 1
  }
  return { entelCount, movistarCount }
}

export async function previewDepuradoExport(
  agentIds: string[],
  operator?: ImportOperator | null
): Promise<DepuradoExportPreview> {
  const { selected, skipped } = await selectDepuradoByAgents(agentIds, operator)

  const agents: DepuradoAgentPreview[] = selected.map((row) => {
    const contactCount = row.companies.reduce((sum, c) => sum + c.contacts.length, 0)
    const sharedWithOtherAgentCount = countSharedWithOtherAgent(row.companies, row.agentId)
    const { entelCount, movistarCount } = operatorCounts(row.companies)
    return {
      agentId: row.agentId,
      agentName: row.agentName,
      firstName: agentFirstName(row.agentName),
      companyCount: row.companies.length,
      contactCount,
      entelCount,
      movistarCount,
      sample: row.companies.slice(0, SAMPLE_LIMIT).map((c) => ({
        ruc: c.ruc,
        razonSocial: c.razonSocial,
      })),
      sharedWithOtherAgentCount,
    }
  })

  const totalEntel = agents.reduce((sum, a) => sum + a.entelCount, 0)
  const totalMovistar = agents.reduce((sum, a) => sum + a.movistarCount, 0)

  return {
    agents,
    skippedAgents: skipped,
    totalCompanies: agents.reduce((sum, a) => sum + a.companyCount, 0),
    totalContacts: agents.reduce((sum, a) => sum + a.contactCount, 0),
    totalSharedWithOtherAgent: agents.reduce((sum, a) => sum + a.sharedWithOtherAgentCount, 0),
    totalEntel,
    totalMovistar,
    fileCount: agents.reduce(
      (sum, a) => sum + (a.entelCount > 0 ? 1 : 0) + (a.movistarCount > 0 ? 1 : 0),
      0
    ),
    operatorFilter: operator ?? null,
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

async function loadOriginalMovistarSheetsForCompanies(
  companies: LoadedDepuradoCompany[]
): Promise<OriginalMovistarSheetsByBatch> {
  const result: OriginalMovistarSheetsByBatch = new Map()
  const batchIds = [...new Set(companies.map((company) => company.importBatchId).filter(Boolean))]
  if (batchIds.length === 0) return result

  const batches = await prisma.importBatch.findMany({
    where: { id: { in: batchIds } },
    select: { id: true, storagePath: true },
  })

  await Promise.all(
    batches.map(async (batch) => {
      const sheets = await readOriginalMovistarSheetsFromPath(batch.storagePath)
      if (sheets) result.set(batch.id, sheets)
    })
  )
  return result
}

export function codigoProductoFromNumero(raw: string | null | undefined): string {
  const extracted = extractMsisdnFromCodigoProducto(raw)
  if (extracted) return extracted
  const digits = mobileDigits(raw)
  if (digits.length === 9) return digits
  return (raw ?? '').trim()
}

function fillRowRazonSocial<T extends { razon_social: string }>(row: T, razon: string): T {
  if (row.razon_social.trim() || !razon) return row
  return { ...row, razon_social: razon }
}

function movistarResumenCategoryCounts(
  lines: LoadedMobileLine[]
): Record<MovistarCajaCategory, number> {
  const counts: Record<MovistarCajaCategory, number> = {
    moviles: 0,
    internet: 0,
    duos: 0,
    mono: 0,
    trios: 0,
  }
  for (const line of lines) {
    counts[classifyMovistarProductCaja(line.estadoLinea ?? '', '', line.plan ?? '')] += 1
  }
  return counts
}

export function toMovistarResumenRows(companies: LoadedDepuradoCompany[]): ImportMovistarResumenRow[] {
  return companies.map((company) => {
    const counts = movistarResumenCategoryCounts(company.mobileLines)
    return rowFromColumns(MOVISTAR_RESUMEN_COLUMNS, {
      ruc: company.ruc,
      razon_social: company.razonSocial ?? '',
      estado: company.importStatus ?? '',
      mensaje: company.notes ?? '',
      n_usuarios: String(company.contacts.length),
      n_productos: String(company.mobileLines.length),
      [MOVISTAR_RESUMEN_MOVILES_ACTIVOS_COLUMN]: String(counts.moviles),
      [MOVISTAR_RESUMEN_INTERNET_MOVIL_ACTIVOS_COLUMN]: String(counts.internet),
      [MOVISTAR_RESUMEN_DUOS_ACTIVOS_COLUMN]: String(counts.duos),
      [MOVISTAR_RESUMEN_MONOPRODUCTOS_ACTIVOS_COLUMN]: String(counts.mono),
      [MOVISTAR_RESUMEN_TRIOS_ACTIVOS_COLUMN]: String(counts.trios),
      fecha_consulta: formatImportFechaConsulta(company.fechaConsulta),
    })
  })
}

export function toMovistarUsuariosRows(companies: LoadedDepuradoCompany[]): ImportMovistarUsuariosRow[] {
  const rows: ImportMovistarUsuariosRow[] = []
  for (const company of companies) {
    const fechaConsulta = formatImportFechaConsulta(company.fechaConsulta)
    const razonSocial = company.razonSocial ?? ''
    for (const contact of company.contacts) {
      rows.push(
        rowFromColumns(MOVISTAR_USUARIOS_COLUMNS, {
          razon_social: razonSocial,
          ruc: company.ruc,
          nombres_apellidos: contact.nombre,
          dni: contact.dni ?? '',
          correo: contact.email ?? '',
          celular: contact.telefono ?? '',
          rol_canal_online: contact.tipoContacto ?? '',
          fecha_consulta: fechaConsulta,
        })
      )
    }
  }
  return rows
}

export function toMovistarProductosRows(companies: LoadedDepuradoCompany[]): ImportMovistarProductosRow[] {
  const rows: ImportMovistarProductosRow[] = []
  for (const company of companies) {
    const fechaConsulta = formatImportFechaConsulta(company.fechaConsulta)
    const razonSocial = company.razonSocial ?? ''
    for (const line of company.mobileLines) {
      rows.push(
        rowFromColumns(MOVISTAR_PRODUCTOS_COLUMNS, {
          razon_social: razonSocial,
          ruc: company.ruc,
          codigo_producto: codigoProductoFromNumero(line.numeroTelefono),
          plan: line.plan ?? '',
          caja: line.estadoLinea ?? '',
          fecha_consulta: fechaConsulta,
        })
      )
    }
  }
  return rows
}

export function assembleMovistarExportRows(
  companies: LoadedDepuradoCompany[],
  originals: OriginalMovistarSheetsByBatch
): {
  resumen: ImportMovistarResumenRow[]
  usuarios: ImportMovistarUsuariosRow[]
  productos: ImportMovistarProductosRow[]
} {
  const resumen: ImportMovistarResumenRow[] = []
  const usuarios: ImportMovistarUsuariosRow[] = []
  const productos: ImportMovistarProductosRow[] = []

  for (const company of companies) {
    const original = originalMovistarRowsForRuc(originals.get(company.importBatchId), company.ruc)
    const razonFromOriginal =
      original.resumen.find((row) => row.razon_social.trim())?.razon_social.trim() ||
      original.usuarios.find((row) => row.razon_social.trim())?.razon_social.trim() ||
      original.productos.find((row) => row.razon_social.trim())?.razon_social.trim() ||
      ''
    const razon = company.razonSocial?.trim() || razonFromOriginal
    const resolved =
      razon && company.razonSocial?.trim() !== razon ? { ...company, razonSocial: razon } : company
    const reconstructedResumen = toMovistarResumenRows([resolved])
    const reconstructedUsuarios = toMovistarUsuariosRows([resolved])
    const reconstructedProductos = toMovistarProductosRows([resolved])

    if (original.resumen.length > 0) {
      resumen.push(...original.resumen.map((row) => fillRowRazonSocial(row, razon)))
    } else {
      resumen.push(...reconstructedResumen)
    }

    if (original.usuarios.length > 0) {
      usuarios.push(...original.usuarios.map((row) => fillRowRazonSocial(row, razon)))
    } else {
      usuarios.push(...reconstructedUsuarios)
    }

    if (original.productos.length > 0) {
      productos.push(...original.productos.map((row) => fillRowRazonSocial(row, razon)))
    } else {
      productos.push(...reconstructedProductos)
    }
  }

  return { resumen, usuarios, productos }
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

export async function buildMovistarAgentWorkbook(companies: LoadedDepuradoCompany[]): Promise<Buffer> {
  const originals = await loadOriginalMovistarSheetsForCompanies(companies)
  const rows = assembleMovistarExportRows(companies, originals)
  return writeMovistarImportWorkbookBuffer(rows.resumen, rows.usuarios, rows.productos)
}

export async function buildWorkbookForOperator(
  companies: LoadedDepuradoCompany[],
  operator: ImportOperator
): Promise<Buffer> {
  if (operator === 'MOVISTAR') return buildMovistarAgentWorkbook(companies)
  return buildAgentWorkbook(companies)
}

export async function executeDepuradoExport(
  agentIds: string[],
  operator?: ImportOperator | null
): Promise<DepuradoExportResult> {
  const { selected, skipped } = await selectDepuradoByAgents(agentIds, operator)
  if (selected.length === 0) {
    throw new DepuradoExportEmptyError(skipped)
  }

  const units = toExportUnits(selected)
  if (units.length === 0) {
    throw new DepuradoExportEmptyError(skipped)
  }

  const exportedAt = new Date()
  const filenames = uniqueExportFilenames(
    units.map((unit) => ({
      agentId: unit.agentId,
      agentName: unit.agentName,
      operator: unit.operator,
    })),
    exportedAt
  )

  const files = await Promise.all(
    units.map(async (unit) => ({
      agentId: unit.agentId,
      agentName: unit.agentName,
      operator: unit.operator,
      companyCount: unit.companies.length,
      filename: filenames.get(depuradoExportUnitKey(unit.agentId, unit.operator))!,
      buffer: await buildWorkbookForOperator(unit.companies, unit.operator),
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

  const exportedAgents = files.map((f) => ({
    agentId: f.agentId,
    agentName: f.agentName,
    operator: f.operator,
    companyCount: f.companyCount,
  }))

  if (files.length === 1) {
    return {
      file: {
        filename: files[0].filename,
        buffer: files[0].buffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      exportedAgents,
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
    exportedAgents,
    skippedAgents: skipped,
  }
}
