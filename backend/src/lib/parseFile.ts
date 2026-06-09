import * as XLSX from 'xlsx'
import csvParser from 'csv-parser'
import { Readable } from 'stream'

export interface ParsedClient {
  name: string
  phone: string
  phone2?: string
  email?: string
  address?: string
  currentOp?: string
  plan?: string
  notes?: string
}

// Maps common column names (in any language) to our fields
const COLUMN_MAP: Record<string, keyof ParsedClient> = {
  nombre: 'name',
  name: 'name',
  cliente: 'name',
  client: 'name',
  'nombre cliente': 'name',
  telefono: 'phone',
  teléfono: 'phone',
  phone: 'phone',
  tel: 'phone',
  celular: 'phone',
  movil: 'phone',
  móvil: 'phone',
  telefono1: 'phone',
  teléfono1: 'phone',
  phone1: 'phone',
  tel1: 'phone',
  telefono2: 'phone2',
  teléfono2: 'phone2',
  phone2: 'phone2',
  tel2: 'phone2',
  celular2: 'phone2',
  'segundo telefono': 'phone2',
  email: 'email',
  correo: 'email',
  'correo electronico': 'email',
  'correo electrónico': 'email',
  mail: 'email',
  direccion: 'address',
  dirección: 'address',
  address: 'address',
  domicilio: 'address',
  operador: 'currentOp',
  operator: 'currentOp',
  'operador actual': 'currentOp',
  'current operator': 'currentOp',
  compania: 'currentOp',
  compañia: 'currentOp',
  compañía: 'currentOp',
  company: 'currentOp',
  plan: 'plan',
  tarifa: 'plan',
  rate: 'plan',
  notas: 'notes',
  notes: 'notes',
  comentarios: 'notes',
  comments: 'notes',
  observaciones: 'notes',
}

function normalizeKey(key: string): keyof ParsedClient | null {
  const normalized = key
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
  return (COLUMN_MAP[normalized] as keyof ParsedClient) ?? null
}

function mapRow(row: Record<string, unknown>): ParsedClient | null {
  const mapped: Partial<ParsedClient> = {}

  for (const [rawKey, value] of Object.entries(row)) {
    const field = normalizeKey(rawKey)
    if (field && value != null && String(value).trim() !== '') {
      ;(mapped as Record<string, string>)[field] = String(value).trim()
    }
  }

  // phone is required; name defaults to phone if missing
  if (!mapped.phone) return null
  if (!mapped.name) mapped.name = mapped.phone

  return mapped as ParsedClient
}

export async function parseExcel(buffer: Buffer): Promise<ParsedClient[]> {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  const results: ParsedClient[] = []
  for (const row of rows) {
    const mapped = mapRow(row)
    if (mapped) results.push(mapped)
  }
  return results
}

export async function parseCsv(buffer: Buffer): Promise<ParsedClient[]> {
  return new Promise((resolve, reject) => {
    const results: ParsedClient[] = []
    const stream = Readable.from(buffer)

    stream
      .pipe(csvParser())
      .on('data', (row: Record<string, unknown>) => {
        const mapped = mapRow(row)
        if (mapped) results.push(mapped)
      })
      .on('end', () => resolve(results))
      .on('error', reject)
  })
}
