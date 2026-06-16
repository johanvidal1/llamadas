import * as XLSX from 'xlsx'
import csvParser from 'csv-parser'
import { Readable } from 'stream'

export interface ParsedContact {
  nombre: string
  tipoContacto?: string
  dni?: string
  email?: string
  telefono?: string
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
}

function normalizePhone(raw: string): string {
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
  estado: 'estado',
  fecha_consulta: 'fecha_consulta',
  fecha: 'fecha_consulta',
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown>[] {
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

  const rows: Record<string, unknown>[] = [normalized]
  if (telefono2 && telefono2 !== telefono) {
    rows.push({
      ...normalized,
      telefono: telefono2,
    })
  }

  return rows
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

    if (nombre || telefono) {
      company.contacts.push({ nombre, tipoContacto, dni, email, telefono })
    }
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
  const sheetName = workbook.SheetNames.find(
    (name) => name.trim().toLowerCase() === 'contactos'
  )
  if (!sheetName) {
    throw new MissingContactosSheetError(workbook.SheetNames)
  }
  const sheet = workbook.Sheets[sheetName]
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  const rows = rawRows.flatMap(normalizeRow)
  return { companies: parseRows(rows), sourceRowCount: rawRows.length }
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
          companies: parseRows(rows.flatMap(normalizeRow)),
          sourceRowCount: rows.length,
        })
      )
      .on('error', reject)
  })
}

