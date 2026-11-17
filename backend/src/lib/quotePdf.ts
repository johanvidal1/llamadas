import { existsSync } from 'fs'
import path from 'path'
import PDFDocument from 'pdfkit'
import { inkOnFill, type OfferPlanColors } from './offerPlanWorkbook'
import {
  displayBenefit,
  normalizeQuoteDiscountPercent,
  quoteDiscountedLineTotal,
  quoteDiscountedUnit,
  quotePlanApps,
  quotePlanAppsShort,
  quotePlanData,
  quotePlanInternet,
  quotePlanMinutes,
  quotePlanRoaming,
} from './quoteDiscount'
import { getAppTimezone } from './appTimezone'

export {
  quoteDiscountedLineTotal,
  quoteDiscountedUnit,
  quoteLineTotal,
  normalizeQuoteDiscountPercent,
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
const HEADER_H = 96
const FOOTER_H = 32
const CONTENT_W = PAGE_W - MARGIN_X * 2

/** Bundled Claro Empresas mark. Never fall back to an OPTICK letterhead. */
export function bundledClaroLogoPath(): string | null {
  const files = [
    path.resolve(__dirname, '../../assets/claro-empresas-logo.png'),
    path.resolve(process.cwd(), 'assets/claro-empresas-logo.png'),
    path.resolve(process.cwd(), 'backend/assets/claro-empresas-logo.png'),
  ]
  return files.find((file) => existsSync(file)) ?? null
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
    rows.push({
      name,
      priceSoles,
      lines: Math.max(1, Math.round(lines)),
      monthlySoles,
      proposed: record.proposed === true,
      benefits,
      colors: parseColors(record.colors),
    })
  }
  return rows
}

function rowsForPdf(input: QuotePdfInput): QuotePdfPlanRow[] {
  const stored = input.planRows?.filter((row) => row.name.trim()) ?? []
  if (stored.length) return stored
  return [
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
    { key: 'plan', header: 'PLAN', weight: 1.85 },
    { key: 'precio', header: 'PRECIO', weight: 0.9, align: 'right' },
  ]
  if (showDcto) {
    cols.push({ key: 'dcto', header: `${percent}% DCTO.`, weight: 0.95, align: 'right' })
  }
  cols.push(
    { key: 'minutos', header: 'MINUTOS', weight: 0.85, align: 'center' },
    { key: 'datos', header: 'DATOS', weight: 0.75, align: 'center' },
    { key: 'internet', header: 'INTERNET', weight: 0.85, align: 'center' },
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

function cellHeight(doc: PdfDoc, text: string, width: number, font: string, size: number): number {
  doc.font(font).fontSize(size)
  return doc.heightOfString(text || '—', { width, lineGap: 0 })
}

function drawHeader(doc: PdfDoc, input: QuotePdfInput, letterhead: string | null) {
  doc.save()
  doc.fillColor(ACCENT)
  doc.rect(0, 0, PAGE_W, HEADER_H).fill()
  doc.restore()

  const boxX = MARGIN_X
  const boxY = 16
  const boxW = 122
  const boxH = 64
  doc.save()
  doc.fillColor('#FFFFFF')
  doc.roundedRect(boxX, boxY, boxW, boxH, 10).fill()
  doc.restore()
  if (letterhead) {
    try {
      doc.image(letterhead, boxX + 6, boxY + 5, { fit: [boxW - 12, boxH - 10], align: 'center', valign: 'center' })
    } catch {
      drawWordmark(doc, boxX, boxY, boxW, boxH)
    }
  } else {
    drawWordmark(doc, boxX, boxY, boxW, boxH)
  }

  const textX = boxX + boxW + 18
  const textW = PAGE_W - textX - MARGIN_X
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#FFFFFF')
  doc.text('PROPUESTA COMERCIAL', textX, 20, { width: textW, lineBreak: false })
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#FFFFFF')
  doc.text('PORTABILIDAD MÓVIL', textX, 40, { width: textW, lineBreak: false })
  const company = input.companyName.trim() || '—'
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#FFFFFF')
  doc.text(company, textX, 58, { width: textW, lineBreak: false })
  const ruc = input.ruc.trim() ? `RUC ${input.ruc.trim()}` : 'RUC —'
  const when = formatQuoteDate(input.issuedAt ?? new Date())
  doc.font('Helvetica').fontSize(9).fillColor('#FFFFFF')
  doc.text(`${ruc}  |  ${when}`, textX, 76, { width: textW, lineBreak: false })
}

function drawWordmark(doc: PdfDoc, x: number, y: number, w: number, h: number) {
  doc.font('Helvetica-Bold').fontSize(16).fillColor(ACCENT)
  doc.text('Claro', x, y + h / 2 - 16, { width: w, align: 'center', lineBreak: false })
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
  doc.text('empresas', x, y + h / 2 + 2, { width: w, align: 'center', lineBreak: false })
}

function drawFooter(doc: PdfDoc, sender: string, phone: string) {
  const y = PAGE_H - FOOTER_H
  const bottom = doc.page.margins.bottom
  const top = doc.page.margins.top
  doc.page.margins.bottom = 0
  doc.page.margins.top = 0
  doc.save()
  doc.fillColor(NAVY)
  doc.rect(0, y, PAGE_W, FOOTER_H).fill()
  doc.restore()
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF')
  const who = (sender.trim() || '—').toUpperCase()
  doc.text(`EJECUTIVO COMERCIAL: ${who}`, MARGIN_X, y + 11, {
    width: CONTENT_W * 0.62,
    lineBreak: false,
    height: 14,
  })
  const cel = phone.trim()
  if (cel) {
    doc.text(`CEL. ${formatQuoteCel(cel)}`, MARGIN_X + CONTENT_W * 0.62, y + 11, {
      width: CONTENT_W * 0.38,
      align: 'right',
      lineBreak: false,
      height: 14,
    })
  }
  doc.page.margins.bottom = bottom
  doc.page.margins.top = top
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
  if (key === 'plan') return { text: row.name, color: INK, font: 'Helvetica-Bold' }
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
  if (key === 'datos') return { text: displayBenefit(quotePlanData(row.benefits)), color: INK }
  if (key === 'internet') return { text: displayBenefit(quotePlanInternet(row.benefits)), color: INK }
  if (key === 'apps') return { text: displayBenefit(quotePlanAppsShort(row.benefits)), color: ACCENT }
  return { text: '—', color: INK }
}

function drawPlanTable(doc: PdfDoc, rows: QuotePdfPlanRow[], percent: number, yStart: number): number {
  const cols = layoutTableColumns(CONTENT_W, percent)
  const padX = 5
  const padY = 3
  const bodySize = 8
  const headerSize = 7.2
  let y = yStart

  const paintHeader = () => {
    const heights = cols.map((col) =>
      cellHeight(doc, col.header, Math.max(10, col.width - padX * 2), 'Helvetica-Bold', headerSize)
    )
    const h = Math.max(20, ...heights) + padY * 2
    ensureSpace(doc, y, h + 8)
    y = doc.y
    doc.save()
    doc.fillColor(NAVY)
    doc.roundedRect(MARGIN_X, y, CONTENT_W, h, 8).fill()
    doc.restore()
    let x = MARGIN_X
    for (const col of cols) {
      doc.font('Helvetica-Bold').fontSize(headerSize).fillColor('#FFFFFF')
      doc.text(col.header, x + padX, y + padY + 2, {
        width: Math.max(10, col.width - padX * 2),
        align: col.align ?? 'left',
        lineGap: 0,
      })
      x += col.width
    }
    y += h
    doc.y = y
  }

  paintHeader()
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]
    const values = cols.map((col) => tableCellText(row, col.key, percent))
    const heights = values.map((cell, i) =>
      cellHeight(
        doc,
        cell.text,
        Math.max(10, cols[i].width - padX * 2),
        cell.font || 'Helvetica',
        bodySize
      )
    )
    const h = Math.max(18, ...heights) + padY * 2
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
      doc.text(cell.text, x + padX, y + padY, {
        width: Math.max(10, col.width - padX * 2),
        align: col.align ?? 'left',
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
  const limit = PAGE_H - FOOTER_H - 16
  if (y + needed <= limit) {
    doc.y = y
    return
  }
  doc.addPage()
  doc.y = 24
}

const SECTION_BADGE = 24
const SECTION_BADGE_R = 7

function sectionTitle(doc: PdfDoc, n: number, title: string, y: number): number {
  ensureSpace(doc, y, SECTION_BADGE + 16)
  y = doc.y
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
  doc.y = y + SECTION_BADGE + 12
  return doc.y
}

function drawRoaming(doc: PdfDoc, rows: QuotePdfPlanRow[], y: number): number {
  ensureSpace(doc, y, 78)
  y = doc.y
  const gap = 10
  const cols = Math.min(3, Math.max(1, rows.length))
  const cardW = (CONTENT_W - gap * (cols - 1)) / cols
  const cardH = 62
  let x = MARGIN_X
  let rowY = y
  rows.forEach((row, index) => {
    if (index > 0 && index % cols === 0) {
      rowY += cardH + gap
      x = MARGIN_X
      ensureSpace(doc, rowY, cardH + 4)
      rowY = doc.y
    }
    const roam = quotePlanRoaming(row.benefits)
    doc.save()
    doc.fillColor(CARD_FILL)
    doc.roundedRect(x, rowY, cardW, cardH, 10).fill()
    doc.restore()
    doc.font('Helvetica-Bold').fontSize(9).fillColor(ACCENT)
    doc.text(row.name, x + 12, rowY + 10, { width: cardW - 24, lineBreak: false })
    const min = displayBenefit(roam.min)
    const inet = displayBenefit(roam.internet)
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
    doc.text(`${min}  |  ${inet}`, x + 12, rowY + 28, { width: cardW - 24, lineBreak: false })
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
    doc.text(displayBenefit(roam.sms), x + 12, rowY + 44, { width: cardW - 24, lineBreak: false })
    x += cardW + gap
  })
  doc.y = rowY + cardH + 12
  return doc.y
}

function drawApps(doc: PdfDoc, rows: QuotePdfPlanRow[], y: number): number {
  const rowH = 26
  const blockH = rows.length * rowH + 12
  ensureSpace(doc, y, Math.min(blockH, 90))
  y = doc.y
  doc.save()
  doc.fillColor(CARD_FILL)
  doc.roundedRect(MARGIN_X, y, CONTENT_W, rows.length * rowH + 12, 10).fill()
  doc.restore()
  rows.forEach((row, index) => {
    const top = y + 8 + index * rowH
    doc.font('Helvetica-Bold').fontSize(9).fillColor(ACCENT)
    doc.text(row.name, MARGIN_X + 14, top + 6, { width: 150, lineBreak: false })
    doc.font('Helvetica').fontSize(9).fillColor(INK)
    doc.text(displayBenefit(quotePlanApps(row.benefits)), MARGIN_X + 172, top + 6, {
      width: CONTENT_W - 196,
      lineGap: 0,
    })
  })
  doc.y = y + rows.length * rowH + 20
  return doc.y
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
    const sender = (input.senderName || '').trim()
    const senderPhone = (input.senderPhone || '').trim()
    const extras = (input.extras || '').trim()

    const paintPageChrome = (first: boolean) => {
      if (first) drawHeader(doc, input, letterhead)
      drawFooter(doc, sender, senderPhone)
    }
    paintPageChrome(true)
    doc.on('pageAdded', () => paintPageChrome(false))

    let y = HEADER_H + 20
    doc.x = MARGIN_X
    doc.y = y

    doc.font('Helvetica-Bold').fontSize(16).fillColor(INK)
    doc.text('Conectividad y beneficios para tu empresa', MARGIN_X, y, { width: CONTENT_W, lineGap: 0 })
    y = doc.y + 6
    doc.font('Helvetica').fontSize(11).fillColor(MUTED)
    doc.text(mobileHeadline(totalLines, input.headlineSuffix), MARGIN_X, y, { width: CONTENT_W, lineBreak: false })
    y = doc.y + 16

    y = drawKpiBand(doc, y, discountedTotal, percent) + 16
    doc.y = y

    y = sectionTitle(doc, 1, 'Planes, precios y beneficios incluidos', doc.y)
    y = drawPlanTable(doc, rows, percent, y) + 14
    doc.y = y

    y = sectionTitle(doc, 2, 'Roaming internacional', doc.y)
    y = drawRoaming(doc, rows, y)
    doc.y = y

    y = sectionTitle(doc, 3, 'Aplicaciones ilimitadas por plan', doc.y)
    y = drawApps(doc, rows, y)
    doc.y = y

    drawExtras(doc, extras, doc.y)

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
