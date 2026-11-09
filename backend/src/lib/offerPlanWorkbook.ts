import * as XLSX from 'xlsx'

export type OfferPlanBenefit = {
  label: string
  value: string
}

/** Fills read from the workbook (SheetJS cellStyles). Null when that cell has no fill. */
export type OfferPlanColors = {
  /** Title band, usually row 1. */
  title: string | null
  /** Header row whose first cell contains "Precio". */
  header: string | null
  /** Ink on the header fill. White when the fill is dark. */
  headerText: string
  /** First-column header, e.g. "Precio (S/)". The cell text is the plan name. */
  priceHeader: string
  /** Fill shared by the data row when the sheet paints the whole row. */
  row: string | null
  /** Header label → fill, only where that cell has its own fill. */
  cells: Record<string, string>
}

export type ParsedOfferPlan = {
  name: string
  priceSoles: number
  benefits: OfferPlanBenefit[]
  colors: OfferPlanColors
  sortOrder: number
}

export class OfferPlanWorkbookError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OfferPlanWorkbookError'
  }
}

export const OFFER_PLAN_SHEET_NAME = 'MAX Negocios +'

const DARK_INK = '#182333'

/**
 * Last number embedded in the plan name.
 * "MAX NEGOCIOS+ 29.9" → 29.9, "MAX ILIMITADO + 125" → 125, "MAX ILIMITADO + 289.9" → 289.9.
 */
export function priceFromPlanName(name: string): number | null {
  const matches = name.match(/\d+(?:[.,]\d+)?/g)
  if (!matches?.length) return null
  const n = Number(matches[matches.length - 1].replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

function cellText(value: unknown): string {
  if (value == null) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

type StyledCell = XLSX.CellObject & {
  s?: {
    patternType?: string
    fgColor?: { rgb?: string }
    bgColor?: { rgb?: string }
  }
}

/** Solid fill from SheetJS cell.s. No fill → null. Does not invent a color. */
export function fillHex(cell: StyledCell | undefined): string | null {
  const style = cell?.s
  if (!style || style.patternType === 'none') return null
  const raw = style.fgColor?.rgb || style.bgColor?.rgb
  if (!raw) return null
  const hex = raw.replace(/[^0-9A-Fa-f]/g, '').slice(-6).toUpperCase()
  if (!/^[0-9A-F]{6}$/.test(hex)) return null
  return `#${hex}`
}

/** White on a dark fill, workbook navy on a light one. */
export function inkOnFill(fill: string | null | undefined): string {
  if (!fill) return DARK_INK
  const hex = fill.replace('#', '')
  if (!/^[0-9A-F]{6}$/i.test(hex)) return DARK_INK
  const n = Number.parseInt(hex, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const y = (r * 299 + g * 587 + b * 114) / 1000
  return y < 150 ? '#FFFFFF' : DARK_INK
}

export function normalizeOfferPlanColors(value: unknown): OfferPlanColors | null {
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
      if (!label || !color) continue
      cells[label] = color
    }
  }
  const priceHeader =
    typeof record.priceHeader === 'string' && record.priceHeader.trim()
      ? record.priceHeader.trim()
      : 'Precio (S/)'
  return {
    title: hex(record.title),
    header: hex(record.header),
    headerText: hex(record.headerText) ?? inkOnFill(hex(record.header)),
    priceHeader,
    row: hex(record.row),
    cells,
  }
}

/**
 * Sheet "MAX Negocios +". Header row is the first row whose first cell contains "Precio".
 * Column A is the plan name (price embedded). Remaining columns are benefits, in workbook
 * order, including empty cells so no Excel column is dropped. Fills come from cell styles.
 */
export function parseOfferPlanWorkbook(buffer: Buffer): ParsedOfferPlan[] {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, cellStyles: true })
  } catch {
    throw new OfferPlanWorkbookError('No se pudo leer el Excel.')
  }

  const sheetName = workbook.SheetNames.find((name) => name.trim() === OFFER_PLAN_SHEET_NAME)
  if (!sheetName) {
    throw new OfferPlanWorkbookError(`No se encontró la hoja "${OFFER_PLAN_SHEET_NAME}".`)
  }

  const sheet = workbook.Sheets[sheetName]
  if (!sheet?.['!ref']) {
    throw new OfferPlanWorkbookError(`No se encontró la hoja "${OFFER_PLAN_SHEET_NAME}".`)
  }

  const range = XLSX.utils.decode_range(sheet['!ref'])
  const colCount = range.e.c - range.s.c + 1

  const read = (row: number, col: number): { text: string; fill: string | null } => {
    const cell = sheet[XLSX.utils.encode_cell({ r: row, c: range.s.c + col })] as StyledCell | undefined
    return { text: cellText(cell?.w ?? cell?.v), fill: fillHex(cell) }
  }

  let headerIdx = -1
  for (let row = range.s.r; row <= range.e.r; row++) {
    if (/precio/i.test(read(row, 0).text)) {
      headerIdx = row
      break
    }
  }
  if (headerIdx < 0) {
    throw new OfferPlanWorkbookError(
      'No se encontró la fila de encabezados (la primera celda debe contener "Precio").'
    )
  }

  const header = Array.from({ length: colCount }, (_, col) => read(headerIdx, col))
  const priceHeader = header[0]?.text || 'Precio (S/)'
  const title = read(range.s.r, 0).fill
  const headerFill = header[0]?.fill ?? null
  const plans: ParsedOfferPlan[] = []

  for (let row = headerIdx + 1; row <= range.e.r; row++) {
    const nameCell = read(row, 0)
    const name = nameCell.text
    if (!name) continue
    const priceSoles = priceFromPlanName(name)
    if (priceSoles == null) {
      throw new OfferPlanWorkbookError(`No se pudo leer el precio del plan "${name}".`)
    }
    const benefits: OfferPlanBenefit[] = []
    const cells: Record<string, string> = {}
    const fills: string[] = []
    if (nameCell.fill) {
      cells[priceHeader] = nameCell.fill
      fills.push(nameCell.fill)
    }
    for (let col = 1; col < header.length; col++) {
      const label = header[col]?.text ?? ''
      if (!label) continue
      const body = read(row, col)
      benefits.push({ label, value: body.text })
      if (body.fill) {
        cells[label] = body.fill
        fills.push(body.fill)
      }
    }
    const unique = new Set(fills)
    const paintedEveryColumn = fills.length === header.filter((item) => item.text).length
    const rowFill = paintedEveryColumn && unique.size === 1 ? [...unique][0] : null
    plans.push({
      name,
      priceSoles,
      benefits,
      colors: {
        title,
        header: headerFill,
        headerText: inkOnFill(headerFill),
        priceHeader,
        row: rowFill,
        cells: rowFill ? {} : cells,
      },
      sortOrder: plans.length,
    })
  }

  if (plans.length === 0) {
    throw new OfferPlanWorkbookError('El archivo no tiene planes.')
  }

  return plans
}

export function normalizeOfferPlanBenefits(value: unknown): OfferPlanBenefit[] {
  if (!Array.isArray(value)) return []
  const benefits: OfferPlanBenefit[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const label = typeof record.label === 'string' ? record.label : ''
    const cell = typeof record.value === 'string' ? record.value : ''
    if (!label) continue
    benefits.push({ label, value: cell })
  }
  return benefits
}
