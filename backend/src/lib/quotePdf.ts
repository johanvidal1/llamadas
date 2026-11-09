import PDFDocument from 'pdfkit'
import { inkOnFill, type OfferPlanColors } from './offerPlanWorkbook'

export type QuotePdfBenefit = { label: string; value: string }

export type QuotePdfCurrentPlan = {
  plan: string
  rentaBasica: string
  rentaConDesc: string
  count: number
}

export type QuotePdfColors = OfferPlanColors

/** One chosen catalog row, frozen on the quote. The table shows Excel figures, not line counts. */
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
  greeting: string
  farewell: string
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
  senderName?: string
  senderPhone?: string
  letterheadPath?: string | null
  signaturePath?: string | null
  promoPaths?: string[]
}

type PdfDoc = InstanceType<typeof PDFDocument>

const INK = '#182333'

export function quoteLineTotal(priceSoles: number, lines: number): number {
  const cents = Math.round(priceSoles * 100)
  return (cents * lines) / 100
}

function formatSoles(amount: number): string {
  const formatted = new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return `S/ ${formatted}`
}

function formatLineCount(lines: number): string {
  const n = Math.max(1, Math.round(lines))
  return n === 1 ? '1 línea' : `${n} líneas`
}

function formatGroup(group: QuotePdfCurrentPlan): string {
  const name = group.plan.trim() || '—'
  const renta: string[] = []
  if (group.rentaBasica.trim()) renta.push(`Renta ${group.rentaBasica.trim()}`)
  if (group.rentaConDesc.trim()) renta.push(`c/desc ${group.rentaConDesc.trim()}`)
  const count = formatLineCount(group.count)
  return renta.length ? `${name} · ${renta.join(' · ')} · ${count}` : `${name} · ${count}`
}

function contentWidth(doc: PdfDoc): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right
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

function priceHeaderOf(rows: QuotePdfPlanRow[]): string {
  for (const row of rows) {
    const header = row.colors?.priceHeader?.trim()
    if (header) return header
  }
  return 'Precio (S/)'
}

/** Workbook order: the price header, then each benefit label the first time it appears. */
function columnHeaders(rows: QuotePdfPlanRow[]): string[] {
  const headers = [priceHeaderOf(rows)]
  const seen = new Set(headers)
  for (const row of rows) {
    for (const benefit of row.benefits) {
      const label = benefit.label.trim()
      if (!label || seen.has(label)) continue
      seen.add(label)
      headers.push(label)
    }
  }
  return headers
}

function cellValue(row: QuotePdfPlanRow, header: string, priceHeader: string): string {
  if (header === priceHeader) return row.name
  const found = row.benefits.find((benefit) => benefit.label.trim() === header)
  const value = found?.value?.trim()
  return value || '—'
}

function cellFill(row: QuotePdfPlanRow, header: string): string {
  const own = row.colors?.cells?.[header]
  if (own) return own
  if (row.colors?.row) return row.colors.row
  return '#FFFFFF'
}

type PdfCol = { header: string; width: number }

/** First column stays wide enough for the plan name; the rest follow a mild weight so headers wrap to two lines. */
function layoutColumns(headers: string[], width: number): PdfCol[] {
  const weights = headers.map((header, index) => {
    if (index === 0) return 1.7
    if (/apps/i.test(header)) return 1.55
    if (/cobertura internacional min/i.test(header)) return 1.15
    return 1
  })
  const sum = weights.reduce((total, weight) => total + weight, 0)
  const cols = headers.map((header, index) => ({
    header,
    width: (width * weights[index]) / sum,
  }))
  let used = 0
  for (let i = 0; i < cols.length - 1; i++) {
    cols[i].width = Math.round(cols[i].width * 100) / 100
    used += cols[i].width
  }
  cols[cols.length - 1].width = Math.max(18, Math.round((width - used) * 100) / 100)
  return cols
}

function cellHeight(doc: PdfDoc, text: string, width: number, font: string, size: number): number {
  doc.font(font).fontSize(size)
  return doc.heightOfString(text || '—', { width, lineGap: 0 })
}

function drawPlanTable(doc: PdfDoc, rows: QuotePdfPlanRow[]) {
  const left = doc.page.margins.left
  const width = contentWidth(doc)
  const headers = columnHeaders(rows)
  const cols = layoutColumns(headers, width)
  const padX = 1.6
  const padY = 1.4
  const bodySize = 7
  const headerSize = 6.2
  const band = rows.find((row) => row.colors?.header)?.colors
  const headerFill = band?.header || '#182333'
  const headerInk = band?.headerText || inkOnFill(headerFill)

  const paintHeader = () => {
    const heights = cols.map((col) =>
      cellHeight(doc, col.header, Math.max(8, col.width - padX * 2), 'Helvetica-Bold', headerSize)
    )
    const h = Math.max(16, ...heights) + padY * 2
    const y = doc.y
    let x = left
    for (const col of cols) {
      doc.save()
      doc.lineWidth(0.3).fillColor(headerFill).strokeColor(headerFill)
      doc.rect(x, y, col.width, h).fillAndStroke()
      doc.restore()
      doc.font('Helvetica-Bold').fontSize(headerSize).fillColor(headerInk)
      doc.text(col.header, x + padX, y + padY, {
        width: Math.max(8, col.width - padX * 2),
        lineGap: 0,
      })
      x += col.width
    }
    doc.x = left
    doc.y = y + h
  }

  paintHeader()
  for (const row of rows) {
    const values = cols.map((col) => cellValue(row, col.header, headers[0]))
    const heights = values.map((text, index) =>
      cellHeight(doc, text, Math.max(8, cols[index].width - padX * 2), 'Helvetica', bodySize)
    )
    const h = Math.max(12, ...heights) + padY * 2
    const y = doc.y
    let x = left
    for (let index = 0; index < cols.length; index++) {
      const col = cols[index]
      const fill = cellFill(row, col.header)
      doc.save()
      doc.lineWidth(0.3).fillColor(fill).strokeColor('#e7edf2')
      doc.rect(x, y, col.width, h).fillAndStroke()
      doc.restore()
      doc.font('Helvetica').fontSize(bodySize).fillColor(inkOnFill(fill))
      doc.text(values[index], x + padX, y + padY, {
        width: Math.max(8, col.width - padX * 2),
        lineGap: 0,
      })
      x += col.width
    }
    if (row.proposed) {
      doc.save()
      doc.lineWidth(1.35).strokeColor('#B9280B')
      doc.rect(left + 0.4, y + 0.4, width - 0.8, h - 0.8).stroke()
      doc.restore()
      doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#B9280B')
      const tag = 'Propuesta'
      const tagWidth = doc.widthOfString(tag)
      doc.text(tag, left - tagWidth - 4, y + Math.max(1, (h - 8) / 2), {
        width: tagWidth + 1,
        lineBreak: false,
      })
    }
    doc.x = left
    doc.y = y + h
  }
  doc.x = left
}

function writeLine(
  doc: PdfDoc,
  text: string,
  opts: { size: number; font: string; color: string; gap?: number; width?: number }
) {
  const width = opts.width ?? contentWidth(doc)
  const value = text.trim() ? text : ' '
  doc.font(opts.font).fontSize(opts.size).fillColor(opts.color)
  doc.text(value, doc.page.margins.left, doc.y, { width, lineGap: 0 })
  if (opts.gap) doc.y += opts.gap
}

export function renderQuotePdf(input: QuotePdfInput, options?: { compress?: boolean }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margins: { top: 28, right: 14, bottom: 26, left: 62 },
      compress: options?.compress !== false,
      info: {
        Title: 'Propuesta comercial',
        Author: 'Optick',
        Creator: 'Optick',
      },
    })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const left = doc.page.margins.left
    const width = contentWidth(doc)
    const rows = rowsForPdf(input)
    const proposed = rows.find((row) => row.proposed) ?? rows[0]
    const band = rows.find((row) => row.colors?.title || row.colors?.header)?.colors
    const titleFill = band?.title || '#B9280B'
    const title = (input.tableName || '').trim() || 'Propuesta'
    const titleH = 20
    const bandY = doc.y

    doc.save()
    doc.fillColor(titleFill)
    doc.rect(left, bandY, width, titleH).fill()
    doc.restore()
    doc.font('Helvetica-Bold').fontSize(11).fillColor(inkOnFill(titleFill))
    doc.text(title, left + 6, bandY + 4, { width: width - 12, lineBreak: false })
    doc.x = left
    doc.y = bandY + titleH + 8

    writeLine(doc, input.greeting.trim() || 'Estimado/a,', {
      size: 9,
      font: 'Helvetica',
      color: INK,
      gap: 3,
    })
    writeLine(doc, input.contactName.trim() || '—', {
      size: 10,
      font: 'Helvetica-Bold',
      color: INK,
      gap: 6,
    })

    const current =
      input.currentPlans.length === 0
        ? 'Plan actual: sin líneas móviles registradas'
        : `Plan actual: ${input.currentPlans.map((group) => formatGroup(group)).join(' · ')}`
    writeLine(doc, current, { size: 8, font: 'Helvetica', color: INK, gap: 6 })

    drawPlanTable(doc, rows)
    doc.y += 6

    if (proposed) {
      writeLine(
        doc,
        `Propuesta: ${proposed.name} · ${formatLineCount(proposed.lines)} · ${formatSoles(proposed.monthlySoles)} al mes`,
        { size: 9, font: 'Helvetica-Bold', color: INK, gap: 8 }
      )
    }

    writeLine(doc, input.farewell.trim() || 'Quedamos atentos.', {
      size: 9,
      font: 'Helvetica',
      color: INK,
      gap: 6,
    })
    const sender = (input.senderName || '').trim()
    if (sender) {
      writeLine(doc, sender, { size: 9, font: 'Helvetica-Bold', color: INK, gap: 1 })
    }
    const senderPhone = (input.senderPhone || '').trim()
    if (senderPhone) {
      writeLine(doc, senderPhone, { size: 8, font: 'Helvetica', color: INK, gap: 0 })
    }

    doc.end()
  })
}

/** ASCII download name. Preview inserts the `prueba` token; the registrar name does not. */
export function quotePdfFilename(ruc: string, planName: string, preview: boolean): string {
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
  return `Propuesta${token}-${slug(ruc, 'sin-ruc')}-${slug(planName, 'plan')}.pdf`
}
