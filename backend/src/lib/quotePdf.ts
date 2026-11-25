import { existsSync, readFileSync } from 'fs'
import path from 'path'
import PDFDocument from 'pdfkit'
import { inkOnFill, type OfferPlanColors } from './offerPlanWorkbook'
import {
  displayBenefit,
  displayDatosBenefit,
  mixHasRoaming,
  normalizeQuoteDiscountPercent,
  quoteDiscountedLineTotal,
  quoteDiscountedUnit,
  quotePlanApps,
  quotePlanAppsShort,
  parseQuotePlanOrigin,
  quotePlanData,
  quotePlanInternet,
  quotePlanMinutes,
  quotePlanRoaming,
  sortQuoteMixRows,
  type QuotePlanOrigin,
} from './quoteDiscount'
import { getAppTimezone } from './appTimezone'

export {
  quoteDiscountedLineTotal,
  quoteDiscountedUnit,
  quoteLineTotal,
  normalizeQuoteDiscountPercent,
  quotePlanNameWithOrigin,
  type QuotePlanOrigin,
} from './quoteDiscount'

export type QuotePdfBenefit = { label: string; value: string }

export type QuotePdfCurrentPlan = {
  plan: string
  rentaBasica: string
  rentaConDesc: string
  count: number
}

export type QuotePdfColors = OfferPlanColors

/** One chosen catalog row, frozen on the quote. Prices are list (catalog) amounts. */
export type QuotePdfPlanRow = {
  name: string
  priceSoles: number
  lines: number
  monthlySoles: number
  proposed: boolean
  benefits: QuotePdfBenefit[]
  colors?: QuotePdfColors | null
  /** Frozen mix origin. Missing on quotes saved before per-row origin. */
  origin?: QuotePlanOrigin
}

export type QuotePdfInput = {
  /** Unused on the sheet. Kept so older callers still type-check. */
  greeting?: string
  farewell?: string
  /** Agent extras. Empty omits the whole block. */
  extras?: string
  /** Agent subtitle after the mix line count. Undefined uses the Claro default. Empty → `N líneas móviles.` */
  headlineSuffix?: string
  companyName: string
  contactName: string
  ruc: string
  phone: string
  email: string
  currentPlans: QuotePdfCurrentPlan[]
  planName: string
  priceSoles: number
  lines: number
  totalSoles: number
  benefits: QuotePdfBenefit[]
  /** When set, the PDF table is exactly these rows. Otherwise one proposed row is built from the plan fields. */
  planRows?: QuotePdfPlanRow[]
  /** Title band. Snapshot of the plan table name. */
  tableName?: string
  /** Quote-level percent. 0 = sin descuento. Same % on every mix line. */
  discountPercent?: number
  /** Civil date in the header. Defaults to now in APP_TIMEZONE. */
  issuedAt?: Date
  senderName?: string
  senderPhone?: string
  /** Agent job title snapshotted at register. Empty → Ejecutivo de ventas. */
  senderCargo?: string
  /** Profile Correo (or login email) snapshotted at register. Empty omits the line. */
  senderEmail?: string
  letterheadPath?: string | null
  signaturePath?: string | null
  promoPaths?: string[]
}

type PdfDoc = InstanceType<typeof PDFDocument>

const INK = '#1F232A'
const ACCENT = '#E2231A'
const NAVY = '#1F232A'
const KPI_FILL = '#F4F6F8'
const CARD_FILL = '#F4F6F8'
const MUTED = '#5B6775'
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN_X = 40
/** Minimum red band; grows when the razón social wraps or the sender block is taller than the logo. */
const HEADER_H = 96
const HEADER_BOX_Y = 16
const HEADER_BOX_W = 122
const HEADER_BOX_H = 64
const HEADER_TEXT_GAP = 18
const HEADER_TITLE_Y = 20
const HEADER_SUBTITLE_Y = 40
const HEADER_COMPANY_Y = 58
const HEADER_COMPANY_SIZE = 11
/** Used instead of 11 pt when the razón social needs a third line, so the band stays light. */
const HEADER_COMPANY_SIZE_SMALL = 10
const HEADER_RUC_SIZE = 9
const HEADER_COMPANY_RUC_GAP = 5
const HEADER_PAD_BOTTOM = 10
const HEADER_COMPANY_MAX_LINES = 3
const HEADER_AFTER = 20
/** White 0.6 pt divider between the title column and the sender block (page-1 header only). */
export const HEADER_DIVIDER_X = 450
export const HEADER_DIVIDER_W = 0.6
/** Right end of the left text column (leaves 10 pt before the divider). */
const HEADER_TEXT_RIGHT = HEADER_DIVIDER_X - 10
/** Sender block: starts 12 pt right of the divider; full-bleed band, so it may run to 24 pt from the page edge. */
export const HEADER_SENDER_X = HEADER_DIVIDER_X + 12
const HEADER_SENDER_RIGHT_PAD = 24
export const HEADER_SENDER_W = 595.28 - HEADER_SENDER_RIGHT_PAD - HEADER_SENDER_X
const SENDER_NAME_SIZE = 10
const SENDER_CARGO_SIZE = 9
const SENDER_EMAIL_SIZE = 8
const SENDER_EMAIL_SIZE_MIN = 7.5
const SENDER_CEL_SIZE = 9
const SENDER_NAME_MAX_LINES = 2
const SENDER_LINE_GAP = 2.5
/** Compact one-line red band on continuation pages (logo + title + razón social). */
const CONT_HEADER_H = 44
const CONT_HEADER_BOX_W = 86
const CONT_HEADER_BOX_H = 30
const CONT_HEADER_TEXT_GAP = 12
const CONT_HEADER_AFTER = 16
const CONT_TITLE_SIZE = 11
const CONT_COMPANY_SIZE = 10
const CONT_TITLE_COMPANY_GAP = 14
const CONTENT_W = PAGE_W - MARGIN_X * 2
const PAGE_TOP = 24
/** The navy footer bar and the last-page signature stamp are gone; content may run to this floor. */
const PAGE_MARGIN_BOTTOM = 20
const PAGE_BOTTOM = PAGE_H - PAGE_MARGIN_BOTTOM
/** Per-document y where body starts (below the page header). */
const pageContentTop = new WeakMap<PdfDoc, number>()

function contentTop(doc: PdfDoc): number {
  return pageContentTop.get(doc) ?? PAGE_TOP
}

function setContentTop(doc: PdfDoc, y: number) {
  pageContentTop.set(doc, y)
}

/** Vertical gaps between page-1 blocks. `TIGHT` is used only when it lets the flags map stay on page 1. */
export type PageSpacing = {
  afterTitle: number
  afterHeadline: number
  afterKpi: number
  afterTable: number
  /** Space between a section title badge and its body. */
  titleGap: number
  roamGap: number
  roamAfter: number
  appsAfter: number
}

const SPACING_NORMAL: PageSpacing = {
  afterTitle: 6,
  afterHeadline: 16,
  afterKpi: 16,
  afterTable: 14,
  titleGap: 12,
  roamGap: 10,
  roamAfter: 12,
  appsAfter: 8,
}

const SPACING_TIGHT: PageSpacing = {
  afterTitle: 4,
  afterHeadline: 10,
  afterKpi: 8,
  afterTable: 8,
  titleGap: 8,
  roamGap: 8,
  roamAfter: 6,
  appsAfter: 4,
}

/** Never shrink the flags map below this share of its natural width/height. */
export const QUOTE_MAP_MIN_SCALE = 0.85

const pageSpacing = new WeakMap<PdfDoc, PageSpacing>()

function spacingOf(doc: PdfDoc): PageSpacing {
  return pageSpacing.get(doc) ?? SPACING_NORMAL
}

/** Extra gap between KPI / table / roaming / apps when page 1 still has slack. */
const PAGE1_BREATHING_PT = 12

function firstExisting(files: string[]): string | null {
  return files.find((file) => existsSync(file)) ?? null
}

/** Bundled Claro Empresas mark. Never fall back to an OPTICK letterhead. */
export function bundledClaroLogoPath(): string | null {
  return firstExisting([
    path.resolve(__dirname, '../../assets/claro-empresas-logo.png'),
    path.resolve(process.cwd(), 'assets/claro-empresas-logo.png'),
    path.resolve(process.cwd(), 'backend/assets/claro-empresas-logo.png'),
  ])
}

/** Flags infographic. Title + image stay atomic; omit the block if the file is missing. */
export function bundledRoamingZonesPath(): string | null {
  return firstExisting([
    path.resolve(__dirname, '../../assets/claro-roaming-zonas.png'),
    path.resolve(process.cwd(), 'assets/claro-roaming-zonas.png'),
    path.resolve(process.cwd(), 'backend/assets/claro-roaming-zonas.png'),
  ])
}

export const QUOTE_HEADLINE_SUFFIX_DEFAULT = 'corporativas con descuento por portabilidad.'

export function mobileLineCountPhrase(lines: number): string {
  const n = Math.max(0, Math.round(lines))
  return n === 1 ? '1 línea móvil' : `${n} líneas móviles`
}

/** Mix line sum, then the agent suffix. Empty suffix → `N líneas móviles.` */
export function mobileHeadline(lines: number, suffix?: string | null): string {
  const count = mobileLineCountPhrase(lines)
  const extra = suffix == null ? QUOTE_HEADLINE_SUFFIX_DEFAULT : suffix.trim()
  if (!extra) return `${count}.`
  return `${count} ${extra}`
}

/** Persist the suffix in greeting so extras in farewell stay intact. */
export function encodeHeadlineSuffixSnapshot(suffix: string): string {
  return JSON.stringify({ headlineSuffix: suffix })
}

export function decodeHeadlineSuffixSnapshot(greeting: string | null | undefined): string | undefined {
  const raw = (greeting ?? '').trim()
  if (!raw.startsWith('{')) return undefined
  try {
    const parsed = JSON.parse(raw) as { headlineSuffix?: unknown }
    if (typeof parsed?.headlineSuffix === 'string') return parsed.headlineSuffix
  } catch {
    return undefined
  }
  return undefined
}

/** Footer CEL. grouping like the sample: 987 963 762. */
export function formatQuoteCel(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 9) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  return phone.trim()
}

export const QUOTE_DEFAULT_CARGO = 'Ejecutivo de ventas'
export const QUOTE_CARGO_MAX = 80

/** Trim, drop controls, cap length. Empty means the PDF falls back to the default cargo. */
export function sanitizeQuoteCargo(raw: string | null | undefined): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, QUOTE_CARGO_MAX)
}

export function quoteDisplayCargo(raw: string | null | undefined): string {
  return sanitizeQuoteCargo(raw) || QUOTE_DEFAULT_CARGO
}

/** Natural / title-case name for the client stamp. Mixed case is left as typed. */
export function formatQuoteAgentName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '—'
  const hasLower = /[a-záéíóúüñ]/.test(trimmed)
  const hasUpper = /[A-ZÁÉÍÓÚÜÑ]/.test(trimmed)
  if (hasLower && hasUpper) return trimmed
  return trimmed
    .toLocaleLowerCase('es-PE')
    .replace(/(^|[\s'-])(\S)/g, (_match, prefix: string, letter: string) => prefix + letter.toLocaleUpperCase('es-PE'))
}

export const QUOTE_EMAIL_MAX = 120
const CONTACT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Profile Correo input. Empty → null (falls back to the login email). Lowercased and trimmed. */
export function parseContactEmail(raw: string | null | undefined): { email: string | null } | { error: string } {
  const value = String(raw ?? '').trim().toLowerCase()
  if (!value) return { email: null }
  if (value.length > QUOTE_EMAIL_MAX) return { error: `El correo no puede superar ${QUOTE_EMAIL_MAX} caracteres.` }
  if (!CONTACT_EMAIL_RE.test(value)) return { error: 'Correo inválido.' }
  return { email: value }
}

/** Drop controls and whitespace, lowercase, cap length. Used for the PDF snapshot, never throws. */
export function sanitizeQuoteSenderEmail(raw: string | null | undefined): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001F\u007F\s]/g, '')
    .toLowerCase()
    .slice(0, QUOTE_EMAIL_MAX)
}

/** Snapshot at register: profile Correo, else the login email. */
export function resolveQuoteSenderEmail(
  contactEmail: string | null | undefined,
  loginEmail: string | null | undefined
): string {
  return sanitizeQuoteSenderEmail(contactEmail) || sanitizeQuoteSenderEmail(loginEmail)
}

export function formatSoles(amount: number): string {
  const formatted = new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return `S/ ${formatted}`
}

export function formatLineCount(lines: number): string {
  const n = Math.max(0, Math.round(lines))
  return n === 1 ? '1 línea' : `${n} líneas`
}

/** History label: first catalog name, then how many other mix plans remain. */
export function mixHistoryPlanName(names: string[]): string {
  const cleaned = names.map((name) => name.trim()).filter(Boolean)
  if (cleaned.length === 0) return 'Oferta'
  if (cleaned.length === 1) return cleaned[0]
  return `${cleaned[0]} + ${cleaned.length - 1} más`
}

/** Mix block under the Excel table: plan · líneas · renta · subtotal, then the monthly total. */
export function formatMixSummaryLines(rows: QuotePdfPlanRow[]): string[] {
  const lines = rows.map(
    (row) =>
      `${row.name} · ${formatLineCount(row.lines)} · ${formatSoles(row.priceSoles)} · ${formatSoles(row.monthlySoles)}`
  )
  const total = rows.reduce((sum, row) => sum + row.monthlySoles, 0)
  lines.push(`Total mensual: ${formatSoles(total)}`)
  return lines
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function parseColors(value: unknown): QuotePdfColors | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const hex = (item: unknown): string | null => {
    if (typeof item !== 'string') return null
    const match = item.trim().match(/^#?([0-9A-Fa-f]{6})$/)
    return match ? `#${match[1].toUpperCase()}` : null
  }
  const cells: Record<string, string> = {}
  if (record.cells && typeof record.cells === 'object' && !Array.isArray(record.cells)) {
    for (const [key, item] of Object.entries(record.cells as Record<string, unknown>)) {
      const color = hex(item)
      const label = key.trim()
      if (label && color) cells[label] = color
    }
  }
  const header = hex(record.header)
  return {
    title: hex(record.title),
    header,
    headerText: hex(record.headerText) ?? inkOnFill(header),
    priceHeader:
      typeof record.priceHeader === 'string' && record.priceHeader.trim()
        ? record.priceHeader.trim()
        : 'Precio (S/)',
    row: hex(record.row),
    cells,
  }
}

export function normalizeQuotePlanRows(value: unknown): QuotePdfPlanRow[] {
  if (!Array.isArray(value)) return []
  const rows: QuotePdfPlanRow[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    const priceSoles = asNumber(record.priceSoles)
    const lines = asNumber(record.lines)
    const monthlySoles = asNumber(record.monthlySoles)
    if (!name || priceSoles == null || lines == null || monthlySoles == null) continue
    const benefits: QuotePdfBenefit[] = []
    if (Array.isArray(record.benefits)) {
      for (const benefit of record.benefits) {
        if (!benefit || typeof benefit !== 'object' || Array.isArray(benefit)) continue
        const row = benefit as Record<string, unknown>
        const label = typeof row.label === 'string' ? row.label : ''
        const cell = typeof row.value === 'string' ? row.value : ''
        if (!label) continue
        benefits.push({ label, value: cell })
      }
    }
    const origin = parseQuotePlanOrigin(record.origin)
    rows.push({
      name,
      priceSoles,
      lines: Math.max(1, Math.round(lines)),
      monthlySoles,
      proposed: record.proposed === true,
      benefits,
      colors: parseColors(record.colors),
      ...(origin ? { origin } : {}),
    })
  }
  return rows
}

function rowsForPdf(input: QuotePdfInput): QuotePdfPlanRow[] {
  const stored = input.planRows?.filter((row) => row.name.trim()) ?? []
  const rows = stored.length
    ? stored
    : [
        {
          name: input.planName,
          priceSoles: input.priceSoles,
          lines: input.lines,
          monthlySoles: input.totalSoles,
          proposed: true,
          benefits: input.benefits,
          colors: null,
        },
      ]
  return sortQuoteMixRows(rows)
}

function usableImagePath(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed || /^https?:/i.test(trimmed) || trimmed.includes('..')) return null
  if (!existsSync(trimmed)) return null
  return trimmed
}

function formatQuoteDate(date: Date): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: getAppTimezone(),
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
    .format(date)
    .replace(/\./g, '')
    .toUpperCase()
}

type TableCol = { key: string; header: string; width: number; align?: 'left' | 'right' | 'center' }

function layoutTableColumns(width: number, percent: number): TableCol[] {
  const showDcto = percent > 0
  const cols: { key: string; header: string; weight: number; align?: TableCol['align'] }[] = [
    { key: 'cant', header: 'CANT.', weight: 0.55, align: 'center' },
    { key: 'plan', header: 'PLAN', weight: 1.85, align: 'center' },
    { key: 'precio', header: 'PRECIO', weight: 0.9, align: 'right' },
  ]
  if (showDcto) {
    cols.push({ key: 'dcto', header: `${percent}% DCTO.`, weight: 0.95, align: 'right' })
  }
  cols.push(
    { key: 'minutos', header: 'MINUTOS', weight: 0.85, align: 'center' },
    { key: 'datos', header: 'INTERNET', weight: 0.75, align: 'center' },
    { key: 'internet', header: 'DATOS', weight: 0.85, align: 'center' },
    { key: 'apps', header: 'APPS', weight: 1.15 }
  )
  const sum = cols.reduce((total, col) => total + col.weight, 0)
  const out: TableCol[] = []
  let used = 0
  for (let i = 0; i < cols.length; i++) {
    const widthPx =
      i === cols.length - 1
        ? Math.max(18, Math.round((width - used) * 100) / 100)
        : Math.round(((width * cols[i].weight) / sum) * 100) / 100
    used += i === cols.length - 1 ? 0 : widthPx
    out.push({
      key: cols[i].key,
      header: cols[i].header,
      width: widthPx,
      align: cols[i].align,
    })
  }
  return out
}

export function quotePlanTableColumns(width: number, percent: number): TableCol[] {
  return layoutTableColumns(width, percent)
}

function cellHeight(doc: PdfDoc, text: string, width: number, font: string, size: number): number {
  doc.font(font).fontSize(size)
  return doc.heightOfString(text || '—', { width, lineGap: 0 })
}

function headerTextFrame(): { textX: number; textW: number } {
  const textX = MARGIN_X + HEADER_BOX_W + HEADER_TEXT_GAP
  return { textX, textW: HEADER_TEXT_RIGHT - textX }
}

function ellipsizeToWidth(doc: PdfDoc, text: string, width: number): string {
  const ellipsis = '...'
  if (doc.widthOfString(text) <= width) return text
  if (doc.widthOfString(ellipsis) > width) return ''
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (doc.widthOfString(text.slice(0, mid) + ellipsis) <= width) lo = mid
    else hi = mid - 1
  }
  return `${text.slice(0, lo)}${ellipsis}`
}

/** Word-wrap to at most `maxLines`; ellipsis only if it still overflows. Sets the font first. */
function wrapTextLines(
  doc: PdfDoc,
  raw: string,
  width: number,
  maxLines: number,
  font: string,
  size: number
): string[] {
  doc.font(font).fontSize(size)
  const name = raw.trim() || '—'
  const words = name.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let i = 0
  while (i < words.length && lines.length < maxLines) {
    let line = words[i]
    i += 1
    if (doc.widthOfString(line) > width) {
      lines.push(ellipsizeToWidth(doc, line, width))
      continue
    }
    while (i < words.length) {
      const trial = `${line} ${words[i]}`
      if (doc.widthOfString(trial) <= width) {
        line = trial
        i += 1
      } else {
        break
      }
    }
    const lastSlot = lines.length === maxLines - 1
    const more = i < words.length
    if (lastSlot && more) {
      const withDots = `${line}...`
      lines.push(doc.widthOfString(withDots) <= width ? withDots : ellipsizeToWidth(doc, line, width))
      break
    }
    lines.push(line)
  }
  return lines.length ? lines : ['—']
}

/** Word-wrap the razón social to at most three lines; ellipsis only if it still overflows. */
export function wrapQuoteCompanyLines(
  doc: PdfDoc,
  raw: string,
  width: number,
  maxLines = HEADER_COMPANY_MAX_LINES,
  size = HEADER_COMPANY_SIZE
): string[] {
  return wrapTextLines(doc, raw, width, maxLines, 'Helvetica-Bold', size)
}

/** Sender data frozen on the quote. Everything optional; empty email / cel drop their line. */
export type QuoteSenderInfo = { name: string; cargo: string; email: string; phone: string }

export type QuoteSenderLine = { text: string; font: string; size: number; y: number; height: number }

/** Lines of the page-1 sender block, y relative to the block top. */
export function layoutSenderBlock(doc: PdfDoc, sender: QuoteSenderInfo, width = HEADER_SENDER_W) {
  const lines: QuoteSenderLine[] = []
  let y = 0
  const push = (text: string, font: string, size: number, gap: number) => {
    doc.font(font).fontSize(size)
    const height = doc.currentLineHeight()
    if (lines.length) y += gap
    lines.push({ text, font, size, y, height })
    y += height
  }

  const nameLines = wrapTextLines(
    doc,
    formatQuoteAgentName(sender.name),
    width,
    SENDER_NAME_MAX_LINES,
    'Helvetica-Bold',
    SENDER_NAME_SIZE
  )
  nameLines.forEach((line, index) => push(line, 'Helvetica-Bold', SENDER_NAME_SIZE, index === 0 ? 0 : 0.5))

  doc.font('Helvetica').fontSize(SENDER_CARGO_SIZE)
  push(ellipsizeToWidth(doc, quoteDisplayCargo(sender.cargo), width), 'Helvetica', SENDER_CARGO_SIZE, SENDER_LINE_GAP)

  const email = sender.email.trim()
  if (email) {
    let size = SENDER_EMAIL_SIZE
    doc.font('Helvetica').fontSize(size)
    if (doc.widthOfString(email) > width) {
      size = SENDER_EMAIL_SIZE_MIN
      doc.font('Helvetica').fontSize(size)
    }
    push(ellipsizeToWidth(doc, email, width), 'Helvetica', size, SENDER_LINE_GAP)
  }

  const cel = sender.phone.trim()
  if (cel) {
    doc.font('Helvetica').fontSize(SENDER_CEL_SIZE)
    push(ellipsizeToWidth(doc, `Cel. ${formatQuoteCel(cel)}`, width), 'Helvetica', SENDER_CEL_SIZE, SENDER_LINE_GAP)
  }

  return { lines, height: y }
}

export type QuoteHeaderMetrics = {
  height: number
  companyY: number
  companyHeight: number
  companyLineCount: number
  companySize: number
  rucY: number
  lines: string[]
  /** Bottom of the left column (RUC line). */
  leftBottom: number
  /** Top of the sender block (vertically centred on the divider span). */
  senderTop: number
  senderHeight: number
  senderBottom: number
  senderLines: QuoteSenderLine[]
  /** White divider spans the header content height. */
  dividerTop: number
  dividerBottom: number
}

const EMPTY_SENDER: QuoteSenderInfo = { name: '', cargo: '', email: '', phone: '' }

/**
 * Page-1 red band. Three columns: logo box, title/company/RUC (HEADER_TEXT_RIGHT), sender block right of the
 * divider. Height = max(left column, sender block, logo) + padding, never below HEADER_H.
 */
export function measureQuoteHeader(
  doc: PdfDoc,
  companyName: string,
  sender: QuoteSenderInfo = EMPTY_SENDER
): QuoteHeaderMetrics {
  const { textW } = headerTextFrame()
  let companySize = HEADER_COMPANY_SIZE
  let lines = wrapQuoteCompanyLines(doc, companyName, textW, HEADER_COMPANY_MAX_LINES, companySize)
  if (lines.length > 2) {
    companySize = HEADER_COMPANY_SIZE_SMALL
    lines = wrapQuoteCompanyLines(doc, companyName, textW, HEADER_COMPANY_MAX_LINES, companySize)
  }
  doc.font('Helvetica-Bold').fontSize(companySize)
  const lineH = doc.currentLineHeight()
  const companyHeight = lineH * lines.length
  const rucY = HEADER_COMPANY_Y + companyHeight + HEADER_COMPANY_RUC_GAP
  doc.font('Helvetica').fontSize(HEADER_RUC_SIZE)
  const rucH = doc.currentLineHeight()
  const leftBottom = rucY + rucH
  const logoBottom = HEADER_BOX_Y + HEADER_BOX_H

  const block = layoutSenderBlock(doc, sender)
  const dividerTop = HEADER_BOX_Y
  const dividerBottom = Math.max(leftBottom, logoBottom, dividerTop + block.height)
  const senderTop = dividerTop + (dividerBottom - dividerTop - block.height) / 2
  const height = Math.max(HEADER_H, Math.ceil(dividerBottom + HEADER_PAD_BOTTOM))
  return {
    height,
    companyY: HEADER_COMPANY_Y,
    companyHeight,
    companyLineCount: lines.length,
    companySize,
    rucY,
    lines,
    leftBottom,
    senderTop,
    senderHeight: block.height,
    senderBottom: senderTop + block.height,
    senderLines: block.lines,
    dividerTop,
    dividerBottom,
  }
}

function withTempPdfDoc<T>(fn: (doc: PdfDoc) => T): T {
  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', compress: false })
  doc.on('data', () => undefined)
  const result = fn(doc)
  doc.end()
  return result
}

/** Header layout for tests (throwaway doc so font metrics match the sheet). */
export function quoteHeaderMetrics(companyName: string, sender?: QuoteSenderInfo): QuoteHeaderMetrics {
  return withTempPdfDoc((doc) => measureQuoteHeader(doc, companyName, sender))
}

function senderFromInput(input: QuotePdfInput): QuoteSenderInfo {
  return {
    name: input.senderName ?? '',
    cargo: input.senderCargo ?? '',
    email: input.senderEmail ?? '',
    phone: input.senderPhone ?? '',
  }
}

function drawHeader(doc: PdfDoc, input: QuotePdfInput, letterhead: string | null): number {
  const layout = measureQuoteHeader(doc, input.companyName, senderFromInput(input))
  const { textX, textW } = headerTextFrame()

  doc.save()
  doc.fillColor(ACCENT)
  doc.rect(0, 0, PAGE_W, layout.height).fill()
  doc.restore()

  const boxX = MARGIN_X
  doc.save()
  doc.fillColor('#FFFFFF')
  doc.roundedRect(boxX, HEADER_BOX_Y, HEADER_BOX_W, HEADER_BOX_H, 10).fill()
  doc.restore()
  if (letterhead) {
    try {
      doc.image(letterhead, boxX + 6, HEADER_BOX_Y + 5, {
        fit: [HEADER_BOX_W - 12, HEADER_BOX_H - 10],
        align: 'center',
        valign: 'center',
      })
    } catch {
      drawWordmark(doc, boxX, HEADER_BOX_Y, HEADER_BOX_W, HEADER_BOX_H)
    }
  } else {
    drawWordmark(doc, boxX, HEADER_BOX_Y, HEADER_BOX_W, HEADER_BOX_H)
  }

  doc.font('Helvetica-Bold').fontSize(16).fillColor('#FFFFFF')
  doc.text('PROPUESTA COMERCIAL', textX, HEADER_TITLE_Y, { width: textW, lineBreak: false })
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#FFFFFF')
  doc.text('PORTABILIDAD MÓVIL', textX, HEADER_SUBTITLE_Y, { width: textW, lineBreak: false })
  doc.font('Helvetica-Bold').fontSize(layout.companySize).fillColor('#FFFFFF')
  const lineH = doc.currentLineHeight()
  layout.lines.forEach((line, index) => {
    doc.text(line, textX, HEADER_COMPANY_Y + index * lineH, { width: textW, lineBreak: false })
  })
  const ruc = input.ruc.trim() ? `RUC ${input.ruc.trim()}` : 'RUC —'
  const when = formatQuoteDate(input.issuedAt ?? new Date())
  doc.font('Helvetica').fontSize(HEADER_RUC_SIZE).fillColor('#FFFFFF')
  doc.text(`${ruc}  |  ${when}`, textX, layout.rucY, { width: textW, lineBreak: false })

  // Thin white vertical divider, then the sender block (left-aligned, white, no box).
  doc.save()
  doc.strokeColor('#FFFFFF')
  doc.lineWidth(HEADER_DIVIDER_W)
  doc.moveTo(HEADER_DIVIDER_X, layout.dividerTop).lineTo(HEADER_DIVIDER_X, layout.dividerBottom).stroke()
  doc.restore()
  for (const line of layout.senderLines) {
    doc.font(line.font).fontSize(line.size).fillColor('#FFFFFF')
    doc.text(line.text, HEADER_SENDER_X, layout.senderTop + line.y, {
      width: HEADER_SENDER_W,
      align: 'left',
      lineBreak: false,
    })
  }
  return layout.height
}

/** One-line continuation chrome: logo + PROPUESTA COMERCIAL + ellipsized razón social. */
function drawContinuationHeader(doc: PdfDoc, companyName: string, letterhead: string | null): number {
  const height = CONT_HEADER_H
  doc.save()
  doc.fillColor(ACCENT)
  doc.rect(0, 0, PAGE_W, height).fill()
  doc.restore()

  const boxX = MARGIN_X
  const boxY = (height - CONT_HEADER_BOX_H) / 2
  doc.save()
  doc.fillColor('#FFFFFF')
  doc.roundedRect(boxX, boxY, CONT_HEADER_BOX_W, CONT_HEADER_BOX_H, 6).fill()
  doc.restore()
  if (letterhead) {
    try {
      doc.image(letterhead, boxX + 4, boxY + 3, {
        fit: [CONT_HEADER_BOX_W - 8, CONT_HEADER_BOX_H - 6],
        align: 'center',
        valign: 'center',
      })
    } catch {
      drawWordmark(doc, boxX, boxY, CONT_HEADER_BOX_W, CONT_HEADER_BOX_H)
    }
  } else {
    drawWordmark(doc, boxX, boxY, CONT_HEADER_BOX_W, CONT_HEADER_BOX_H)
  }

  const textX = boxX + CONT_HEADER_BOX_W + CONT_HEADER_TEXT_GAP
  const textRight = PAGE_W - MARGIN_X
  doc.font('Helvetica-Bold').fontSize(CONT_TITLE_SIZE).fillColor('#FFFFFF')
  const title = 'PROPUESTA COMERCIAL'
  const titleW = doc.widthOfString(title)
  const titleH = doc.currentLineHeight()
  doc.text(title, textX, (height - titleH) / 2, { width: titleW + 2, lineBreak: false })

  const companyX = textX + titleW + CONT_TITLE_COMPANY_GAP
  const companyW = Math.max(24, textRight - companyX)
  doc.font('Helvetica-Bold').fontSize(CONT_COMPANY_SIZE).fillColor('#FFFFFF')
  const companyH = doc.currentLineHeight()
  const company = ellipsizeToWidth(doc, companyName.trim() || '—', companyW)
  doc.text(company, companyX, (height - companyH) / 2, { width: companyW, lineBreak: false })
  return height
}

function drawWordmark(doc: PdfDoc, x: number, y: number, w: number, h: number) {
  const titleSize = h >= 48 ? 16 : 11
  const subSize = h >= 48 ? 10 : 7
  const titleOffset = h >= 48 ? 16 : 10
  doc.font('Helvetica-Bold').fontSize(titleSize).fillColor(ACCENT)
  doc.text('Claro', x, y + h / 2 - titleOffset, { width: w, align: 'center', lineBreak: false })
  doc.font('Helvetica-Bold').fontSize(subSize).fillColor(INK)
  doc.text('empresas', x, y + h / 2 + 2, { width: w, align: 'center', lineBreak: false })
}

function drawKpiBand(doc: PdfDoc, y: number, total: number, percent: number): number {
  const h = percent > 0 ? 56 : 52
  doc.save()
  doc.fillColor(KPI_FILL)
  doc.roundedRect(MARGIN_X, y, CONTENT_W, h, 10).fill()
  doc.restore()
  const leftW = percent > 0 ? CONTENT_W * 0.52 : CONTENT_W
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY)
  doc.text('FACTURACIÓN MENSUAL', MARGIN_X + 18, y + 12, { width: leftW - 26, lineBreak: false })
  doc.font('Helvetica-Bold').fontSize(20).fillColor(ACCENT)
  doc.text(formatSoles(total), MARGIN_X + 18, y + 26, { width: leftW - 26, lineBreak: false })
  if (percent > 0) {
    const rightX = MARGIN_X + leftW
    doc.font('Helvetica-Bold').fontSize(13).fillColor(ACCENT)
    doc.text(`${percent}% DE DESCUENTO`, rightX, y + 16, { width: CONTENT_W - leftW - 18, lineBreak: false })
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
    doc.text('En cada línea de la propuesta', rightX, y + 34, {
      width: CONTENT_W - leftW - 18,
      lineBreak: false,
    })
  }
  return y + h
}

function tableCellText(
  row: QuotePdfPlanRow,
  key: string,
  percent: number
): { text: string; color: string; strike?: boolean; font?: string } {
  if (key === 'cant') return { text: String(row.lines), color: INK, font: 'Helvetica-Bold' }
  if (key === 'plan') {
    return { text: row.name, color: INK, font: 'Helvetica-Bold' }
  }
  if (key === 'precio') {
    return {
      text: formatSoles(row.priceSoles),
      color: percent > 0 ? MUTED : INK,
      strike: percent > 0,
    }
  }
  if (key === 'dcto') {
    return {
      text: formatSoles(quoteDiscountedUnit(row.priceSoles, percent)),
      color: ACCENT,
      font: 'Helvetica-Bold',
    }
  }
  if (key === 'minutos') return { text: displayBenefit(quotePlanMinutes(row.benefits)), color: INK }
  if (key === 'datos') {
    return { text: displayDatosBenefit(quotePlanData(row.benefits, row.origin)), color: INK }
  }
  if (key === 'internet') {
    return { text: displayBenefit(quotePlanInternet(row.benefits, row.origin)), color: INK }
  }
  if (key === 'apps') return { text: displayBenefit(quotePlanAppsShort(row.benefits)), color: ACCENT }
  return { text: '—', color: INK }
}

const TABLE_PAD_X = 5
/** Was 3. With TABLE_ROW_MIN a single-line body row is ~20 pt instead of ~24 pt. */
const TABLE_PAD_Y = 2
const TABLE_BODY_SIZE = 8
const TABLE_HEADER_SIZE = 7.2
const TABLE_ROW_MIN = 16
const TABLE_HEADER_MIN = 18

function tableHeaderMetrics(doc: PdfDoc, cols: TableCol[]): { h: number; heights: number[] } {
  const heights = cols.map((col) =>
    cellHeight(doc, col.header, Math.max(10, col.width - TABLE_PAD_X * 2), 'Helvetica-Bold', TABLE_HEADER_SIZE)
  )
  return { h: Math.max(TABLE_HEADER_MIN, ...heights) + TABLE_PAD_Y * 2, heights }
}

function tableRowMetrics(
  doc: PdfDoc,
  cols: TableCol[],
  row: QuotePdfPlanRow,
  percent: number
): { h: number; heights: number[]; values: ReturnType<typeof tableCellText>[] } {
  const values = cols.map((col) => tableCellText(row, col.key, percent))
  const heights = values.map((cell, i) =>
    cellHeight(doc, cell.text, Math.max(10, cols[i].width - TABLE_PAD_X * 2), cell.font || 'Helvetica', TABLE_BODY_SIZE)
  )
  return { h: Math.max(TABLE_ROW_MIN, ...heights) + TABLE_PAD_Y * 2, heights, values }
}

function planTableHeight(doc: PdfDoc, rows: QuotePdfPlanRow[], percent: number): number {
  const cols = layoutTableColumns(CONTENT_W, percent)
  let h = tableHeaderMetrics(doc, cols).h
  for (const row of rows) h += tableRowMetrics(doc, cols, row, percent).h
  return h
}

function drawPlanTable(doc: PdfDoc, rows: QuotePdfPlanRow[], percent: number, yStart: number): number {
  const cols = layoutTableColumns(CONTENT_W, percent)
  const padX = TABLE_PAD_X
  const bodySize = TABLE_BODY_SIZE
  const headerSize = TABLE_HEADER_SIZE
  let y = yStart

  const paintHeader = () => {
    const { h, heights } = tableHeaderMetrics(doc, cols)
    ensureSpace(doc, y, h + 8)
    y = doc.y
    doc.save()
    doc.fillColor(NAVY)
    doc.roundedRect(MARGIN_X, y, CONTENT_W, h, 8).fill()
    doc.restore()
    let x = MARGIN_X
    cols.forEach((col, i) => {
      doc.font('Helvetica-Bold').fontSize(headerSize).fillColor('#FFFFFF')
      doc.text(col.header, x + padX, y + (h - heights[i]) / 2, {
        width: Math.max(10, col.width - padX * 2),
        align: col.align ?? 'left',
        lineGap: 0,
      })
      x += col.width
    })
    y += h
    doc.y = y
  }

  paintHeader()
  for (let index = 0; index < rows.length; index++) {
    const { h, heights, values } = tableRowMetrics(doc, cols, rows[index], percent)
    ensureSpace(doc, y, h + 6)
    y = doc.y
    if (index % 2 === 1) {
      doc.save()
      doc.fillColor('#F7F8FA')
      doc.rect(MARGIN_X, y, CONTENT_W, h).fill()
      doc.restore()
    }
    let x = MARGIN_X
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i]
      const cell = values[i]
      doc.font(cell.font || 'Helvetica').fontSize(bodySize).fillColor(cell.color)
      doc.text(cell.text, x + padX, y + (h - heights[i]) / 2, {
        width: Math.max(10, col.width - padX * 2),
        align: col.key === 'plan' ? 'left' : col.align ?? 'left',
        lineGap: 0,
        strike: cell.strike === true,
      })
      x += col.width
    }
    y += h
    doc.y = y
  }
  return y
}

function ensureSpace(doc: PdfDoc, y: number, needed: number) {
  if (y + needed <= PAGE_BOTTOM) {
    doc.y = y
    return
  }
  doc.addPage()
  doc.y = contentTop(doc)
}

/** Move the whole block to the next page when it does not fit. Do not add a blank page if already at the top. */
function startKeepTogether(doc: PdfDoc, y: number, needed: number): number {
  if (y + needed <= PAGE_BOTTOM) {
    doc.y = y
    return y
  }
  if (y <= contentTop(doc) + 0.5) {
    doc.y = y
    return y
  }
  doc.addPage()
  const top = contentTop(doc)
  doc.y = top
  return top
}

const SECTION_BADGE = 24
const SECTION_BADGE_R = 7
const APPS_ROW_H = 26
const APPS_BLOCK_PAD = 12
const ROAM_CARD_H = 62

function sectionTitleHeight(sp: PageSpacing): number {
  return SECTION_BADGE + sp.titleGap
}

function roamingCardRowCount(planCount: number): number {
  const cols = Math.min(3, Math.max(1, planCount))
  return Math.ceil(planCount / cols)
}

function roamingCardsHeight(planCount: number, sp: PageSpacing): number {
  const rows = roamingCardRowCount(planCount)
  if (rows <= 0) return sp.roamAfter
  return rows * ROAM_CARD_H + (rows - 1) * sp.roamGap + sp.roamAfter
}

function appsListHeight(rowCount: number, sp: PageSpacing): number {
  return rowCount * APPS_ROW_H + APPS_BLOCK_PAD + sp.appsAfter
}

function extrasBlockHeight(doc: PdfDoc, extras: string): number {
  const body = extras.trim()
  if (!body) return 0
  doc.font('Helvetica').fontSize(10)
  const textH = doc.heightOfString(body, { width: CONTENT_W, lineGap: 2 })
  return 28 + textH + 10
}

const ZONES_TITLE = 'Zonas de roaming internacional'
const ZONES_AFTER = 8

function pngPixelSize(file: string): { width: number; height: number } {
  const buf = readFileSync(file)
  if (buf.length < 24) return { width: 1, height: 1 }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

type ZonesMetrics = {
  /** Section title band (badge + gap) for the spacing set in use. */
  titleH: number
  /** Natural (scale 1) image box. */
  imgW: number
  imgH: number
}

function roamingZonesMetrics(imagePath: string, sp: PageSpacing): ZonesMetrics {
  const image = pngPixelSize(imagePath)
  const imgW = CONTENT_W
  const imgH = image.width > 0 ? (image.height / image.width) * imgW : 0
  return { titleH: sectionTitleHeight(sp), imgW, imgH }
}

/** Height of title + map at the given scale (excludes the trailing doc.y gap). */
function zonesBlockHeight(zones: ZonesMetrics, scale: number): number {
  return zones.titleH + zones.imgH * scale
}

/** Where page 1 ends (doc.y) for a given spacing/breathing/map-scale plan, assuming everything stays on page 1. */
function measurePage1EndY(
  doc: PdfDoc,
  headerHeight: number,
  rows: QuotePdfPlanRow[],
  percent: number,
  extras: string,
  sp: PageSpacing,
  breathing: number,
  zones: { metrics: ZonesMetrics; scale: number } | null
): number {
  let y = headerHeight + HEADER_AFTER
  doc.font('Helvetica-Bold').fontSize(16)
  y += doc.heightOfString('Conectividad y beneficios para tu empresa', { width: CONTENT_W, lineGap: 0 })
  y += sp.afterTitle
  doc.font('Helvetica').fontSize(11)
  y += doc.currentLineHeight(true)
  y += sp.afterHeadline
  y += percent > 0 ? 56 : 52
  y += sp.afterKpi + breathing
  y += sectionTitleHeight(sp)
  y += planTableHeight(doc, rows, percent)
  y += sp.afterTable + breathing
  y += sectionTitleHeight(sp) + roamingCardsHeight(rows.length, sp)
  y += breathing
  y += sectionTitleHeight(sp) + appsListHeight(rows.length, sp)
  y += extrasBlockHeight(doc, extras)
  if (zones) y += zonesBlockHeight(zones.metrics, zones.scale)
  return y
}

export type QuotePage1Layout = {
  spacing: PageSpacing
  breathing: number
  /** 1 = natural size; floor QUOTE_MAP_MIN_SCALE. Only below 1 when it is the only way to keep the map on page 1. */
  mapScale: number
  /** True when the plan keeps the flags map on page 1. */
  mapOnPage1: boolean
}

/**
 * Decide page-1 spacing. Rows are always compact (see TABLE_PAD_Y). Then, in order:
 *  1. normal gaps (+ breathing only if the map still fits with it),
 *  2. tight gaps with the map at 100 %,
 *  3. tight gaps with the map scaled down to at most 15 %,
 *  4. otherwise the map moves whole to page 2 and page 1 keeps normal gaps / breathing for the body.
 */
function choosePage1Layout(
  doc: PdfDoc,
  headerHeight: number,
  rows: QuotePdfPlanRow[],
  percent: number,
  extras: string,
  zonesPath: string | null
): QuotePage1Layout {
  const hasZones = Boolean(zonesPath) && mixHasRoaming(rows)
  if (hasZones && zonesPath) {
    const normalZones = { metrics: roamingZonesMetrics(zonesPath, SPACING_NORMAL), scale: 1 }
    const fitsNormal = (breathing: number) =>
      measurePage1EndY(doc, headerHeight, rows, percent, extras, SPACING_NORMAL, breathing, normalZones) <=
      PAGE_BOTTOM
    if (fitsNormal(0)) {
      return {
        spacing: SPACING_NORMAL,
        breathing: fitsNormal(PAGE1_BREATHING_PT) ? PAGE1_BREATHING_PT : 0,
        mapScale: 1,
        mapOnPage1: true,
      }
    }
    const tightMetrics = roamingZonesMetrics(zonesPath, SPACING_TIGHT)
    const tightBodyEnd = measurePage1EndY(doc, headerHeight, rows, percent, extras, SPACING_TIGHT, 0, null)
    const room = PAGE_BOTTOM - tightBodyEnd - tightMetrics.titleH - 0.5
    if (room > 0 && tightMetrics.imgH > 0) {
      const fullScale = room / tightMetrics.imgH
      if (fullScale >= 1) {
        return { spacing: SPACING_TIGHT, breathing: 0, mapScale: 1, mapOnPage1: true }
      }
      // Tiny safety margin so float noise never pushes the map to page 2.
      const scale = Math.floor(fullScale * 1000) / 1000 - 0.001
      if (scale >= QUOTE_MAP_MIN_SCALE) {
        return { spacing: SPACING_TIGHT, breathing: 0, mapScale: scale, mapOnPage1: true }
      }
    }
  }
  const bodyGrown = measurePage1EndY(
    doc,
    headerHeight,
    rows,
    percent,
    extras,
    SPACING_NORMAL,
    PAGE1_BREATHING_PT,
    null
  )
  return {
    spacing: SPACING_NORMAL,
    breathing: bodyGrown > PAGE_BOTTOM ? 0 : PAGE1_BREATHING_PT,
    mapScale: 1,
    mapOnPage1: false,
  }
}

/** Test hook: the page-1 plan for a given mix, using the same metrics as the renderer. */
export function quotePage1Layout(input: QuotePdfInput): QuotePage1Layout & { headerHeight: number } {
  return withTempPdfDoc((doc) => {
    const rows = rowsForPdf(input)
    const percent = normalizeQuoteDiscountPercent(input.discountPercent)
    const header = measureQuoteHeader(doc, input.companyName, senderFromInput(input))
    const layout = choosePage1Layout(
      doc,
      header.height,
      rows,
      percent,
      (input.extras || '').trim(),
      bundledRoamingZonesPath()
    )
    return { ...layout, headerHeight: header.height }
  })
}

function paintSectionTitle(doc: PdfDoc, n: number, title: string, y: number): number {
  doc.save()
  doc.fillColor(ACCENT)
  doc.roundedRect(MARGIN_X, y, SECTION_BADGE, SECTION_BADGE, SECTION_BADGE_R).fill()
  doc.restore()
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#FFFFFF')
  const numH = doc.currentLineHeight()
  doc.text(String(n), MARGIN_X, y + (SECTION_BADGE - numH) / 2, {
    width: SECTION_BADGE,
    align: 'center',
    lineBreak: false,
  })
  doc.font('Helvetica-Bold').fontSize(13).fillColor(INK)
  const titleH = doc.currentLineHeight()
  doc.text(title, MARGIN_X + SECTION_BADGE + 10, y + (SECTION_BADGE - titleH) / 2, {
    width: CONTENT_W - SECTION_BADGE - 10,
    lineBreak: false,
  })
  doc.y = y + sectionTitleHeight(spacingOf(doc))
  return doc.y
}

function sectionTitle(doc: PdfDoc, n: number, title: string, y: number): number {
  ensureSpace(doc, y, SECTION_BADGE + 16)
  return paintSectionTitle(doc, n, title, doc.y)
}

function paintAppRows(doc: PdfDoc, rows: QuotePdfPlanRow[], y: number, from: number, count: number) {
  const h = count * APPS_ROW_H + APPS_BLOCK_PAD
  doc.save()
  doc.fillColor(CARD_FILL)
  doc.roundedRect(MARGIN_X, y, CONTENT_W, h, 10).fill()
  doc.restore()
  for (let i = 0; i < count; i++) {
    const row = rows[from + i]
    if (!row) continue
    const top = y + 8 + i * APPS_ROW_H
    doc.font('Helvetica-Bold').fontSize(9).fillColor(ACCENT)
    doc.text(row.name, MARGIN_X + 14, top + 6, { width: 150, lineBreak: false })
    doc.font('Helvetica').fontSize(9).fillColor(INK)
    doc.text(displayBenefit(quotePlanApps(row.benefits)), MARGIN_X + 172, top + 6, {
      width: CONTENT_W - 196,
      lineGap: 0,
    })
  }
}

function drawRoamingSection(doc: PdfDoc, rows: QuotePdfPlanRow[], y: number): number {
  const sp = spacingOf(doc)
  const needed = sectionTitleHeight(sp) + roamingCardsHeight(rows.length, sp)
  y = startKeepTogether(doc, y, needed)
  y = paintSectionTitle(doc, 2, 'Roaming internacional', y)
  return drawRoaming(doc, rows, y)
}

function drawAppsSection(doc: PdfDoc, rows: QuotePdfPlanRow[], y: number): number {
  const sp = spacingOf(doc)
  const needed = sectionTitleHeight(sp) + appsListHeight(rows.length, sp)
  y = startKeepTogether(doc, y, needed)
  y = paintSectionTitle(doc, 3, 'Aplicaciones ilimitadas por plan', y)
  return drawApps(doc, rows, y)
}

function drawRoaming(doc: PdfDoc, rows: QuotePdfPlanRow[], y: number): number {
  const sp = spacingOf(doc)
  const cols = Math.min(3, Math.max(1, rows.length))
  const cardW = (CONTENT_W - sp.roamGap * (cols - 1)) / cols
  let x = MARGIN_X
  let rowY = y
  rows.forEach((row, index) => {
    if (index % cols === 0) {
      if (index > 0) {
        rowY += ROAM_CARD_H + sp.roamGap
        x = MARGIN_X
      }
      if (rowY + ROAM_CARD_H > PAGE_BOTTOM) {
        doc.addPage()
        rowY = contentTop(doc)
        x = MARGIN_X
      }
    }
    const roam = quotePlanRoaming(row.benefits)
    doc.save()
    doc.fillColor(CARD_FILL)
    doc.roundedRect(x, rowY, cardW, ROAM_CARD_H, 10).fill()
    doc.restore()
    doc.font('Helvetica-Bold').fontSize(9).fillColor(ACCENT)
    doc.text(row.name, x + 12, rowY + 10, { width: cardW - 24, lineBreak: false })
    const min = displayBenefit(roam.min)
    const inet = displayBenefit(roam.internet)
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
    doc.text(`${min}  |  ${inet}`, x + 12, rowY + 28, { width: cardW - 24, lineBreak: false })
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
    doc.text(displayBenefit(roam.sms), x + 12, rowY + 44, { width: cardW - 24, lineBreak: false })
    x += cardW + sp.roamGap
  })
  doc.y = rowY + ROAM_CARD_H + sp.roamAfter
  return doc.y
}

function drawApps(doc: PdfDoc, rows: QuotePdfPlanRow[], y: number): number {
  const sp = spacingOf(doc)
  if (rows.length === 0) {
    doc.y = y
    return y
  }
  const fullH = rows.length * APPS_ROW_H + APPS_BLOCK_PAD
  if (y + fullH <= PAGE_BOTTOM) {
    paintAppRows(doc, rows, y, 0, rows.length)
    doc.y = y + fullH + sp.appsAfter
    return doc.y
  }

  let index = 0
  while (index < rows.length) {
    const available = PAGE_BOTTOM - y
    const maxRows = Math.max(1, Math.floor((available - APPS_BLOCK_PAD) / APPS_ROW_H))
    const count = Math.min(maxRows, rows.length - index)
    const h = count * APPS_ROW_H + APPS_BLOCK_PAD
    if (y + h > PAGE_BOTTOM) {
      doc.addPage()
      y = contentTop(doc)
      continue
    }
    paintAppRows(doc, rows, y, index, count)
    index += count
    y = y + h + sp.appsAfter
    if (index < rows.length) {
      doc.addPage()
      y = contentTop(doc)
    }
  }
  doc.y = y
  return y
}

function drawExtras(doc: PdfDoc, extras: string, y: number): number {
  const body = extras.trim()
  if (!body) return y
  const textH = cellHeight(doc, body, CONTENT_W, 'Helvetica', 10)
  const h = 18 + textH + 8
  ensureSpace(doc, y, h)
  y = doc.y
  doc.save()
  doc.strokeColor('#E6E8EC')
  doc.lineWidth(0.8)
  doc.moveTo(MARGIN_X, y).lineTo(MARGIN_X + CONTENT_W, y).stroke()
  doc.restore()
  doc.font('Helvetica-Bold').fontSize(9).fillColor(ACCENT)
  doc.text('BENEFICIOS ADICIONALES', MARGIN_X, y + 12, { width: CONTENT_W, lineBreak: false })
  doc.font('Helvetica').fontSize(10).fillColor(INK)
  doc.text(body, MARGIN_X, y + 28, { width: CONTENT_W, lineGap: 2 })
  doc.y = doc.y + 10
  return doc.y
}

/**
 * Title glued to the flags graphic (section badge 4 after Planes, Roaming, Apps).
 * Measure first; if the pair does not fit, move the entire block. Never split the map.
 * `scale` (0.85–1) is only used when the pair then fits on the current page; on a new page it is 100 %.
 */
function drawRoamingZones(doc: PdfDoc, y: number, imagePath: string, scale = 1): number {
  const metrics = roamingZonesMetrics(imagePath, spacingOf(doc))
  let useScale = scale
  if (y + zonesBlockHeight(metrics, useScale) > PAGE_BOTTOM + 0.01) useScale = 1
  let imgW = metrics.imgW * useScale
  let imgH = metrics.imgH * useScale

  y = startKeepTogether(doc, y, zonesBlockHeight(metrics, useScale))

  const available = PAGE_BOTTOM - y
  const needed = zonesBlockHeight(metrics, useScale)
  if (needed > available && imgH > 0) {
    const maxImg = Math.max(80, available - metrics.titleH)
    const shrink = maxImg / imgH
    imgH *= shrink
    imgW *= shrink
  }

  y = paintSectionTitle(doc, 4, ZONES_TITLE, y)
  const imgX = MARGIN_X + (CONTENT_W - imgW) / 2
  const imgY = y
  doc.image(imagePath, imgX, imgY, { width: imgW, height: imgH })
  doc.y = imgY + imgH + ZONES_AFTER
  return doc.y
}

export function renderQuotePdf(input: QuotePdfInput, options?: { compress?: boolean }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margins: { top: 0, right: MARGIN_X, bottom: 0, left: MARGIN_X },
      compress: options?.compress !== false,
      info: {
        Title: 'Propuesta comercial',
        Author: 'Claro Empresas',
        Creator: 'Claro Empresas',
      },
    })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const rows = rowsForPdf(input)
    const percent = normalizeQuoteDiscountPercent(input.discountPercent)
    const totalLines = rows.reduce((sum, row) => sum + row.lines, 0)
    const discountedTotal = rows.reduce(
      (sum, row) => sum + quoteDiscountedLineTotal(row.priceSoles, row.lines, percent),
      0
    )
    const letterhead = bundledClaroLogoPath() ?? usableImagePath(input.letterheadPath)
    const extras = (input.extras || '').trim()
    const zonesPath = bundledRoamingZonesPath()

    let headerHeight = HEADER_H
    const paintPageChrome = (first: boolean) => {
      if (first) {
        headerHeight = drawHeader(doc, input, letterhead)
        setContentTop(doc, headerHeight + HEADER_AFTER)
      } else {
        const contH = drawContinuationHeader(doc, input.companyName, letterhead)
        setContentTop(doc, contH + CONT_HEADER_AFTER)
      }
    }
    paintPageChrome(true)
    doc.on('pageAdded', () => paintPageChrome(false))

    const plan = choosePage1Layout(doc, headerHeight, rows, percent, extras, zonesPath)
    const sp = plan.spacing
    const breathing = plan.breathing
    pageSpacing.set(doc, sp)

    let y = headerHeight + HEADER_AFTER
    doc.x = MARGIN_X
    doc.y = y

    doc.font('Helvetica-Bold').fontSize(16).fillColor(INK)
    doc.text('Conectividad y beneficios para tu empresa', MARGIN_X, y, { width: CONTENT_W, lineGap: 0 })
    y = doc.y + sp.afterTitle
    doc.font('Helvetica').fontSize(11).fillColor(MUTED)
    doc.text(mobileHeadline(totalLines, input.headlineSuffix), MARGIN_X, y, { width: CONTENT_W, lineBreak: false })
    y = doc.y + sp.afterHeadline

    y = drawKpiBand(doc, y, discountedTotal, percent) + sp.afterKpi + breathing
    doc.y = y

    y = sectionTitle(doc, 1, 'Planes, precios y beneficios incluidos', doc.y)
    y = drawPlanTable(doc, rows, percent, y) + sp.afterTable + breathing
    doc.y = y

    y = drawRoamingSection(doc, rows, doc.y)
    y += breathing
    doc.y = y

    y = drawAppsSection(doc, rows, doc.y)
    doc.y = y

    y = drawExtras(doc, extras, doc.y)
    doc.y = y

    if (mixHasRoaming(rows) && zonesPath) {
      drawRoamingZones(doc, doc.y, zonesPath, plan.mapOnPage1 ? plan.mapScale : 1)
    }

    doc.end()
  })
}

/** ASCII download name. Preview inserts the `prueba` token; the registrar name does not. */
export function quotePdfFilename(ruc: string, preview: boolean): string {
  const slug = (value: string, fallback: string) => {
    const cleaned = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
    return cleaned || fallback
  }
  const token = preview ? '-prueba' : ''
  return `Propuesta${token}-${slug(ruc, 'sin-ruc')}.pdf`
}
