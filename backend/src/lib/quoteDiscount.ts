export function quoteLineTotal(priceSoles: number, lines: number): number {
  const cents = Math.round(priceSoles * 100)
  return (cents * lines) / 100
}

/** Percents an admin may enable. The agent cannot type a free percent. */
export const QUOTE_DISCOUNT_OPTIONS = [25, 50] as const

export type QuoteDiscountOption = (typeof QUOTE_DISCOUNT_OPTIONS)[number]

export type QuoteBenefit = { label: string; value: string }

export type QuotePlanOrigin = 'nueva' | 'portabilidad'

export function isQuotePlanOrigin(value: unknown): value is QuotePlanOrigin {
  return value === 'nueva' || value === 'portabilidad'
}

/** Missing origin (legacy snapshots) has no PDF tag. Lookups still treat it as nueva. */
export function parseQuotePlanOrigin(value: unknown): QuotePlanOrigin | undefined {
  return isQuotePlanOrigin(value) ? value : undefined
}

export function defaultQuotePlanOrigin(contractedLines: number): QuotePlanOrigin {
  return contractedLines > 0 ? 'portabilidad' : 'nueva'
}

export function quotePlanOriginTag(origin: QuotePlanOrigin): string {
  return origin === 'portabilidad' ? 'porta' : 'nueva'
}

export function quotePlanNameWithOrigin(name: string, origin?: QuotePlanOrigin | null): string {
  if (!isQuotePlanOrigin(origin)) return name
  return `${name} · ${quotePlanOriginTag(origin)}`
}

/** Porta first, then nueva. Missing/legacy origin ranks with nueva. */
export function quoteMixOriginRank(origin?: QuotePlanOrigin | null): number {
  return origin === 'portabilidad' ? 0 : 1
}

/**
 * Preview + PDF mix order: cheapest plan first; same price → portabilidad then nueva.
 * Stable for equal price+origin.
 */
export function sortQuoteMixRows<T extends { priceSoles: number; origin?: QuotePlanOrigin | null }>(
  rows: readonly T[]
): T[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const price = a.row.priceSoles - b.row.priceSoles
      if (price !== 0) return price
      const origin = quoteMixOriginRank(a.row.origin) - quoteMixOriginRank(b.row.origin)
      if (origin !== 0) return origin
      return a.index - b.index
    })
    .map((item) => item.row)
}

export function isQuoteDiscountOption(value: number): value is QuoteDiscountOption {
  return (QUOTE_DISCOUNT_OPTIONS as readonly number[]).includes(value)
}

/**
 * Tenant JSON → enabled percents in catalog order.
 * Missing / invalid JSON falls back to both 25 and 50. `[]` means both toggles off.
 */
export function quoteDiscountPercentsFromTenant(value: unknown): number[] {
  if (!Array.isArray(value)) return [...QUOTE_DISCOUNT_OPTIONS]
  const enabled = new Set<number>()
  for (const item of value) {
    const n = typeof item === 'number' ? item : Number(item)
    if (isQuoteDiscountOption(n)) enabled.add(n)
  }
  return QUOTE_DISCOUNT_OPTIONS.filter((pct) => enabled.has(pct))
}

/** 0, 25 or 50. Anything else becomes 0 so we never invent a discount. */
export function normalizeQuoteDiscountPercent(value: unknown, allowed?: number[]): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n < 0) return 0
  if (n === 0) return 0
  if (allowed) return allowed.includes(n) ? n : 0
  return isQuoteDiscountOption(n) ? n : 0
}

/** List price after the quote-level percent. Does not stack with catalog promos. */
export function quoteDiscountedUnit(priceSoles: number, percent: number): number {
  const pct = normalizeQuoteDiscountPercent(percent)
  const cents = Math.round(priceSoles * 100)
  if (pct <= 0) return cents / 100
  return Math.round((cents * (100 - pct)) / 100) / 100
}

export function quoteDiscountedLineTotal(priceSoles: number, lines: number, percent: number): number {
  return quoteLineTotal(quoteDiscountedUnit(priceSoles, percent), lines)
}

function benefitKey(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase()
}

function benefitValue(benefits: QuoteBenefit[], labels: string[]): string {
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

export function quotePlanMinutes(benefits: QuoteBenefit[]): string {
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
export const QUOTE_PLAN_INTERNET_LABELS = [
  'Internet base (GB)',
  'Lineas nueva Gbs',
  'Tethering Linea nueva',
  'Tehering Linea nueva',
] as const

/** INTERNET — portabilidad. */
export const QUOTE_PLAN_INTERNET_LABELS_PORTABILIDAD = [
  'Portabilidad base (GB)',
  'Tethering Portabilidad',
  'Tehering Portabilidad',
] as const

function dataLabelsFor(origin?: QuotePlanOrigin | null): readonly string[] {
  return origin === 'portabilidad' ? QUOTE_PLAN_DATA_LABELS_PORTABILIDAD : QUOTE_PLAN_DATA_LABELS_NUEVA
}

function internetLabelsFor(origin?: QuotePlanOrigin | null): readonly string[] {
  return origin === 'portabilidad' ? QUOTE_PLAN_INTERNET_LABELS_PORTABILIDAD : QUOTE_PLAN_INTERNET_LABELS
}

/** DATOS for the chosen origin. Omit origin (legacy) → nueva, so old catalogs still fill. */
export function quotePlanData(benefits: QuoteBenefit[], origin?: QuotePlanOrigin | null): string {
  return benefitValue(benefits, [...dataLabelsFor(origin)])
}

/** INTERNET for the chosen origin. Omit origin (legacy) → nueva. */
export function quotePlanInternet(benefits: QuoteBenefit[], origin?: QuotePlanOrigin | null): string {
  return benefitValue(benefits, [...internetLabelsFor(origin)])
}

export function quotePlanApps(benefits: QuoteBenefit[]): string {
  return benefitValue(benefits, ['Apps incluidas'])
}

/** Table APPS cell: keep a catalog short label, otherwise Ilimitadas. Long lists belong in §3. */
export function quotePlanAppsShort(benefits: QuoteBenefit[]): string {
  const full = quotePlanApps(benefits).trim()
  if (!full) return ''
  if (full.length <= 16 && !/[;,]/.test(full)) return full
  return 'Ilimitadas'
}

export function quotePlanRoaming(benefits: QuoteBenefit[]): { min: string; internet: string; sms: string } {
  return {
    min: benefitValue(benefits, ['Cobertura internacional min']),
    internet: benefitValue(benefits, ['Cobertura internacional internet']),
    sms: benefitValue(benefits, ['Cobertura internacional SMS']),
  }
}

/** True when any mix plan has a non-empty catalog roaming cell (min / internet / SMS). */
export function mixHasRoaming(rows: { benefits: QuoteBenefit[] }[]): boolean {
  return rows.some((row) => {
    const roam = quotePlanRoaming(row.benefits)
    return Boolean(roam.min || roam.internet || roam.sms)
  })
}

export function displayBenefit(value: string): string {
  return value.trim() || '—'
}

/** DATOS cell only: catalog "Ilimitado" (any case) prints as ILIMITADO. */
export function displayDatosBenefit(value: string): string {
  const shown = displayBenefit(value)
  if (shown !== '—' && shown.toLowerCase() === 'ilimitado') return 'ILIMITADO'
  return shown
}
