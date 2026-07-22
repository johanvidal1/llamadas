import { formatYmdInTz, getAppTimezone, todayYmdInAppTz } from './appTimezone'
import { OPTICK_TENANT_ID, OPTICK_TENANT_SLUG } from './tenant'

export type BillingPhase = 'OK' | 'DUE_SOON' | 'DUE' | 'GRACE' | 'OVERDUE'

export type BillingTenantInput = {
  id: string
  slug: string
  billingEnabled: boolean
  billingDay: number
  graceDays: number
  paidThrough: Date | null
  billingContact: string | null
}

export type BillingStatus = {
  showBanner: boolean
  phase: BillingPhase
  severity: 'none' | 'amber' | 'orange' | 'red'
  message: string
  detail: string | null
  billingContact: string | null
  billingDay: number
  graceDays: number
  billingEnabled: boolean
  paidThrough: string | null
  today: string
  timezone: string
}

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

function clampBillingDay(day: number): number {
  if (!Number.isFinite(day)) return 1
  return Math.min(28, Math.max(1, Math.trunc(day)))
}

function clampGraceDays(days: number): number {
  if (!Number.isFinite(days)) return 7
  return Math.min(31, Math.max(0, Math.trunc(days)))
}

/** Soft start: billingDay=1 → day 25 of month; else billingDay−6 same month. */
function softStartDay(billingDay: number): number {
  const start = billingDay - 6
  return start >= 1 ? start : 25
}

function paidThroughYmd(paidThrough: Date | null, timeZone: string): string | null {
  if (!paidThrough) return null
  return formatYmdInTz(paidThrough, timeZone)
}

/**
 * Compute cobranza phase in APP_TIMEZONE (America/Lima by default).
 *
 * Defaults billingDay=1, graceDays=7:
 * - DUE_SOON: day 25–end → “Próximo pago el 1 de [mes siguiente]”
 * - DUE: days 1–3 → “Pago del mes pendiente”
 * - GRACE: days 4–8 (billingDay+3 … billingDay+graceDays)
 * - OVERDUE: after grace until soft window (or rest of month if billingDay>1)
 *
 * Hide when paidThrough >= today, billingEnabled=false, or Optick tenant.
 * After OVERDUE: suspend manually via Platform → Suspender (no auto-suspend).
 */
export function computeBillingStatus(
  tenant: BillingTenantInput,
  todayYmd = todayYmdInAppTz()
): BillingStatus {
  const timeZone = getAppTimezone()
  const billingDay = clampBillingDay(tenant.billingDay)
  const graceDays = clampGraceDays(tenant.graceDays)
  const paidYmd = paidThroughYmd(tenant.paidThrough, timeZone)
  const contact = tenant.billingContact?.trim() || null

  const base = {
    billingContact: contact,
    billingDay,
    graceDays,
    billingEnabled: tenant.billingEnabled,
    paidThrough: paidYmd,
    today: todayYmd,
    timezone: timeZone,
  }

  const ok = (): BillingStatus => ({
    ...base,
    showBanner: false,
    phase: 'OK',
    severity: 'none',
    message: '',
    detail: null,
  })

  const isOptick =
    tenant.id === OPTICK_TENANT_ID || tenant.slug === OPTICK_TENANT_SLUG

  if (isOptick || !tenant.billingEnabled) return ok()
  if (paidYmd && paidYmd >= todayYmd) return ok()

  const [, m, d] = todayYmd.split('-').map(Number)
  const dueDay = billingDay
  const softStart = softStartDay(billingDay)
  const dueEnd = dueDay + 2
  const graceStart = dueDay + 3
  const graceEnd = dueDay + graceDays

  const dueMonthName = MONTHS_ES[m - 1]
  const nextMonthName = MONTHS_ES[m === 12 ? 0 : m]
  const contactHint = contact
    ? `Envíe su comprobante a cobranza Optick: ${contact}`
    : 'Envíe su comprobante a cobranza Optick (WhatsApp o email configurado).'

  let phase: BillingPhase = 'OK'
  let message = ''
  let severity: BillingStatus['severity'] = 'none'

  if (d >= dueDay && d <= dueEnd) {
    phase = 'DUE'
    severity = 'orange'
    message = 'Pago del mes pendiente'
  } else if (graceDays > 0 && d >= graceStart && d <= graceEnd) {
    phase = 'GRACE'
    severity = 'orange'
    message = `Pago vencido — período de gracia hasta el día ${graceEnd}`
  } else if (d > graceEnd && (dueDay === 1 ? d < softStart : true)) {
    // billingDay=1: overdue days 9–24; billingDay>1: overdue after grace for rest of month
    phase = 'OVERDUE'
    severity = 'red'
    message = 'Cuenta en mora — contacte a cobranza Optick'
  } else if (d >= softStart && (dueDay === 1 || d < dueDay)) {
    phase = 'DUE_SOON'
    severity = 'amber'
    message =
      dueDay === 1
        ? `Próximo pago el ${billingDay} de ${nextMonthName}`
        : `Próximo pago el ${billingDay} de ${dueMonthName}`
  }

  if (phase === 'OK') return ok()

  return {
    ...base,
    showBanner: true,
    phase,
    severity,
    message,
    detail: contactHint,
  }
}

/** Parse YYYY-MM-DD → Date at UTC noon (date-only semantics). */
export function parsePaidThroughInput(
  value: string | null | undefined
): Date | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!m) throw new Error('paidThrough debe ser YYYY-MM-DD')
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) {
    throw new Error('paidThrough fecha inválida')
  }
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0))
}
