type CallLogRow = { calledAt: Date; agentId: string }

export type CallActivityGranularity = 'day' | 'week' | 'month'

function periodKey(date: Date, granularity: CallActivityGranularity): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  if (granularity === 'day') return `${y}-${m}-${d}`
  if (granularity === 'month') return `${y}-${m}`
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(date)
  monday.setDate(date.getDate() + diff)
  const my = monday.getFullYear()
  const mm = String(monday.getMonth() + 1).padStart(2, '0')
  const md = String(monday.getDate()).padStart(2, '0')
  return `${my}-${mm}-${md}`
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

export function buildCallGapStats(logs: CallLogRow[]): {
  totalCalls: number
  avgGapMinutes: number | null
  medianGapMinutes: number | null
  gapCount: number
} {
  if (logs.length === 0) {
    return { totalCalls: 0, avgGapMinutes: null, medianGapMinutes: null, gapCount: 0 }
  }

  const gaps: number[] = []
  for (let i = 1; i < logs.length; i++) {
    const deltaMs = logs[i].calledAt.getTime() - logs[i - 1].calledAt.getTime()
    if (deltaMs >= 0) gaps.push(deltaMs / 60_000)
  }

  return {
    totalCalls: logs.length,
    avgGapMinutes: average(gaps),
    medianGapMinutes: median(gaps),
    gapCount: gaps.length,
  }
}

export function buildCallActivitySeries(
  logs: CallLogRow[],
  from: Date,
  to: Date,
  granularity: CallActivityGranularity
): { period: string; count: number }[] {
  const counts = new Map<string, number>()

  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(23, 59, 59, 999)

  while (cursor <= end) {
    const key = periodKey(cursor, granularity)
    if (!counts.has(key)) counts.set(key, 0)
    if (granularity === 'day') {
      cursor.setDate(cursor.getDate() + 1)
    } else if (granularity === 'week') {
      cursor.setDate(cursor.getDate() + 7)
    } else {
      cursor.setMonth(cursor.getMonth() + 1)
    }
  }

  for (const log of logs) {
    const key = periodKey(new Date(log.calledAt), granularity)
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, count]) => ({ period, count }))
}

export function parseDateParam(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

/** Inclusive yyyy-MM-dd day bounds for CallLog.calledAt filters. */
export function buildCalledAtRange(
  from?: string,
  to?: string
): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined

  const now = new Date()
  const defaultFrom = new Date()
  defaultFrom.setDate(defaultFrom.getDate() - 30)
  defaultFrom.setHours(0, 0, 0, 0)

  const range: { gte?: Date; lte?: Date } = {}

  if (from) {
    const fromDate = parseDateParam(from, defaultFrom)
    fromDate.setHours(0, 0, 0, 0)
    range.gte = fromDate
  }
  if (to) {
    const toDate = parseDateParam(to, now)
    toDate.setHours(23, 59, 59, 999)
    range.lte = toDate
  }

  return range
}

export function parseGranularity(value: string | undefined): CallActivityGranularity {
  if (value === 'week' || value === 'month') return value
  return 'day'
}
