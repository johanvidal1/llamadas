/** Excel-like snapshot of an offer-plan catalog. Labels stay as stored — no quote aliases. */

export type OfferPlanSheetBenefit = { label: string; value: string }

export type OfferPlanSheetColors = {
  title: string | null
  header: string | null
  headerText: string
  priceHeader: string
  row: string | null
  cells: Record<string, string>
}

export type OfferPlanSheetRow = {
  name: string
  benefits: OfferPlanSheetBenefit[]
  colors?: OfferPlanSheetColors | null
}

const FALLBACK_PRICE_HEADER = 'Precio (S/)'
const DARK_INK = '#182333'

export function catalogPriceHeader(plans: OfferPlanSheetRow[]): string {
  for (const plan of plans) {
    const header = plan.colors?.priceHeader?.trim()
    if (header) return header
  }
  return FALLBACK_PRICE_HEADER
}

/** Benefit labels in workbook order, first-seen. Does not remap to INTERNET/DATOS. */
export function catalogBenefitLabels(plans: OfferPlanSheetRow[]): string[] {
  const labels: string[] = []
  const seen = new Set<string>()
  for (const plan of plans) {
    for (const benefit of plan.benefits) {
      const label = benefit.label
      if (!label || seen.has(label)) continue
      seen.add(label)
      labels.push(label)
    }
  }
  return labels
}

export function catalogHeaders(plans: OfferPlanSheetRow[]): string[] {
  return [catalogPriceHeader(plans), ...catalogBenefitLabels(plans)]
}

/** Empty Excel cells stay blank (not an em dash). */
export function catalogCellValue(plan: OfferPlanSheetRow, header: string, priceHeader: string): string {
  if (header === priceHeader) return plan.name
  const found = plan.benefits.find((benefit) => benefit.label === header)
  return found?.value ?? ''
}

export function catalogCellFill(
  colors: OfferPlanSheetColors | null | undefined,
  header: string
): string | null {
  const own = colors?.cells?.[header]
  if (own) return own
  if (colors?.row) return colors.row
  return null
}

/** Contrast ink when a fill exists. Null when there is no fill — do not invent a color. */
export function inkOnStoredFill(fill: string | null | undefined): string | null {
  if (!fill) return null
  const hex = fill.replace('#', '')
  if (!/^[0-9A-Fa-f]{6}$/i.test(hex)) return null
  const n = Number.parseInt(hex, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const y = (r * 299 + g * 587 + b * 114) / 1000
  return y < 150 ? '#FFFFFF' : DARK_INK
}

export function catalogHeaderStyle(plans: OfferPlanSheetRow[]): { fill: string | null; ink: string | null } {
  for (const plan of plans) {
    const fill = plan.colors?.header ?? null
    const storedInk = plan.colors?.headerText?.trim() || null
    if (fill || storedInk) {
      return { fill, ink: storedInk || inkOnStoredFill(fill) }
    }
  }
  return { fill: null, ink: null }
}

export function catalogCellStyle(
  plan: OfferPlanSheetRow,
  header: string
): { fill: string | null; ink: string | null } {
  const fill = catalogCellFill(plan.colors, header)
  return { fill, ink: inkOnStoredFill(fill) }
}

export function slugAscii(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60)
  return slug || 'catalogo'
}

function isoDateLocal(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function catalogPngFilename(tableName: string, date: Date = new Date()): string {
  return `Planes-${slugAscii(tableName)}-${isoDateLocal(date)}.png`
}
