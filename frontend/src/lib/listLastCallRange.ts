/** Calendar dates for Lista «Última llamada». Matches backend APP_TIMEZONE (America/Lima). */

export const APP_TIMEZONE = 'America/Lima'

export type ListLastCallPreset = 'today' | 'last7' | 'range'

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTHS_ES_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
]

export function parseYmd(value: string | undefined | null): string | null {
  if (!value) return null
  const m = YMD.exec(value.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const days = new Date(y, mo, 0).getDate()
  if (d > days) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

export function formatYmdInAppTz(date: Date, timeZone = APP_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function todayYmdInAppTz(now = new Date(), timeZone = APP_TIMEZONE): string {
  return formatYmdInAppTz(now, timeZone)
}

/** Add calendar days to a yyyy-MM-dd in app timezone (noon UTC, then format in TZ). */
export function addDaysYmd(ymd: string, days: number, timeZone = APP_TIMEZONE): string {
  const parsed = parseYmd(ymd)
  if (!parsed) return ymd
  const [y, mo, d] = parsed.split('-').map(Number)
  const utcNoon = Date.UTC(y, mo - 1, d, 12, 0, 0)
  return formatYmdInAppTz(new Date(utcNoon + days * 86_400_000), timeZone)
}

export function formatYmdShortEs(ymd: string): string {
  const parsed = parseYmd(ymd)
  if (!parsed) return ymd
  const [, mo, d] = parsed.split('-')
  return `${Number(d)} ${MONTHS_ES_SHORT[Number(mo) - 1]}`
}

export type ListLastCallRange = { from?: string; to?: string }

/** Hoy / últimos 7 días (inclusive) / rango → yyyy-MM-dd for registeredFrom/To. */
export function resolveListLastCallRange(
  preset: ListLastCallPreset | null,
  rangeFrom = '',
  rangeTo = '',
  now = new Date(),
  timeZone = APP_TIMEZONE
): ListLastCallRange | null {
  if (!preset) return null
  if (preset === 'today') {
    const today = todayYmdInAppTz(now, timeZone)
    return { from: today, to: today }
  }
  if (preset === 'last7') {
    const today = todayYmdInAppTz(now, timeZone)
    return { from: addDaysYmd(today, -6, timeZone), to: today }
  }
  let from = parseYmd(rangeFrom)
  let to = parseYmd(rangeTo)
  if (!from && !to) return null
  if (from && to && from > to) {
    const tmp = from
    from = to
    to = tmp
  }
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }
}

export function listLastCallChipLabel(
  preset: ListLastCallPreset | null,
  rangeFrom = '',
  rangeTo = '',
  now = new Date(),
  timeZone = APP_TIMEZONE
): string | null {
  if (!preset) return null
  if (preset === 'today') return 'Hoy'
  if (preset === 'last7') return 'Últimos 7 días'
  const range = resolveListLastCallRange(preset, rangeFrom, rangeTo, now, timeZone)
  if (!range) return 'Rango'
  if (range.from && range.to && range.from === range.to) return formatYmdShortEs(range.from)
  if (range.from && range.to) {
    return `${formatYmdShortEs(range.from)} – ${formatYmdShortEs(range.to)}`
  }
  if (range.from) return `desde ${formatYmdShortEs(range.from)}`
  return `hasta ${formatYmdShortEs(range.to!)}`
}

export function listLastCallQueryParams(
  range: ListLastCallRange | null
): { registeredFrom?: string; registeredTo?: string } {
  if (!range) return {}
  return {
    ...(range.from ? { registeredFrom: range.from } : {}),
    ...(range.to ? { registeredTo: range.to } : {}),
  }
}
