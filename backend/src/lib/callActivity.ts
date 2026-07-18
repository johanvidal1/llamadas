import { prisma } from './prisma'
import {
  addDaysYmd,
  getAppTimezone,
  localDayEndUtc,
  localDayStartUtc,
  parseYmdString,
  todayYmdInAppTz,
} from './appTimezone'
import { sqlAndTenant } from './tenant'

type CallLogRow = { calledAt: Date; agentId: string }

export type CallActivityGranularity = 'day' | 'week' | 'month'

export type CallActivityFilters = {
  agentId?: string
  batchId?: string
  from: Date
  to: Date
}

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

/** Start of app-local calendar day (yyyy-MM-dd) as UTC instant. */
export function parseDateParam(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback
  const ymd = parseYmdString(value)
  if (ymd) return localDayStartUtc(ymd)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

/** End of app-local calendar day (yyyy-MM-dd) as UTC instant. */
export function parseDateEndParam(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback
  const ymd = parseYmdString(value)
  if (ymd) return localDayEndUtc(ymd)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

/** Inclusive yyyy-MM-dd day bounds for CallLog.calledAt filters (app timezone). */
export function buildCalledAtRange(
  from?: string,
  to?: string
): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined

  const tz = getAppTimezone()
  const todayYmd = todayYmdInAppTz()
  const defaultFromYmd = addDaysYmd(todayYmd, -30, tz)

  const range: { gte?: Date; lte?: Date } = {}

  if (from) {
    range.gte = parseYmdString(from)
      ? localDayStartUtc(from, tz)
      : localDayStartUtc(defaultFromYmd, tz)
  }
  if (to) {
    range.lte = parseYmdString(to) ? localDayEndUtc(to, tz) : localDayEndUtc(todayYmd, tz)
  }

  return range
}

export function parseGranularity(value: string | undefined): CallActivityGranularity {
  if (value === 'week' || value === 'month') return value
  return 'day'
}

function periodKeyFromSqlValue(value: Date, granularity: CallActivityGranularity): string {
  const d = value instanceof Date ? value : new Date(value)
  if (granularity === 'month') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  return periodKey(d, granularity)
}

function fillPeriodBuckets(
  from: Date,
  to: Date,
  granularity: CallActivityGranularity
): Map<string, number> {
  const counts = new Map<string, number>()
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setHours(23, 59, 59, 999)

  while (cursor <= end) {
    const key = periodKey(cursor, granularity)
    if (!counts.has(key)) counts.set(key, 0)
    if (granularity === 'day') cursor.setDate(cursor.getDate() + 1)
    else if (granularity === 'week') cursor.setDate(cursor.getDate() + 7)
    else cursor.setMonth(cursor.getMonth() + 1)
  }
  return counts
}

/** SQL-aggregated call counts by period (replaces loading all CallLog rows). */
export async function fetchCallActivitySeriesSql(
  filters: CallActivityFilters,
  granularity: CallActivityGranularity
): Promise<{ period: string; count: number }[]> {
  const { from, to, agentId, batchId } = filters
  const truncUnit = granularity === 'day' ? null : granularity
  const tenantCl = sqlAndTenant('cl')
  const tenantCo = sqlAndTenant('co')

  let rawRows: { period: Date; count: bigint }[]

  if (truncUnit) {
    if (agentId && batchId) {
      rawRows = await prisma.$queryRaw<{ period: Date; count: bigint }[]>`
        SELECT DATE_TRUNC(${truncUnit}, cl."calledAt") AS period, COUNT(*)::bigint AS count
        FROM "CallLog" cl
        INNER JOIN "Company" co ON co.id = cl."companyId"
        WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to}
          ${tenantCl} ${tenantCo}
          AND cl."agentId" = ${agentId} AND co."importBatchId" = ${batchId}
        GROUP BY 1 ORDER BY 1
      `
    } else if (agentId) {
      rawRows = await prisma.$queryRaw<{ period: Date; count: bigint }[]>`
        SELECT DATE_TRUNC(${truncUnit}, cl."calledAt") AS period, COUNT(*)::bigint AS count
        FROM "CallLog" cl
        WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to} ${tenantCl} AND cl."agentId" = ${agentId}
        GROUP BY 1 ORDER BY 1
      `
    } else if (batchId) {
      rawRows = await prisma.$queryRaw<{ period: Date; count: bigint }[]>`
        SELECT DATE_TRUNC(${truncUnit}, cl."calledAt") AS period, COUNT(*)::bigint AS count
        FROM "CallLog" cl
        INNER JOIN "Company" co ON co.id = cl."companyId"
        WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to}
          ${tenantCl} ${tenantCo} AND co."importBatchId" = ${batchId}
        GROUP BY 1 ORDER BY 1
      `
    } else {
      rawRows = await prisma.$queryRaw<{ period: Date; count: bigint }[]>`
        SELECT DATE_TRUNC(${truncUnit}, cl."calledAt") AS period, COUNT(*)::bigint AS count
        FROM "CallLog" cl
        WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to} ${tenantCl}
        GROUP BY 1 ORDER BY 1
      `
    }
  } else if (agentId && batchId) {
    rawRows = await prisma.$queryRaw<{ period: Date; count: bigint }[]>`
      SELECT DATE(cl."calledAt") AS period, COUNT(*)::bigint AS count
      FROM "CallLog" cl
      INNER JOIN "Company" co ON co.id = cl."companyId"
      WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to}
        ${tenantCl} ${tenantCo}
        AND cl."agentId" = ${agentId} AND co."importBatchId" = ${batchId}
      GROUP BY DATE(cl."calledAt") ORDER BY 1
    `
  } else if (agentId) {
    rawRows = await prisma.$queryRaw<{ period: Date; count: bigint }[]>`
      SELECT DATE(cl."calledAt") AS period, COUNT(*)::bigint AS count
      FROM "CallLog" cl
      WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to} ${tenantCl} AND cl."agentId" = ${agentId}
      GROUP BY DATE(cl."calledAt") ORDER BY 1
    `
  } else if (batchId) {
    rawRows = await prisma.$queryRaw<{ period: Date; count: bigint }[]>`
      SELECT DATE(cl."calledAt") AS period, COUNT(*)::bigint AS count
      FROM "CallLog" cl
      INNER JOIN "Company" co ON co.id = cl."companyId"
      WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to}
        ${tenantCl} ${tenantCo} AND co."importBatchId" = ${batchId}
      GROUP BY DATE(cl."calledAt") ORDER BY 1
    `
  } else {
    rawRows = await prisma.$queryRaw<{ period: Date; count: bigint }[]>`
      SELECT DATE(cl."calledAt") AS period, COUNT(*)::bigint AS count
      FROM "CallLog" cl
      WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to} ${tenantCl}
      GROUP BY DATE(cl."calledAt") ORDER BY 1
    `
  }

  const counts = fillPeriodBuckets(from, to, granularity)
  for (const row of rawRows) {
    const key = periodKeyFromSqlValue(row.period, granularity)
    counts.set(key, Number(row.count))
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, count]) => ({ period, count }))
}

export type AgentGapSqlRow = {
  agentId: string
  totalCalls: bigint
  avgGapMinutes: number | null
  medianGapMinutes: number | null
  gapCount: bigint
}

/** Per-agent gap stats via SQL window functions (no full log scan in JS). */
export async function fetchAgentGapStatsSql(
  filters: CallActivityFilters
): Promise<AgentGapSqlRow[]> {
  const { from, to, agentId, batchId } = filters
  const tenantCl = sqlAndTenant('cl')
  const tenantCo = sqlAndTenant('co')

  if (agentId && batchId) {
    return prisma.$queryRaw<AgentGapSqlRow[]>`
      WITH gaps AS (
        SELECT
          cl."agentId",
          EXTRACT(EPOCH FROM (
            cl."calledAt" - LAG(cl."calledAt") OVER (PARTITION BY cl."agentId" ORDER BY cl."calledAt")
          )) / 60.0 AS gap_minutes
        FROM "CallLog" cl
        INNER JOIN "Company" co ON co.id = cl."companyId"
        WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to}
          ${tenantCl} ${tenantCo}
          AND cl."agentId" = ${agentId} AND co."importBatchId" = ${batchId}
      )
      SELECT
        g."agentId",
        COUNT(*)::bigint + 1 AS "totalCalls",
        AVG(g.gap_minutes) FILTER (WHERE g.gap_minutes >= 0) AS "avgGapMinutes",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY g.gap_minutes) FILTER (WHERE g.gap_minutes >= 0) AS "medianGapMinutes",
        COUNT(g.gap_minutes) FILTER (WHERE g.gap_minutes >= 0)::bigint AS "gapCount"
      FROM gaps g
      GROUP BY g."agentId"
    `
  }

  if (agentId) {
    return prisma.$queryRaw<AgentGapSqlRow[]>`
      WITH gaps AS (
        SELECT
          cl."agentId",
          EXTRACT(EPOCH FROM (
            cl."calledAt" - LAG(cl."calledAt") OVER (PARTITION BY cl."agentId" ORDER BY cl."calledAt")
          )) / 60.0 AS gap_minutes
        FROM "CallLog" cl
        WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to} ${tenantCl} AND cl."agentId" = ${agentId}
      )
      SELECT
        g."agentId",
        COUNT(*)::bigint + 1 AS "totalCalls",
        AVG(g.gap_minutes) FILTER (WHERE g.gap_minutes >= 0) AS "avgGapMinutes",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY g.gap_minutes) FILTER (WHERE g.gap_minutes >= 0) AS "medianGapMinutes",
        COUNT(g.gap_minutes) FILTER (WHERE g.gap_minutes >= 0)::bigint AS "gapCount"
      FROM gaps g
      GROUP BY g."agentId"
    `
  }

  if (batchId) {
    return prisma.$queryRaw<AgentGapSqlRow[]>`
      WITH gaps AS (
        SELECT
          cl."agentId",
          EXTRACT(EPOCH FROM (
            cl."calledAt" - LAG(cl."calledAt") OVER (PARTITION BY cl."agentId" ORDER BY cl."calledAt")
          )) / 60.0 AS gap_minutes
        FROM "CallLog" cl
        INNER JOIN "Company" co ON co.id = cl."companyId"
        WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to}
          ${tenantCl} ${tenantCo} AND co."importBatchId" = ${batchId}
      )
      SELECT
        g."agentId",
        COUNT(*)::bigint + 1 AS "totalCalls",
        AVG(g.gap_minutes) FILTER (WHERE g.gap_minutes >= 0) AS "avgGapMinutes",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY g.gap_minutes) FILTER (WHERE g.gap_minutes >= 0) AS "medianGapMinutes",
        COUNT(g.gap_minutes) FILTER (WHERE g.gap_minutes >= 0)::bigint AS "gapCount"
      FROM gaps g
      GROUP BY g."agentId"
    `
  }

  return prisma.$queryRaw<AgentGapSqlRow[]>`
    WITH gaps AS (
      SELECT
        cl."agentId",
        EXTRACT(EPOCH FROM (
          cl."calledAt" - LAG(cl."calledAt") OVER (PARTITION BY cl."agentId" ORDER BY cl."calledAt")
        )) / 60.0 AS gap_minutes
      FROM "CallLog" cl
      WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to} ${tenantCl}
    )
    SELECT
      g."agentId",
      COUNT(*)::bigint + 1 AS "totalCalls",
      AVG(g.gap_minutes) FILTER (WHERE g.gap_minutes >= 0) AS "avgGapMinutes",
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY g.gap_minutes) FILTER (WHERE g.gap_minutes >= 0) AS "medianGapMinutes",
      COUNT(g.gap_minutes) FILTER (WHERE g.gap_minutes >= 0)::bigint AS "gapCount"
    FROM gaps g
    GROUP BY g."agentId"
  `
}

export async function fetchTotalCallsSql(filters: CallActivityFilters): Promise<number> {
  const { from, to, agentId, batchId } = filters
  const tenantCl = sqlAndTenant('cl')
  const tenantCo = sqlAndTenant('co')

  if (agentId && batchId) {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "CallLog" cl
      INNER JOIN "Company" co ON co.id = cl."companyId"
      WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to}
        ${tenantCl} ${tenantCo}
        AND cl."agentId" = ${agentId} AND co."importBatchId" = ${batchId}
    `
    return Number(rows[0]?.count ?? 0)
  }
  if (agentId) {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "CallLog" cl
      WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to} ${tenantCl} AND cl."agentId" = ${agentId}
    `
    return Number(rows[0]?.count ?? 0)
  }
  if (batchId) {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "CallLog" cl
      INNER JOIN "Company" co ON co.id = cl."companyId"
      WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to}
        ${tenantCl} ${tenantCo} AND co."importBatchId" = ${batchId}
    `
    return Number(rows[0]?.count ?? 0)
  }
  const rows = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM "CallLog" cl
    WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to} ${tenantCl}
  `
  return Number(rows[0]?.count ?? 0)
}

export async function fetchGlobalGapStatsSql(
  filters: CallActivityFilters
): Promise<{
  avgGapMinutes: number | null
  medianGapMinutes: number | null
  gapCount: number
}> {
  const { from, to, agentId, batchId } = filters
  const tenantCl = sqlAndTenant('cl')
  const tenantCo = sqlAndTenant('co')
  let rows: { avgGapMinutes: number | null; medianGapMinutes: number | null; gapCount: bigint }[]

  if (agentId && batchId) {
    rows = await prisma.$queryRaw`
      WITH gaps AS (
        SELECT EXTRACT(EPOCH FROM (
          cl."calledAt" - LAG(cl."calledAt") OVER (ORDER BY cl."calledAt")
        )) / 60.0 AS gap_minutes
        FROM "CallLog" cl
        INNER JOIN "Company" co ON co.id = cl."companyId"
        WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to}
          ${tenantCl} ${tenantCo}
          AND cl."agentId" = ${agentId} AND co."importBatchId" = ${batchId}
      )
      SELECT
        AVG(gap_minutes) FILTER (WHERE gap_minutes >= 0) AS "avgGapMinutes",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_minutes) FILTER (WHERE gap_minutes >= 0) AS "medianGapMinutes",
        COUNT(gap_minutes) FILTER (WHERE gap_minutes >= 0)::bigint AS "gapCount"
      FROM gaps
    `
  } else if (agentId) {
    rows = await prisma.$queryRaw`
      WITH gaps AS (
        SELECT EXTRACT(EPOCH FROM (
          cl."calledAt" - LAG(cl."calledAt") OVER (ORDER BY cl."calledAt")
        )) / 60.0 AS gap_minutes
        FROM "CallLog" cl
        WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to} ${tenantCl} AND cl."agentId" = ${agentId}
      )
      SELECT
        AVG(gap_minutes) FILTER (WHERE gap_minutes >= 0) AS "avgGapMinutes",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_minutes) FILTER (WHERE gap_minutes >= 0) AS "medianGapMinutes",
        COUNT(gap_minutes) FILTER (WHERE gap_minutes >= 0)::bigint AS "gapCount"
      FROM gaps
    `
  } else if (batchId) {
    rows = await prisma.$queryRaw`
      WITH gaps AS (
        SELECT EXTRACT(EPOCH FROM (
          cl."calledAt" - LAG(cl."calledAt") OVER (ORDER BY cl."calledAt")
        )) / 60.0 AS gap_minutes
        FROM "CallLog" cl
        INNER JOIN "Company" co ON co.id = cl."companyId"
        WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to}
          ${tenantCl} ${tenantCo} AND co."importBatchId" = ${batchId}
      )
      SELECT
        AVG(gap_minutes) FILTER (WHERE gap_minutes >= 0) AS "avgGapMinutes",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_minutes) FILTER (WHERE gap_minutes >= 0) AS "medianGapMinutes",
        COUNT(gap_minutes) FILTER (WHERE gap_minutes >= 0)::bigint AS "gapCount"
      FROM gaps
    `
  } else {
    rows = await prisma.$queryRaw`
      WITH gaps AS (
        SELECT EXTRACT(EPOCH FROM (
          cl."calledAt" - LAG(cl."calledAt") OVER (ORDER BY cl."calledAt")
        )) / 60.0 AS gap_minutes
        FROM "CallLog" cl
        WHERE cl."calledAt" >= ${from} AND cl."calledAt" <= ${to} ${tenantCl}
      )
      SELECT
        AVG(gap_minutes) FILTER (WHERE gap_minutes >= 0) AS "avgGapMinutes",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gap_minutes) FILTER (WHERE gap_minutes >= 0) AS "medianGapMinutes",
        COUNT(gap_minutes) FILTER (WHERE gap_minutes >= 0)::bigint AS "gapCount"
      FROM gaps
    `
  }

  const row = rows[0]
  return {
    avgGapMinutes: row?.avgGapMinutes ?? null,
    medianGapMinutes: row?.medianGapMinutes ?? null,
    gapCount: Number(row?.gapCount ?? 0),
  }
}
