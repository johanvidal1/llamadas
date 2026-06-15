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

function normalizePhone(raw: string): string {
  return raw.replace(/\s+/g, '').replace(/^\+51/, '').trim()
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

    // Only add contact if has nombre and/or telefono
    if (nombre || telefono) {
      // Deduplicate: same nombre (case-insensitive) + same telefono
      const isDuplicate = company.contacts.some(
        (c) =>
          c.nombre.toLowerCase() === nombre.toLowerCase() &&
          (c.telefono ?? '') === (telefono ?? '')
      )
      if (!isDuplicate) {
        company.contacts.push({ nombre, tipoContacto, dni, email, telefono })
      }
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

export async function parseExcel(buffer: Buffer): Promise<ParsedCompany[]> {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  return parseRows(rows)
}

export async function parseCsv(buffer: Buffer): Promise<ParsedCompany[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, unknown>[] = []
    const stream = Readable.from(buffer)
    stream
      .pipe(csvParser())
      .on('data', (row: Record<string, unknown>) => rows.push(row))
      .on('end', () => resolve(parseRows(rows)))
      .on('error', reject)
  })
}

