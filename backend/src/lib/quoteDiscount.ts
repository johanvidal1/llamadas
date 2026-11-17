export function quoteLineTotal(priceSoles: number, lines: number): number {
  const cents = Math.round(priceSoles * 100)
  return (cents * lines) / 100
}

/** Percents an admin may enable. The agent cannot type a free percent. */
export const QUOTE_DISCOUNT_OPTIONS = [25, 50] as const

export type QuoteDiscountOption = (typeof QUOTE_DISCOUNT_OPTIONS)[number]

export type QuoteBenefit = { label: string; value: string }

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

function benefitValue(benefits: QuoteBenefit[], labels: string[]): string {
  const rows = benefits.map((benefit) => ({
    key: benefit.label.trim().toLowerCase(),
    value: (benefit.value ?? '').trim(),
  }))
  for (const label of labels) {
    const key = label.toLowerCase()
    const exact = rows.find((row) => row.key === key)
    if (exact?.value) return exact.value
  }
  return ''
}

export function quotePlanMinutes(benefits: QuoteBenefit[]): string {
  return benefitValue(benefits, ['Min/SMS nacionales'])
}

export function quotePlanData(benefits: QuoteBenefit[]): string {
  return benefitValue(benefits, ['Full Claro (GB)', 'Portabilidad Full Claro (GB)'])
}

export function quotePlanInternet(benefits: QuoteBenefit[]): string {
  return benefitValue(benefits, ['Internet base (GB)'])
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

export function displayBenefit(value: string): string {
  return value.trim() || '—'
}
