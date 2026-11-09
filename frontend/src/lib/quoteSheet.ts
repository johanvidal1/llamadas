import type { OfferPlanColors } from '../api/client'
import {
  formatCurrentPlanGroup,
  formatLineCount,
  formatSoles,
  type CurrentPlanGroup,
  type ProposalBenefit,
} from './proposalPlans'

export const MAX_COMPARE_PLANS = 3

const DARK_INK = '#182333'

export function inkOnFill(fill: string | null | undefined): string {
  if (!fill) return DARK_INK
  const hex = fill.replace('#', '')
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return DARK_INK
  const n = Number.parseInt(hex, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const y = (r * 299 + g * 587 + b * 114) / 1000
  return y < 150 ? '#FFFFFF' : DARK_INK
}

export function priceHeaderOf(colors: OfferPlanColors | null | undefined): string {
  return colors?.priceHeader?.trim() || 'Precio (S/)'
}

/** Price header, then benefit labels in workbook order. */
export function sheetHeaders(
  rows: { benefits: ProposalBenefit[]; colors?: OfferPlanColors | null }[]
): string[] {
  const price = priceHeaderOf(rows.find((row) => row.colors?.priceHeader)?.colors)
  const headers = [price]
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

export function sheetCellFill(colors: OfferPlanColors | null | undefined, header: string): string {
  const own = colors?.cells?.[header]
  if (own) return own
  if (colors?.row) return colors.row
  return '#FFFFFF'
}

export function sheetCellValue(
  row: { name: string; benefits: ProposalBenefit[] },
  header: string,
  priceHeader: string
): string {
  if (header === priceHeader) return row.name
  const found = row.benefits.find((benefit) => benefit.label.trim() === header)
  const value = found?.value?.trim()
  return value || '—'
}

export function currentPlanSentence(groups: CurrentPlanGroup[]): string {
  if (groups.length === 0) return 'Plan actual: sin líneas móviles registradas'
  return `Plan actual: ${groups.map((group) => formatCurrentPlanGroup(group)).join(' · ')}`
}

export function offerSentence(name: string, lines: number, total: number): string {
  return `Propuesta: ${name} · ${formatLineCount(lines)} · ${formatSoles(total)} al mes`
}
