import type { OfferPlanColors } from '../api/client'
import {
  formatCurrentPlanGroup,
  formatLineCount,
  formatSoles,
  type CurrentPlanGroup,
  type ProposalBenefit,
} from './proposalPlans'

export const MAX_MIX_PLANS = 8

export type QuotePlanOrigin = 'nueva' | 'portabilidad'

export type MixDraftItem = {
  planId: string
  linesInput: string
  origin: QuotePlanOrigin
}

export function isQuotePlanOrigin(value: unknown): value is QuotePlanOrigin {
  return value === 'nueva' || value === 'portabilidad'
}

/** Missing origin (legacy quotes) does not invent a tag. Lookups still treat it as nueva. */
export function parseQuotePlanOrigin(value: unknown): QuotePlanOrigin | undefined {
  return isQuotePlanOrigin(value) ? value : undefined
}

export function defaultQuotePlanOrigin(contractedLines: number): QuotePlanOrigin {
  return contractedLines > 0 ? 'portabilidad' : 'nueva'
}

export function otherQuotePlanOrigin(origin: QuotePlanOrigin): QuotePlanOrigin {
  return origin === 'nueva' ? 'portabilidad' : 'nueva'
}

export function quotePlanOriginTag(origin: QuotePlanOrigin): string {
  return origin === 'portabilidad' ? 'porta' : 'nueva'
}

export function quotePlanOriginLabel(origin: QuotePlanOrigin): string {
  return origin === 'portabilidad' ? 'Portabilidad' : 'Línea nueva'
}

export function quotePlanNameWithOrigin(name: string, origin?: QuotePlanOrigin | null): string {
  if (!isQuotePlanOrigin(origin)) return name
  return `${name} · ${quotePlanOriginTag(origin)}`
}

export function mixItemKey(planId: string, origin: QuotePlanOrigin): string {
  return `${planId}:${origin}`
}

export function addMixItem(
  items: MixDraftItem[],
  planId: string,
  preferredOrigin: QuotePlanOrigin,
  linesInput = '1',
  max = MAX_MIX_PLANS
): { items: MixDraftItem[]; notice: string } {
  const hasPreferred = items.some((item) => item.planId === planId && item.origin === preferredOrigin)
  const other = otherQuotePlanOrigin(preferredOrigin)
  const hasOther = items.some((item) => item.planId === planId && item.origin === other)
  if (hasPreferred && hasOther) return { items, notice: '' }
  if (items.length >= max) {
    return { items, notice: 'Puedes incluir hasta 8 planes en la oferta.' }
  }
  const origin = hasPreferred ? other : preferredOrigin
  return { items: [...items, { planId, linesInput, origin }], notice: '' }
}

export function addOtherOriginMixItem(
  items: MixDraftItem[],
  planId: string,
  linesInput = '1',
  max = MAX_MIX_PLANS
): { items: MixDraftItem[]; notice: string } {
  const present = items.filter((item) => item.planId === planId)
  if (present.length === 0) return { items, notice: '' }
  if (present.length >= 2) return { items, notice: '' }
  if (items.length >= max) {
    return { items, notice: 'Puedes incluir hasta 8 planes en la oferta.' }
  }
  const origin = otherQuotePlanOrigin(present[0].origin)
  return { items: [...items, { planId, linesInput, origin }], notice: '' }
}

export function setMixItemOrigin(
  items: MixDraftItem[],
  planId: string,
  from: QuotePlanOrigin,
  to: QuotePlanOrigin
): MixDraftItem[] {
  if (from === to) return items
  if (items.some((item) => item.planId === planId && item.origin === to)) return items
  return items.map((item) =>
    item.planId === planId && item.origin === from ? { ...item, origin: to } : item
  )
}

const DARK_INK = '#1F232A'
export const CLARO_RED = '#E2231A'
export const CLARO_NAVY = '#1F232A'
export const CLARO_LOGO_SRC = '/claro-empresas-logo.png'
export const CLARO_ROAMING_ZONES_SRC = '/claro-roaming-zonas.png'
export const QUOTE_EXTRAS_PLACEHOLDER = 'Asesor posventa · Nota de crédito en el tercer mes'
export const QUOTE_HEADLINE_SUFFIX_DEFAULT = 'corporativas con descuento por portabilidad.'

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

export function mixOfferHeader(planCount: number, lineCount: number): string {
  const plans = planCount === 1 ? '1 plan' : `${planCount} planes`
  return `Oferta · ${plans} · ${formatLineCount(lineCount)}`
}

export function mixOfferSummary(
  items: { name: string; lines: number; priceSoles: number; subtotal: number }[],
  total: number
): string {
  const lines = items.map(
    (item) =>
      `${item.name} · ${formatLineCount(item.lines)} · ${formatSoles(item.priceSoles)} · ${formatSoles(item.subtotal)}`
  )
  lines.push(`Total mensual: ${formatSoles(total)}`)
  return lines.join('\n')
}

/** Percents an admin may enable. The agent cannot type a free percent. */
export const QUOTE_DISCOUNT_OPTIONS = [25, 50] as const

export function quoteDiscountPercentsFromSettings(value: unknown): number[] {
  if (!Array.isArray(value)) return [...QUOTE_DISCOUNT_OPTIONS]
  const enabled = new Set<number>()
  for (const item of value) {
    const n = typeof item === 'number' ? item : Number(item)
    if (n === 25 || n === 50) enabled.add(n)
  }
  return QUOTE_DISCOUNT_OPTIONS.filter((pct) => enabled.has(pct))
}

export function normalizeQuoteDiscountPercent(value: unknown, allowed?: number[]): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n < 0) return 0
  if (n === 0) return 0
  if (allowed) return allowed.includes(n) ? n : 0
  return n === 25 || n === 50 ? n : 0
}

export function discountedUnit(priceSoles: number, percent: number): number {
  const pct = normalizeQuoteDiscountPercent(percent)
  const cents = Math.round(priceSoles * 100)
  if (pct <= 0) return cents / 100
  return Math.round((cents * (100 - pct)) / 100) / 100
}

export function discountedLineTotal(priceSoles: number, lines: number, percent: number): number {
  const cents = Math.round(discountedUnit(priceSoles, percent) * 100)
  return (cents * lines) / 100
}

function benefitKey(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase()
}

function benefitValue(benefits: ProposalBenefit[], labels: string[]): string {
  const rows = benefits.map((benefit) => ({
    key: benefitKey(benefit.label),
    value: (benefit.value ?? '').trim(),
  }))
  for (const label of labels) {
    const key = benefitKey(label)
    const exact = rows.find((row) => row.key === key)
    if (exact?.value) return exact.value
  }
  return ''
}

export function quotePlanMinutes(benefits: ProposalBenefit[]): string {
  return benefitValue(benefits, ['Min/SMS nacionales'])
}

/** DATOS — línea nueva: old Full Claro plus updated MAX Negocios. */
export const QUOTE_PLAN_DATA_LABELS_NUEVA = ['Full Claro (GB)', 'Lineass nuevas Internet'] as const

/** DATOS — portabilidad. */
export const QUOTE_PLAN_DATA_LABELS_PORTABILIDAD = [
  'Portabilidad Full Claro (GB)',
  'Portabilidad internet',
] as const

/** All DATOS headers (both origin groups). Prefer origin-aware helpers. */
export const QUOTE_PLAN_DATA_LABELS = [
  'Full Claro (GB)',
  'Portabilidad Full Claro (GB)',
  'Lineass nuevas Internet',
  'Portabilidad internet',
] as const

/** INTERNET — línea nueva: old Internet base plus updated MAX Negocios. */
export const QUOTE_PLAN_INTERNET_LABELS = ['Internet base (GB)', 'Lineas nueva Gbs'] as const

/** INTERNET — portabilidad. */
export const QUOTE_PLAN_INTERNET_LABELS_PORTABILIDAD = ['Portabilidad base (GB)'] as const

function dataLabelsFor(origin?: QuotePlanOrigin | null): readonly string[] {
  return origin === 'portabilidad' ? QUOTE_PLAN_DATA_LABELS_PORTABILIDAD : QUOTE_PLAN_DATA_LABELS_NUEVA
}

function internetLabelsFor(origin?: QuotePlanOrigin | null): readonly string[] {
  return origin === 'portabilidad' ? QUOTE_PLAN_INTERNET_LABELS_PORTABILIDAD : QUOTE_PLAN_INTERNET_LABELS
}

/** DATOS for the chosen origin. Omit origin (legacy) → nueva, so old catalogs still fill. */
export function quotePlanData(benefits: ProposalBenefit[], origin?: QuotePlanOrigin | null): string {
  return benefitValue(benefits, [...dataLabelsFor(origin)])
}

/** INTERNET for the chosen origin. Omit origin (legacy) → nueva. */
export function quotePlanInternet(benefits: ProposalBenefit[], origin?: QuotePlanOrigin | null): string {
  return benefitValue(benefits, [...internetLabelsFor(origin)])
}

export function quotePlanApps(benefits: ProposalBenefit[]): string {
  return benefitValue(benefits, ['Apps incluidas'])
}

/** Table APPS cell: keep a catalog short label, otherwise Ilimitadas. Long lists belong in §3. */
export function quotePlanAppsShort(benefits: ProposalBenefit[]): string {
  const full = quotePlanApps(benefits).trim()
  if (!full) return ''
  if (full.length <= 16 && !/[;,]/.test(full)) return full
  return 'Ilimitadas'
}

export function quotePlanRoaming(benefits: ProposalBenefit[]): { min: string; internet: string; sms: string } {
  return {
    min: benefitValue(benefits, ['Cobertura internacional min']),
    internet: benefitValue(benefits, ['Cobertura internacional internet']),
    sms: benefitValue(benefits, ['Cobertura internacional SMS']),
  }
}

/** True when any mix plan has a non-empty catalog roaming cell (min / internet / SMS). */
export function mixHasRoaming(rows: { benefits: ProposalBenefit[] }[]): boolean {
  return rows.some((row) => {
    const roam = quotePlanRoaming(row.benefits)
    return Boolean(roam.min || roam.internet || roam.sms)
  })
}

export function displayBenefit(value: string): string {
  return value.trim() || '—'
}

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

export function quoteTableHeaders(percent: number): { key: string; label: string }[] {
  const cols = [
    { key: 'cant', label: 'CANT.' },
    { key: 'plan', label: 'PLAN' },
    { key: 'precio', label: 'PRECIO' },
  ]
  if (percent > 0) cols.push({ key: 'dcto', label: `${percent}% DCTO.` })
  cols.push(
    { key: 'minutos', label: 'MINUTOS' },
    { key: 'datos', label: 'DATOS' },
    { key: 'internet', label: 'INTERNET' },
    { key: 'apps', label: 'APPS' }
  )
  return cols
}

export function formatQuoteDate(date = new Date()): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
    .format(date)
    .replace(/\./g, '')
    .toUpperCase()
}

export function discountLabel(percent: number): string {
  if (percent <= 0) return 'Sin descuento'
  return `${percent}%`
}

/** Footer CEL. grouping like the Claro sample: 987 963 762. */
export function formatQuoteCel(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 9) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
  return phone.trim()
}
