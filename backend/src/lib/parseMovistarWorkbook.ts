import * as XLSX from 'xlsx'
import { isValidMobileLineNumber, mobileDigits } from './mobileLine'
import type { ParsedCompany, ParsedContact, ParsedMobileLine, ParseResult } from './parseFile'

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

function findSheetName(sheetNames: string[], target: string): string | undefined {
  const needle = target.trim().toLowerCase()
  return sheetNames.find((name) => name.trim().toLowerCase() === needle)
}

function cellString(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString()
  }
  return String(value).trim()
}

const RESUMEN_ALIASES: Record<string, string> = {
  ruc: 'ruc',
  razon_social: 'razon_social',
  razonsocial: 'razon_social',
  estado: 'estado',
  mensaje: 'mensaje',
  n_usuarios: 'n_usuarios',
  n_productos: 'n_productos',
  fecha_consulta: 'fecha_consulta',
  fecha: 'fecha_consulta',
}

const USUARIOS_ALIASES: Record<string, string> = {
  razon_social: 'razon_social',
  razonsocial: 'razon_social',
  ruc: 'ruc',
  nombres_apellidos: 'nombres_apellidos',
  nombre: 'nombres_apellidos',
  dni: 'dni',
  documento: 'dni',
  correo: 'correo',
  email: 'correo',
  celular: 'celular',
  rol_canal_online: 'rol_canal_online',
  tipo_contacto: 'rol_canal_online',
  fecha_alta: 'fecha_alta',
  fecha_consulta: 'fecha_consulta',
}

const PRODUCTOS_ALIASES: Record<string, string> = {
  razon_social: 'razon_social',
  razonsocial: 'razon_social',
  ruc: 'ruc',
  codigo_producto: 'codigo_producto',
  plan: 'plan',
  cuenta_financiera: 'cuenta_financiera',
  subtipo_producto: 'subtipo_producto',
  fecha_activacion: 'fecha_activacion',
  caja: 'caja',
  fecha_consulta: 'fecha_consulta',
}

function normalizeAliasedRow(
  row: Record<string, unknown>,
  aliases: Record<string, string>
): Record<string, string> {
  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(row)) {
    const canonical = aliases[normalizeHeader(key)]
    if (!canonical) continue
    const text = cellString(value)
    if (text !== '') normalized[canonical] = text
  }
  return normalized
}

export class MissingMovistarResumenSheetError extends Error {
  constructor(public availableSheets: string[]) {
    super(
      `No se encontró la hoja "Resumen" (plantilla Movistar). Hojas disponibles: ${availableSheets.join(', ') || '(ninguna)'}`
    )
    this.name = 'MissingMovistarResumenSheetError'
  }
}

export function extractMsisdnFromCodigoProducto(raw: unknown): string | undefined {
  const digits = mobileDigits(cellString(raw))
  if (digits.length === 9 && isValidMobileLineNumber(digits)) {
    return normalizePhone(digits)
  }
  const match = digits.match(/9\d{8}/)
  if (match && isValidMobileLineNumber(match[0])) {
    return normalizePhone(match[0])
  }
  return undefined
}

export type MovistarCajaCategory = 'moviles' | 'internet' | 'duos' | 'mono' | 'trios'

export function isNonMobileMovistarProduct(caja: string, subtipo: string, plan = ''): boolean {
  const blob = normalizeHeader(`${caja} ${subtipo} ${plan}`)
  return (
    blob.includes('duo') ||
    blob.includes('trio') ||
    blob.includes('mono') ||
    blob.includes('internet')
  )
}

/** Classify Productos `caja` (or CRM `estadoLinea`) into Resumen count buckets. */
export function classifyMovistarProductCaja(
  caja: string,
  subtipo = '',
  plan = ''
): MovistarCajaCategory {
  const cajaNorm = normalizeHeader(caja)
  if (cajaNorm.includes('trio')) return 'trios'
  if (cajaNorm.includes('duo')) return 'duos'
  if (cajaNorm.includes('mono')) return 'mono'
  if (cajaNorm.includes('internet')) return 'internet'
  if (!isNonMobileMovistarProduct(caja, subtipo, plan)) return 'moviles'
  const blob = normalizeHeader(`${caja} ${subtipo} ${plan}`)
  if (blob.includes('trio')) return 'trios'
  if (blob.includes('duo')) return 'duos'
  if (blob.includes('mono')) return 'mono'
  if (blob.includes('internet')) return 'internet'
  return 'moviles'
}

function emptyCompany(ruc: string, extras?: Partial<ParsedCompany>): ParsedCompany {
  return {
    ruc,
    razonSocial: extras?.razonSocial,
    name: extras?.razonSocial || ruc,
    plan: extras?.plan,
    notes: extras?.notes,
    estado: extras?.estado,
    fechaConsulta: extras?.fechaConsulta,
    contacts: extras?.contacts ?? [],
    hasUsuarios: extras?.hasUsuarios ?? false,
  }
}

function fillIfEmpty(current: string | undefined, next: string | undefined): string | undefined {
  return current || next || undefined
}

function ensureAssignableContact(company: ParsedCompany): void {
  if (company.contacts.length > 0) return
  company.contacts.push({
    nombre: 'Sin nombre',
  })
}

function applyPrimaryPhoneEmail(company: ParsedCompany): void {
  const firstWithPhone = company.contacts.find((c) => c.telefono)
  company.phone = firstWithPhone?.telefono
  const firstWithEmail = company.contacts.find((c) => c.email)
  company.email = firstWithEmail?.email
}

/**
 * Movistar plantilla: Resumen / Usuarios / Productos.
 * Skip Resumen estado VACIO. Contact.telefono = Usuarios.celular only.
 * 9-digit MSISDN in codigo_producto → MobileLine (never onto Contact.telefono).
 * dúo/trío/mono/internet → Company.plan / notes, not a callable line.
 */
export function parseMovistarExcel(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const resumenName = findSheetName(workbook.SheetNames, 'resumen')
  if (!resumenName) {
    throw new MissingMovistarResumenSheetError(workbook.SheetNames)
  }

  const rawResumen = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[resumenName], {
    defval: '',
  })
  const vacioRucs = new Set<string>()
  const companies: ParsedCompany[] = []
  const byRuc = new Map<string, ParsedCompany>()

  for (const raw of rawResumen) {
    const row = normalizeAliasedRow(raw, RESUMEN_ALIASES)
    const ruc = row.ruc ?? ''
    if (!ruc) continue
    const estado = (row.estado ?? '').toUpperCase()
    if (estado === 'VACIO') {
      vacioRucs.add(ruc)
      continue
    }
    if (byRuc.has(ruc)) continue
    const razonSocial = row.razon_social || undefined
    const company = emptyCompany(ruc, {
      razonSocial,
      estado: row.estado || undefined,
      fechaConsulta: row.fecha_consulta || undefined,
      notes: row.mensaje || undefined,
      hasUsuarios: false,
    })
    byRuc.set(ruc, company)
    companies.push(company)
  }

  const usuariosName = findSheetName(workbook.SheetNames, 'usuarios')
  if (usuariosName) {
    const rawUsuarios = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[usuariosName],
      { defval: '' }
    )
    for (const raw of rawUsuarios) {
      const row = normalizeAliasedRow(raw, USUARIOS_ALIASES)
      const ruc = row.ruc ?? ''
      if (!ruc || vacioRucs.has(ruc)) continue

      let company = byRuc.get(ruc)
      if (!company) {
        company = emptyCompany(ruc, {
          razonSocial: row.razon_social || undefined,
          fechaConsulta: row.fecha_consulta || undefined,
          hasUsuarios: false,
        })
        byRuc.set(ruc, company)
        companies.push(company)
      } else {
        company.razonSocial = fillIfEmpty(company.razonSocial, row.razon_social)
        company.name = company.razonSocial || company.ruc
        company.fechaConsulta = fillIfEmpty(company.fechaConsulta, row.fecha_consulta)
      }

      const nombre = (row.nombres_apellidos ?? '').trim()
      const celularRaw = (row.celular ?? '').trim()
      const contact: ParsedContact = {
        nombre: nombre || 'Sin nombre',
        tipoContacto: row.rol_canal_online || undefined,
        dni: row.dni || undefined,
        email: row.correo || undefined,
        telefono: celularRaw ? normalizePhone(celularRaw) : undefined,
      }
      company.contacts.push(contact)
      company.hasUsuarios = true
    }
  }

  const mobileLines: ParsedMobileLine[] = []
  const nonMobileNotesByRuc = new Map<string, string[]>()
  const productosName = findSheetName(workbook.SheetNames, 'productos')
  if (productosName) {
    const rawProductos = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[productosName],
      { defval: '' }
    )
    for (const raw of rawProductos) {
      const row = normalizeAliasedRow(raw, PRODUCTOS_ALIASES)
      const ruc = row.ruc ?? ''
      if (!ruc || vacioRucs.has(ruc)) continue

      let company = byRuc.get(ruc)
      if (!company) {
        company = emptyCompany(ruc, {
          razonSocial: row.razon_social || undefined,
          fechaConsulta: row.fecha_consulta || undefined,
          hasUsuarios: false,
        })
        byRuc.set(ruc, company)
        companies.push(company)
      } else {
        company.razonSocial = fillIfEmpty(company.razonSocial, row.razon_social)
        company.name = company.razonSocial || company.ruc
        company.fechaConsulta = fillIfEmpty(company.fechaConsulta, row.fecha_consulta)
      }

      const caja = row.caja ?? ''
      const subtipo = row.subtipo_producto ?? ''
      const plan = row.plan ?? ''
      const nonMobile = isNonMobileMovistarProduct(caja, subtipo, plan)
      const msisdn = extractMsisdnFromCodigoProducto(row.codigo_producto)

      if (nonMobile) {
        const label = [caja || subtipo || 'Producto', plan].filter(Boolean).join(' · ')
        if (label) {
          const list = nonMobileNotesByRuc.get(ruc) ?? []
          list.push(label)
          nonMobileNotesByRuc.set(ruc, list)
        }
        if (plan) company.plan = fillIfEmpty(company.plan, plan)
        continue
      }

      if (msisdn) {
        mobileLines.push({
          ruc,
          numeroTelefono: msisdn,
          plan: plan || undefined,
          estadoLinea: caja || undefined,
        })
      }
    }
  }

  for (const [ruc, lines] of nonMobileNotesByRuc) {
    const company = byRuc.get(ruc)
    if (!company) continue
    const block = lines.join('\n')
    company.notes = fillIfEmpty(company.notes, block)
  }

  const seenMobile = new Set<string>()
  const dedupedLines = mobileLines.filter((line) => {
    const digits = mobileDigits(line.numeroTelefono)
    if (digits.length < 9) return false
    const key = `${line.ruc}:${digits}`
    if (seenMobile.has(key)) return false
    seenMobile.add(key)
    return true
  })

  for (const company of companies) {
    ensureAssignableContact(company)
    applyPrimaryPhoneEmail(company)
  }

  return {
    companies,
    sourceRowCount: rawResumen.length,
    mobileLines: dedupedLines,
    skippedVacioCount: vacioRucs.size,
  }
}
