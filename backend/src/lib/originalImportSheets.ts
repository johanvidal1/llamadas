import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as XLSX from 'xlsx'
import {
  CONTACTOS_IMPORT_COLUMNS,
  CONTACTOS_SHEET_NAME,
  DETALLE_PLAN_IMPORT_COLUMNS,
  DETALLE_PLAN_SHEET_NAME,
  PRODUCTOS_MOVIL_IMPORT_COLUMNS,
  PRODUCTOS_MOVIL_SHEET_NAME,
  emptyImportRow,
  type ImportContactosRow,
  type ImportDetallePlanRow,
  type ImportMobileRow,
} from './importWorkbook'

export type OriginalImportSheets = {
  contactos: ImportContactosRow[]
  productosMovil: ImportMobileRow[]
  detallePlan: ImportDetallePlanRow[]
}

export type OriginalSheetsByBatch = Map<string, OriginalImportSheets>

type CompanyRazonSource = {
  ruc: string
  razonSocial: string | null
  importBatchId: string
}

function normalizeHeader(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
}

function cellToImportString(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString()
  }
  return String(value).trim()
}

const CONTACTOS_HEADER_ALIASES: Record<string, (typeof CONTACTOS_IMPORT_COLUMNS)[number]> = {
  ruc: 'ruc',
  razon_social: 'razon_social',
  razonsocial: 'razon_social',
  nombre: 'nombre',
  name: 'nombre',
  tipo_contacto: 'tipo_contacto',
  tipo: 'tipo_contacto',
  cargo: 'tipo_contacto',
  dni: 'dni',
  documento: 'dni',
  email: 'email',
  correo: 'email',
  telefono: 'telefono',
  tel: 'telefono',
  phone: 'telefono',
  celular: 'telefono',
  movil: 'telefono',
  mobile: 'telefono',
  asset_asociado: 'asset_asociado',
  asset: 'asset_asociado',
  estado: 'estado',
  fecha_consulta: 'fecha_consulta',
  fecha: 'fecha_consulta',
}

const PRODUCTOS_MOVIL_HEADER_ALIASES: Record<
  string,
  (typeof PRODUCTOS_MOVIL_IMPORT_COLUMNS)[number]
> = {
  ruc: 'ruc',
  razon_social: 'razon_social',
  razonsocial: 'razon_social',
  numero_telefono: 'numero_telefono',
  numero_de_telefono: 'numero_telefono',
  telefono: 'numero_telefono',
  tel: 'numero_telefono',
  phone: 'numero_telefono',
  celular: 'numero_telefono',
  movil: 'numero_telefono',
  mobile: 'numero_telefono',
  estado_linea: 'estado_linea',
  estado_de_linea: 'estado_linea',
  plan: 'plan',
  iccid_sim: 'iccid_sim',
  iccid: 'iccid_sim',
  numero_cuenta: 'numero_cuenta',
  nro_cuenta: 'numero_cuenta',
  cuenta: 'numero_cuenta',
  estado: 'estado',
  fecha_consulta: 'fecha_consulta',
  error_parse: 'error_parse',
}

const DETALLE_PLAN_HEADER_ALIASES: Record<string, (typeof DETALLE_PLAN_IMPORT_COLUMNS)[number]> = {
  ruc: 'ruc',
  razon_social: 'razon_social',
  razonsocial: 'razon_social',
  numero_telefono: 'numero_telefono',
  numero_de_telefono: 'numero_telefono',
  telefono: 'numero_telefono',
  tel: 'numero_telefono',
  phone: 'numero_telefono',
  celular: 'numero_telefono',
  movil: 'numero_telefono',
  mobile: 'numero_telefono',
  estado_linea: 'estado_linea',
  estado_de_linea: 'estado_linea',
  plan_detalle: 'plan_detalle',
  plan: 'plan_detalle',
  tipo_producto: 'tipo_producto',
  renta_basica: 'renta_basica',
  rentabasica: 'renta_basica',
  renta_basica_con_desc: 'renta_basica_con_desc',
  renta_basica_con_descuento: 'renta_basica_con_desc',
  renta_con_desc: 'renta_basica_con_desc',
  cuenta_facturacion: 'cuenta_facturacion',
  perfil_facturacion: 'perfil_facturacion',
  ultima_fecha_suspension: 'ultima_fecha_suspension',
  motivos_suspension: 'motivos_suspension',
  migrado: 'migrado',
  fecha_creacion_orden: 'fecha_creacion_orden',
  imei: 'imei',
  lista_negra: 'lista_negra',
  marca: 'marca',
  modelo: 'modelo',
  numero_solicitud: 'numero_solicitud',
  fecha_venta: 'fecha_venta',
  estado: 'estado',
  fecha_consulta: 'fecha_consulta',
  error_detalle: 'error_detalle',
  linea_idx: 'linea_idx',
}

function findSheetName(sheetNames: string[], target: string): string | undefined {
  const needle = target.trim().toLowerCase()
  return sheetNames.find((name) => name.trim().toLowerCase() === needle)
}

function mapSheetRows<C extends readonly string[]>(
  wb: XLSX.WorkBook,
  sheetName: string,
  columns: C,
  aliases: Record<string, C[number]>
): Record<C[number], string>[] {
  const resolved = findSheetName(wb.SheetNames, sheetName)
  if (!resolved) return []
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[resolved], {
    defval: '',
    raw: false,
  })
  return rawRows.map((row) => {
    const mapped = emptyImportRow(columns)
    for (const [key, value] of Object.entries(row)) {
      const canonical = aliases[normalizeHeader(key)]
      if (!canonical) continue
      const text = cellToImportString(value)
      if (text) mapped[canonical] = text
    }
    return mapped
  })
}

export function parseOriginalImportWorkbook(buffer: Buffer): OriginalImportSheets {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  return {
    contactos: mapSheetRows(
      wb,
      CONTACTOS_SHEET_NAME,
      CONTACTOS_IMPORT_COLUMNS,
      CONTACTOS_HEADER_ALIASES
    ),
    productosMovil: mapSheetRows(
      wb,
      PRODUCTOS_MOVIL_SHEET_NAME,
      PRODUCTOS_MOVIL_IMPORT_COLUMNS,
      PRODUCTOS_MOVIL_HEADER_ALIASES
    ),
    detallePlan: mapSheetRows(
      wb,
      DETALLE_PLAN_SHEET_NAME,
      DETALLE_PLAN_IMPORT_COLUMNS,
      DETALLE_PLAN_HEADER_ALIASES
    ),
  }
}

export function resolveImportStoragePath(storagePath: string): string {
  return path.join(process.cwd(), storagePath)
}

export async function readOriginalImportSheetsFromPath(
  storagePath: string | null | undefined
): Promise<OriginalImportSheets | null> {
  if (!storagePath) return null
  const absolute = resolveImportStoragePath(storagePath)
  if (!existsSync(absolute)) return null
  try {
    const buffer = await readFile(absolute)
    return parseOriginalImportWorkbook(buffer)
  } catch (err) {
    console.error('Failed to parse original import workbook:', storagePath, err)
    return null
  }
}

/** Strip +51 / 51 so Contactos `+51 9XXXXXXXX` matches ProductosMovil `+519XXXXXXXX`. */
export function importJoinPhoneDigits(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (/^51[9]\d{8}$/.test(digits)) return digits.slice(2)
  return digits
}

export function importLineJoinKey(
  ruc: string | null | undefined,
  phone: string | null | undefined
): string | null {
  const cleanRuc = (ruc ?? '').trim()
  const digits = importJoinPhoneDigits(phone)
  if (!cleanRuc || digits.length < 9) return null
  return `${cleanRuc}:${digits}`
}

function firstNonEmptyRazon(
  rows: Array<{ ruc: string; razon_social: string }>,
  ruc: string
): string {
  const hit = rows.find((row) => row.ruc === ruc && row.razon_social.trim())
  return hit?.razon_social.trim() ?? ''
}

export function razonSocialFromOriginal(
  ruc: string,
  original: OriginalImportSheets | null | undefined
): string {
  if (!original) return ''
  return (
    firstNonEmptyRazon(original.contactos, ruc) ||
    firstNonEmptyRazon(original.productosMovil, ruc) ||
    firstNonEmptyRazon(original.detallePlan, ruc)
  )
}

export function resolveCompanyRazonSocial(
  company: CompanyRazonSource,
  originals: OriginalSheetsByBatch
): string {
  const fromDb = company.razonSocial?.trim()
  if (fromDb) return fromDb
  return razonSocialFromOriginal(company.ruc, originals.get(company.importBatchId))
}

export function applyOriginalRazonSocial<T extends CompanyRazonSource>(
  companies: T[],
  originals: OriginalSheetsByBatch
): T[] {
  return companies.map((company) => {
    const resolved = resolveCompanyRazonSocial(company, originals)
    if (!resolved || company.razonSocial?.trim() === resolved) return company
    return { ...company, razonSocial: resolved }
  })
}

function fillEmptyFromSource<T extends Record<string, string>>(
  target: T,
  source: Record<string, string> | undefined,
  columns: readonly string[]
): T {
  if (!source) return target
  const next = { ...target }
  for (const col of columns) {
    if (String(next[col] ?? '').trim()) continue
    const value = String(source[col] ?? '').trim()
    if (value) next[col] = value
  }
  return next
}

function mergeOriginalRows(rows: Array<Record<string, string>>): Record<string, string> | undefined {
  if (rows.length === 0) return undefined
  if (rows.length === 1) return rows[0]
  const out = { ...rows[0] }
  for (const row of rows.slice(1)) {
    for (const [key, value] of Object.entries(row)) {
      if (!String(out[key] ?? '').trim() && String(value ?? '').trim()) {
        out[key] = value
      }
    }
  }
  return out
}

export function matchOriginalContactoRow(
  row: ImportContactosRow,
  candidates: ImportContactosRow[]
): ImportContactosRow | undefined {
  const sameRuc = candidates.filter((candidate) => candidate.ruc === row.ruc)
  if (sameRuc.length === 0) return undefined

  const phone = importJoinPhoneDigits(row.telefono)
  const nombre = row.nombre.trim().toLowerCase()
  const dni = row.dni.trim()

  if (dni) {
    const byDni = sameRuc.find((candidate) => candidate.dni.trim() === dni)
    if (byDni) return byDni
  }
  if (phone.length >= 9 && nombre) {
    const byBoth = sameRuc.find(
      (candidate) =>
        importJoinPhoneDigits(candidate.telefono) === phone &&
        candidate.nombre.trim().toLowerCase() === nombre
    )
    if (byBoth) return byBoth
  }
  if (phone.length >= 9) {
    const byPhone = sameRuc.find(
      (candidate) => importJoinPhoneDigits(candidate.telefono) === phone
    )
    if (byPhone) return byPhone
  }
  if (nombre) {
    const byName = sameRuc.find((candidate) => candidate.nombre.trim().toLowerCase() === nombre)
    if (byName) return byName
  }
  return sameRuc[0]
}

function matchOriginalLineRows<T extends { ruc: string; numero_telefono: string }>(
  row: T,
  candidates: T[]
): T | undefined {
  const key = importLineJoinKey(row.ruc, row.numero_telefono)
  if (!key) return undefined
  return mergeOriginalRows(
    candidates.filter((candidate) => importLineJoinKey(candidate.ruc, candidate.numero_telefono) === key)
  ) as T | undefined
}

export function enrichDepuradoRowsFromOriginal(
  contactos: ImportContactosRow[],
  mobiles: ImportMobileRow[],
  detalle: ImportDetallePlanRow[],
  companies: CompanyRazonSource[],
  originals: OriginalSheetsByBatch
): {
  contactos: ImportContactosRow[]
  mobiles: ImportMobileRow[]
  detalle: ImportDetallePlanRow[]
} {
  const batchByRuc = new Map(companies.map((company) => [company.ruc, company.importBatchId]))

  const sheetsForRuc = (ruc: string): OriginalImportSheets | undefined => {
    const batchId = batchByRuc.get(ruc)
    return batchId ? originals.get(batchId) : undefined
  }

  return {
    contactos: contactos.map((row) =>
      fillEmptyFromSource(
        row,
        matchOriginalContactoRow(row, sheetsForRuc(row.ruc)?.contactos ?? []),
        CONTACTOS_IMPORT_COLUMNS
      )
    ),
    mobiles: mobiles.map((row) =>
      fillEmptyFromSource(
        row,
        matchOriginalLineRows(row, sheetsForRuc(row.ruc)?.productosMovil ?? []),
        PRODUCTOS_MOVIL_IMPORT_COLUMNS
      )
    ),
    detalle: detalle.map((row) =>
      fillEmptyFromSource(
        row,
        matchOriginalLineRows(row, sheetsForRuc(row.ruc)?.detallePlan ?? []),
        DETALLE_PLAN_IMPORT_COLUMNS
      )
    ),
  }
}
