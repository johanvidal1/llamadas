import * as XLSX from 'xlsx'
import csvParser from 'csv-parser'
import { Readable } from 'stream'
import { dedupeParsedMobileLines, isValidMobileLineNumber, mobileDigits } from './mobileLine'

export interface ParsedContact {
  nombre: string
  tipoContacto?: string
  dni?: string
  email?: string
  telefono?: string
}

export interface ParsedMobileLine {
  ruc: string
  numeroTelefono?: string
  estadoLinea?: string
  plan?: string
  /** @deprecated product OK flag; kept for older imports; no longer shown in UI */
  estado?: string
  rentaBasica?: string
  rentaBasicaConDesc?: string
}

export interface ParsedCompany {
  ruc: string
  razonSocial?: string
  name: string        // = razonSocial || ruc
  phone?: string      // primer contacto con teléfono
  email?: string      // primer contacto con email
  plan?: string
  notes?: string
  estado?: string     // OK | NO_ENCONTRADO | SIN_CONTACTOS
  fechaConsulta?: string
  contacts: ParsedContact[]
}

export interface ParseResult {
  companies: ParsedCompany[]
  sourceRowCount: number
  mobileLines: ParsedMobileLine[]
}

export function normalizePhone(raw: string): string {
  return raw.replace(/\s+/g, '').replace(/^\+51/, '').trim()
}

function normalizeHeader(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
}

const HEADER_ALIASES: Record<string, string> = {
  ruc: 'ruc',
  razon_social: 'razon_social',
  razonsocial: 'razon_social',
  nombre: 'nombre',
  name: 'nombre',
  contacto: 'nombre',
  cliente: 'nombre',
  nombre_completo: 'nombre',
  telefono: 'telefono',
  tel: 'telefono',
  phone: 'telefono',
  celular: 'telefono',
  movil: 'telefono',
  mobile: 'telefono',
  telefono2: 'telefono2',
  tel2: 'telefono2',
  celular2: 'telefono2',
  movil2: 'telefono2',
  phone2: 'telefono2',
  email: 'email',
  correo: 'email',
  dni: 'dni',
  documento: 'dni',
  tipo_contacto: 'tipo_contacto',
  tipo: 'tipo_contacto',
  cargo: 'tipo_contacto',
  area: 'tipo_contacto',
  area_de_trabajo: 'tipo_contacto',
  puesto: 'tipo_contacto',
  estado: 'estado',
  fecha_consulta: 'fecha_consulta',
  fecha: 'fecha_consulta',
}

const MOBILE_HEADER_ALIASES: Record<string, string> = {
  ruc: 'ruc',
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
  linea_estado: 'estado_linea',
  plan: 'plan',
  estado: 'estado_producto',
  estado_producto: 'estado_producto',
}

const DETALLE_PLAN_HEADER_ALIASES: Record<string, string> = {
  ruc: 'ruc',
  numero_telefono: 'numero_telefono',
  numero_de_telefono: 'numero_telefono',
  telefono: 'numero_telefono',
  tel: 'numero_telefono',
  phone: 'numero_telefono',
  celular: 'numero_telefono',
  movil: 'numero_telefono',
  mobile: 'numero_telefono',
  renta_basica: 'renta_basica',
  rentabasica: 'renta_basica',
  renta_basica_con_desc: 'renta_basica_con_desc',
  renta_basica_con_descuento: 'renta_basica_con_desc',
  renta_con_desc: 'renta_basica_con_desc',
  rentabasicacondesc: 'renta_basica_con_desc',
}

function findSheetName(sheetNames: string[], target: string): string | undefined {
  const needle = target.trim().toLowerCase()
  return sheetNames.find((name) => name.trim().toLowerCase() === needle)
}

function mobileJoinKey(ruc: string, numeroTelefono?: string | null): string | null {
  const digits = mobileDigits(numeroTelefono)
  if (!ruc || digits.length < 9) return null
  return `${ruc}:${digits}`
}

function normalizeMobileRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const canonical = MOBILE_HEADER_ALIASES[normalizeHeader(key)]
    if (canonical && value != null && String(value).trim() !== '') {
      normalized[canonical] = value
    }
  }

  const phoneRaw = String(normalized['numero_telefono'] ?? '').trim()
  if (phoneRaw) {
    normalized['numero_telefono'] = normalizePhone(phoneRaw)
  } else {
    delete normalized['numero_telefono']
  }

  return normalized
}

function normalizeDetallePlanRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const canonical = DETALLE_PLAN_HEADER_ALIASES[normalizeHeader(key)]
    if (canonical && value != null && String(value).trim() !== '') {
      normalized[canonical] = value
    }
  }

  const phoneRaw = String(normalized['numero_telefono'] ?? '').trim()
  if (phoneRaw) {
    normalized['numero_telefono'] = normalizePhone(phoneRaw)
  } else {
    delete normalized['numero_telefono']
  }

  return normalized
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    const canonical = HEADER_ALIASES[normalizeHeader(key)]
    if (canonical && value != null && String(value).trim() !== '') {
      normalized[canonical] = value
    }
  }

  const telefono2Raw = String(normalized['telefono2'] ?? '').trim()
  const telefonoRaw = String(normalized['telefono'] ?? '').trim()
  const telefono2 = telefono2Raw ? normalizePhone(telefono2Raw) : ''
  const telefono = telefonoRaw ? normalizePhone(telefonoRaw) : ''

  delete normalized['telefono2']

  // One Excel row → one contact: keep primary telefono, fall back to telefono2
  const mergedPhone = telefono || telefono2
  if (mergedPhone) {
    normalized['telefono'] = mergedPhone
  } else {
    delete normalized['telefono']
  }

  return normalized
}

function parseRows(rows: Record<string, unknown>[]): ParsedCompany[] {
  // Group by RUC
  const byRuc = new Map<string, ParsedCompany>()

  for (const row of rows) {
    const ruc = String(row['ruc'] ?? '').trim()
    if (!ruc) continue

    const razonSocial = String(row['razon_social'] ?? '').trim() || undefined
    const nombre = String(row['nombre'] ?? '').trim()
    const tipoContacto = String(row['tipo_contacto'] ?? '').trim() || undefined
    const dni = String(row['dni'] ?? '').trim() || undefined
    const email = String(row['email'] ?? '').trim() || undefined
    const telefonoRaw = String(row['telefono'] ?? '').trim()
    const telefono = telefonoRaw ? normalizePhone(telefonoRaw) : undefined
    const estado = String(row['estado'] ?? '').trim() || undefined
    const fechaConsulta = String(row['fecha_consulta'] ?? '').trim() || undefined

    if (!byRuc.has(ruc)) {
      byRuc.set(ruc, {
        ruc,
        razonSocial,
        name: razonSocial || ruc,
        plan: undefined,
        notes: undefined,
        estado,
        fechaConsulta,
        contacts: [],
      })
    }

    const company = byRuc.get(ruc)!

    // Update estado/razonSocial if found in a later row
    if (razonSocial && !company.razonSocial) {
      company.razonSocial = razonSocial
      company.name = razonSocial
    }
    if (estado && !company.estado) company.estado = estado
    if (fechaConsulta && !company.fechaConsulta) company.fechaConsulta = fechaConsulta

    // Every row with RUC yields one assignable contact (even RUC-only rows)
    company.contacts.push({
      nombre: nombre || 'Sin nombre',
      tipoContacto,
      dni,
      email,
      telefono,
    })
  }

  // Set primary phone/email from first contact that has one
  for (const company of byRuc.values()) {
    const firstWithPhone = company.contacts.find((c) => c.telefono)
    company.phone = firstWithPhone?.telefono
    const firstWithEmail = company.contacts.find((c) => c.email)
    company.email = firstWithEmail?.email
  }

  return Array.from(byRuc.values())
}

function parseMobileRows(rows: Record<string, unknown>[]): ParsedMobileLine[] {
  const result: ParsedMobileLine[] = []

  for (const row of rows) {
    const ruc = String(row['ruc'] ?? '').trim()
    if (!ruc) continue

    const numeroTelefonoRaw = String(row['numero_telefono'] ?? '').trim()
    const numeroTelefono = numeroTelefonoRaw ? normalizePhone(numeroTelefonoRaw) : undefined
    if (!isValidMobileLineNumber(numeroTelefono)) continue

    const estadoLinea = String(row['estado_linea'] ?? '').trim() || undefined
    const plan = String(row['plan'] ?? '').trim() || undefined
    // Product OK (`estado`) is no longer displayed; keep parsing lightly for legacy but do not rely on it
    const estado = String(row['estado_producto'] ?? '').trim() || undefined

    result.push({ ruc, numeroTelefono, estadoLinea, plan, estado })
  }

  return dedupeParsedMobileLines(result)
}

interface ParsedDetallePlanRenta {
  rentaBasica?: string
  rentaBasicaConDesc?: string
}

/** Build ruc+phone → rentas map from DetallePlan rows (first non-empty wins per field). */
export function parseDetallePlanRentas(
  rows: Record<string, unknown>[]
): Map<string, ParsedDetallePlanRenta> {
  const map = new Map<string, ParsedDetallePlanRenta>()

  for (const row of rows) {
    const ruc = String(row['ruc'] ?? '').trim()
    if (!ruc) continue

    const numeroTelefonoRaw = String(row['numero_telefono'] ?? '').trim()
    const numeroTelefono = numeroTelefonoRaw ? normalizePhone(numeroTelefonoRaw) : undefined
    const key = mobileJoinKey(ruc, numeroTelefono)
    if (!key) continue

    const rentaBasica = String(row['renta_basica'] ?? '').trim() || undefined
    const rentaBasicaConDesc = String(row['renta_basica_con_desc'] ?? '').trim() || undefined
    if (!rentaBasica && !rentaBasicaConDesc) continue

    const existing = map.get(key)
    if (!existing) {
      map.set(key, { rentaBasica, rentaBasicaConDesc })
      continue
    }
    if (!existing.rentaBasica && rentaBasica) existing.rentaBasica = rentaBasica
    if (!existing.rentaBasicaConDesc && rentaBasicaConDesc) {
      existing.rentaBasicaConDesc = rentaBasicaConDesc
    }
  }

  return map
}

export function mergeDetallePlanRentas(
  mobileLines: ParsedMobileLine[],
  rentasByKey: Map<string, ParsedDetallePlanRenta>
): ParsedMobileLine[] {
  if (rentasByKey.size === 0) return mobileLines

  return mobileLines.map((line) => {
    const key = mobileJoinKey(line.ruc, line.numeroTelefono)
    if (!key) return line
    const rentas = rentasByKey.get(key)
    if (!rentas) return line
    return {
      ...line,
      rentaBasica: rentas.rentaBasica,
      rentaBasicaConDesc: rentas.rentaBasicaConDesc,
    }
  })
}

export class MissingContactosSheetError extends Error {
  constructor(public availableSheets: string[]) {
    super(
      `No se encontró la hoja "Contactos". Hojas disponibles: ${availableSheets.join(', ') || '(ninguna)'}`
    )
    this.name = 'MissingContactosSheetError'
  }
}

export async function parseExcel(buffer: Buffer): Promise<ParseResult> {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = findSheetName(workbook.SheetNames, 'contactos')
  if (!sheetName) {
    throw new MissingContactosSheetError(workbook.SheetNames)
  }
  const sheet = workbook.Sheets[sheetName]
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  const rows = rawRows.map(normalizeRow)

  let mobileLines: ParsedMobileLine[] = []
  const mobileSheetName = findSheetName(workbook.SheetNames, 'productosmovil')
  if (mobileSheetName) {
    const mobileSheet = workbook.Sheets[mobileSheetName]
    const rawMobileRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(mobileSheet, {
      defval: '',
    })
    mobileLines = parseMobileRows(rawMobileRows.map(normalizeMobileRow))
  }

  const detalleSheetName = findSheetName(workbook.SheetNames, 'detalleplan')
  if (detalleSheetName && mobileLines.length > 0) {
    const detalleSheet = workbook.Sheets[detalleSheetName]
    const rawDetalleRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(detalleSheet, {
      defval: '',
    })
    const rentasByKey = parseDetallePlanRentas(rawDetalleRows.map(normalizeDetallePlanRow))
    mobileLines = mergeDetallePlanRentas(mobileLines, rentasByKey)
  }

  return { companies: parseRows(rows), sourceRowCount: rawRows.length, mobileLines }
}

export async function parseCsv(buffer: Buffer): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, unknown>[] = []
    const stream = Readable.from(buffer)
    stream
      .pipe(csvParser())
      .on('data', (row: Record<string, unknown>) => rows.push(row))
      .on('end', () =>
        resolve({
          companies: parseRows(rows.map(normalizeRow)),
          sourceRowCount: rows.length,
          mobileLines: [],
        })
      )
      .on('error', reject)
  })
}
