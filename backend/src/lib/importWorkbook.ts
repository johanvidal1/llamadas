import * as XLSX from 'xlsx'

/** Richard operational-base Contactos headers, in order. */
export const CONTACTOS_IMPORT_COLUMNS = [
  'ruc',
  'razon_social',
  'nombre',
  'tipo_contacto',
  'dni',
  'email',
  'telefono',
  'asset_asociado',
  'estado',
  'fecha_consulta',
] as const

/** Richard ProductosMovil headers, in order. Rentas are never written here. */
export const PRODUCTOS_MOVIL_IMPORT_COLUMNS = [
  'ruc',
  'razon_social',
  'numero_telefono',
  'estado_linea',
  'plan',
  'iccid_sim',
  'numero_cuenta',
  'estado',
  'fecha_consulta',
  'error_parse',
] as const

/** Richard DetallePlan headers, in order. Always emitted (even with 0 data rows). */
export const DETALLE_PLAN_IMPORT_COLUMNS = [
  'ruc',
  'razon_social',
  'numero_telefono',
  'estado_linea',
  'plan_detalle',
  'tipo_producto',
  'renta_basica',
  'renta_basica_con_desc',
  'cuenta_facturacion',
  'perfil_facturacion',
  'ultima_fecha_suspension',
  'motivos_suspension',
  'migrado',
  'fecha_creacion_orden',
  'imei',
  'lista_negra',
  'marca',
  'modelo',
  'numero_solicitud',
  'fecha_venta',
  'estado',
  'fecha_consulta',
  'error_detalle',
  'linea_idx',
] as const

export const CONTACTOS_SHEET_NAME = 'Contactos'
export const PRODUCTOS_MOVIL_SHEET_NAME = 'ProductosMovil'
export const DETALLE_PLAN_SHEET_NAME = 'DetallePlan'

export const IMPORT_SHEET_NAMES = [
  CONTACTOS_SHEET_NAME,
  PRODUCTOS_MOVIL_SHEET_NAME,
  DETALLE_PLAN_SHEET_NAME,
] as const

export type ImportContactosRow = Record<(typeof CONTACTOS_IMPORT_COLUMNS)[number], string>
export type ImportMobileRow = Record<(typeof PRODUCTOS_MOVIL_IMPORT_COLUMNS)[number], string>
export type ImportDetallePlanRow = Record<(typeof DETALLE_PLAN_IMPORT_COLUMNS)[number], string>

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function sheetFromRows<T extends Record<string, string>>(
  columns: readonly string[],
  rows: T[]
): XLSX.WorkSheet {
  const aoa: string[][] = [columns.slice()]
  for (const row of rows) {
    aoa.push(columns.map((col) => row[col] ?? ''))
  }
  return XLSX.utils.aoa_to_sheet(aoa)
}

export function emptyImportRow<C extends readonly string[]>(
  columns: C
): Record<C[number], string> {
  const row = {} as Record<C[number], string>
  for (const col of columns) {
    row[col as C[number]] = ''
  }
  return row
}

export function rowFromColumns<C extends readonly string[]>(
  columns: C,
  values: Partial<Record<C[number], string>>
): Record<C[number], string> {
  const row = emptyImportRow(columns)
  for (const [key, value] of Object.entries(values)) {
    if (value != null) row[key as C[number]] = value
  }
  return row
}

/**
 * Date-only values (UTC midnight, typical ISO `YYYY-MM-DD` parse) stay ISO.
 * If a time was stored, write Richard-style `YYYY-MM-DD HH:mm:ss` from that instant — never invent a clock.
 */
export function formatImportFechaConsulta(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return ''
  const utcDateOnly =
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  if (utcDateOnly) return date.toISOString().slice(0, 10)
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`
}

function peruMobileDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (/^9\d{8}$/.test(digits)) return digits
  if (/^51[9]\d{8}$/.test(digits)) return digits.slice(2)
  return null
}

/** Richard Contactos style: `+51 938737031`. */
export function formatImportContactPhone(raw: string | null | undefined): string {
  if (!raw?.trim()) return ''
  const mobile = peruMobileDigits(raw)
  if (mobile) return `+51 ${mobile}`
  return raw.trim()
}

/** Richard ProductosMovil / DetallePlan style: `+51933348754`. */
export function formatImportMobilePhone(raw: string | null | undefined): string {
  if (!raw?.trim()) return ''
  const mobile = peruMobileDigits(raw)
  if (mobile) return `+51${mobile}`
  return raw.trim()
}

/** Workbook matching Richard operational sheets (parseExcel still accepts this file). */
export function buildImportWorkbook(
  contactos: ImportContactosRow[],
  mobileLines: ImportMobileRow[],
  detallePlan: ImportDetallePlanRow[] = []
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(CONTACTOS_IMPORT_COLUMNS, contactos),
    CONTACTOS_SHEET_NAME
  )
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(PRODUCTOS_MOVIL_IMPORT_COLUMNS, mobileLines),
    PRODUCTOS_MOVIL_SHEET_NAME
  )
  XLSX.utils.book_append_sheet(
    wb,
    sheetFromRows(DETALLE_PLAN_IMPORT_COLUMNS, detallePlan),
    DETALLE_PLAN_SHEET_NAME
  )
  return wb
}

export function writeImportWorkbookBuffer(
  contactos: ImportContactosRow[],
  mobileLines: ImportMobileRow[],
  detallePlan: ImportDetallePlanRow[] = []
): Buffer {
  const wb = buildImportWorkbook(contactos, mobileLines, detallePlan)
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

export function workbookSheetNames(wb: XLSX.WorkBook): string[] {
  return wb.SheetNames.slice()
}

export function workbookSheetHeaders(wb: XLSX.WorkBook, sheetName: string): string[] {
  const sheet = wb.Sheets[sheetName]
  if (!sheet) return []
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' })
  const header = rows[0]
  if (!Array.isArray(header)) return []
  return header.map((cell) => String(cell ?? '').trim()).filter(Boolean)
}
