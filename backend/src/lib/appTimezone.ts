import { Prisma } from '@prisma/client'

const DEFAULT_TIMEZONE = 'America/Lima'
const IANA_TIMEZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)+$/

let cachedTimezone: string | null = null
let cachedTimezoneSql: Prisma.Sql | null = null

function isValidIanaTimezone(tz: string): boolean {
  if (!IANA_TIMEZONE_PATTERN.test(tz)) return false
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** App reporting timezone from APP_TIMEZONE (validated; never from user input). */
export function getAppTimezone(): string {
  if (cachedTimezone) return cachedTimezone
  const raw = process.env.APP_TIMEZONE ?? DEFAULT_TIMEZONE
  cachedTimezone = isValidIanaTimezone(raw) ? raw : DEFAULT_TIMEZONE
  return cachedTimezone
}

/** Safe Prisma fragment for `AT TIME ZONE` (validated env only). */
export function appTimezoneSql(): Prisma.Sql {
  if (!cachedTimezoneSql) {
    cachedTimezoneSql = Prisma.sql`${getAppTimezone()}`
  }
  return cachedTimezoneSql
}

const YMD_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseYmdString(value: string | undefined): string | null {
  if (!value) return null
  const m = YMD_PATTERN.exec(value)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  ms: number
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
    ms: date.getUTCMilliseconds(),
  }
}

/** Local civil time in `timeZone` → UTC instant. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone = getAppTimezone()
): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, second, ms)

  for (let i = 0; i < 4; i++) {
    const parts = getZonedParts(new Date(utc), timeZone)
    const target = Date.UTC(year, month - 1, day, hour, minute, second, ms)
    const actual = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.ms
    )
    const diff = target - actual
    if (diff === 0) break
    utc += diff
  }

  return new Date(utc)
}

export function formatYmdInTz(date: Date, timeZone = getAppTimezone()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function todayYmdInAppTz(): string {
  return formatYmdInTz(new Date())
}

export function localDayStartUtc(ymd: string, timeZone = getAppTimezone()): Date {
  const parsed = parseYmdString(ymd)
  if (!parsed) throw new Error(`Invalid date: ${ymd}`)
  const [y, mo, d] = parsed.split('-').map(Number)
  return zonedTimeToUtc(y, mo, d, 0, 0, 0, 0, timeZone)
}

export function localDayEndUtc(ymd: string, timeZone = getAppTimezone()): Date {
  const parsed = parseYmdString(ymd)
  if (!parsed) throw new Error(`Invalid date: ${ymd}`)
  const [y, mo, d] = parsed.split('-').map(Number)
  return zonedTimeToUtc(y, mo, d, 23, 59, 59, 999, timeZone)
}

export function addDaysYmd(ymd: string, days: number, timeZone = getAppTimezone()): string {
  const noon = zonedTimeToUtc(
    ...(() => {
      const [y, mo, d] = ymd.split('-').map(Number)
      return [y, mo, d, 12, 0, 0, 0] as const
    })(),
    timeZone
  )
  return formatYmdInTz(new Date(noon.getTime() + days * 86_400_000), timeZone)
}

/** ISO day of week (1=Mon … 7=Sun) for a calendar date in app timezone. */
export function isoDowForYmd(ymd: string, timeZone = getAppTimezone()): number {
  const noon = zonedTimeToUtc(
    ...(() => {
      const [y, mo, d] = ymd.split('-').map(Number)
      return [y, mo, d, 12, 0, 0, 0] as const
    })(),
    timeZone
  )
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(noon)
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return map[weekday] ?? 1
}
