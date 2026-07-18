import { prisma } from './prisma'
import { Prisma } from '@prisma/client'
import { getLatestResetAtByAgentIds } from './agentReset'
import {
  addDaysYmd,
  localDayEndUtc,
  localDayStartUtc,
  parseYmdString,
  todayYmdInAppTz,
  toLocalWallClockSql,
} from './appTimezone'
import {
  parseDateParam,
  parseDateEndParam,
  parseGranularity,
  type CallActivityGranularity,
} from './callActivity'
import { sqlAndTenant } from './tenant'

export type DailyActivityRow = {
  date: string
  calls: number
  newRegistrations: number
  updatedRegistrations: number
  contactedCompanies: number
}

export type HourlyActivityRow = {
  hour: number
  calls: number
  newRegistrations: number
  updatedRegistrations: number
}

function toDateKey(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

function buildDateRangeMap(days: number): Record<string, DailyActivityRow> {
  const map: Record<string, DailyActivityRow> = {}
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    map[key] = {
      date: key,
      calls: 0,
      newRegistrations: 0,
      updatedRegistrations: 0,
      contactedCompanies: 0,
    }
  }
  return map
}

function fillDailyMap(
  map: Record<string, DailyActivityRow>,
  rows: {
    day: Date
    calls: bigint
    newRegistrations: bigint
    updatedRegistrations: bigint
    contactedCompanies: bigint
  }[]
) {
  for (const row of rows) {
    const key = toDateKey(row.day)
    if (key in map) {
      map[key] = {
        date: key,
        calls: Number(row.calls),
        newRegistrations: Number(row.newRegistrations),
        updatedRegistrations: Number(row.updatedRegistrations),
        contactedCompanies: Number(row.contactedCompanies),
      }
    }
  }
}

/** SQL aggregation for daily call / registration metrics (no pre-aggregated table). */
export async function fetchDailyActivityFromSql(
  fromDate: Date,
  filterAgentId?: string
): Promise<DailyActivityRow[]> {
  const days = Math.ceil((Date.now() - fromDate.getTime()) / 86_400_000) + 1
  const map = buildDateRangeMap(Math.min(Math.max(days, 7), 30))

  const rows = filterAgentId
    ? await prisma.$queryRaw<
        {
          day: Date
          calls: bigint
          newRegistrations: bigint
          updatedRegistrations: bigint
          contactedCompanies: bigint
        }[]
      >`
        WITH ranked AS (
          SELECT
            "calledAt",
            "companyId",
            "agentId",
            ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "calledAt", id) AS company_rank
          FROM "CallLog"
          WHERE "calledAt" >= ${fromDate} AND "agentId" = ${filterAgentId} ${sqlAndTenant()}
        ),
        daily AS (
          SELECT
            DATE("calledAt") AS day,
            COUNT(*)::bigint AS calls,
            COUNT(*) FILTER (WHERE company_rank = 1)::bigint AS "newRegistrations",
            COUNT(*) FILTER (WHERE company_rank > 1)::bigint AS "updatedRegistrations"
          FROM ranked
          GROUP BY DATE("calledAt")
        ),
        contacted AS (
          SELECT
            DATE("calledAt") AS day,
            COUNT(DISTINCT "companyId")::bigint AS "contactedCompanies"
          FROM "CallLog"
          WHERE "calledAt" >= ${fromDate} AND "agentId" = ${filterAgentId} ${sqlAndTenant()}
          GROUP BY DATE("calledAt")
        )
        SELECT
          d.day,
          d.calls,
          d."newRegistrations",
          d."updatedRegistrations",
          COALESCE(c."contactedCompanies", 0::bigint) AS "contactedCompanies"
        FROM daily d
        LEFT JOIN contacted c ON c.day = d.day
      `
    : await prisma.$queryRaw<
        {
          day: Date
          calls: bigint
          newRegistrations: bigint
          updatedRegistrations: bigint
          contactedCompanies: bigint
        }[]
      >`
        WITH ranked AS (
          SELECT
            "calledAt",
            "companyId",
            "agentId",
            ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "calledAt", id) AS company_rank
          FROM "CallLog"
          WHERE "calledAt" >= ${fromDate} ${sqlAndTenant()}
        ),
        daily AS (
          SELECT
            DATE("calledAt") AS day,
            COUNT(*)::bigint AS calls,
            COUNT(*) FILTER (WHERE company_rank = 1)::bigint AS "newRegistrations",
            COUNT(*) FILTER (WHERE company_rank > 1)::bigint AS "updatedRegistrations"
          FROM ranked
          GROUP BY DATE("calledAt")
        ),
        contacted AS (
          SELECT
            DATE("calledAt") AS day,
            COUNT(DISTINCT "companyId")::bigint AS "contactedCompanies"
          FROM "CallLog"
          WHERE "calledAt" >= ${fromDate} ${sqlAndTenant()}
          GROUP BY DATE("calledAt")
        )
        SELECT
          d.day,
          d.calls,
          d."newRegistrations",
          d."updatedRegistrations",
          COALESCE(c."contactedCompanies", 0::bigint) AS "contactedCompanies"
        FROM daily d
        LEFT JOIN contacted c ON c.day = d.day
      `

  fillDailyMap(map, rows)
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchDailyTrendsFromTable(
  fromDate: Date,
  toDate: Date,
  filterAgentId?: string
): Promise<DailyActivityRow[]> {
  const rows = await prisma.dailyAgentMetrics.findMany({
    where: {
      date: { gte: fromDate, lte: toDate },
      ...(filterAgentId ? { agentId: filterAgentId } : {}),
    },
    orderBy: { date: 'asc' },
    select: {
      date: true,
      calls: true,
      newRegistrations: true,
      updatedRegistrations: true,
      contactedCompanies: true,
      agentId: true,
    },
  })

  if (filterAgentId) {
    return rows.map((r) => ({
      date: toDateKey(r.date),
      calls: r.calls,
      newRegistrations: r.newRegistrations,
      updatedRegistrations: r.updatedRegistrations,
      contactedCompanies: r.contactedCompanies,
    }))
  }

  const byDay = new Map<string, DailyActivityRow>()
  for (const r of rows) {
    const key = toDateKey(r.date)
    const existing = byDay.get(key) ?? {
      date: key,
      calls: 0,
      newRegistrations: 0,
      updatedRegistrations: 0,
      contactedCompanies: 0,
    }
    existing.calls += r.calls
    existing.newRegistrations += r.newRegistrations
    existing.updatedRegistrations += r.updatedRegistrations
    existing.contactedCompanies += r.contactedCompanies
    byDay.set(key, existing)
  }

  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchReportTrends(params: {
  from?: string
  to?: string
  agentId?: string
  granularity?: string
}): Promise<{
  series: DailyActivityRow[]
  from: string
  to: string
  granularity: CallActivityGranularity
  source: 'table' | 'sql'
}> {
  const todayYmd = todayYmdInAppTz()
  const defaultFromYmd = addDaysYmd(todayYmd, -30)
  const defaultFrom = localDayStartUtc(defaultFromYmd)
  const defaultTo = localDayEndUtc(todayYmd)

  const fromDate = parseDateParam(params.from, defaultFrom)
  const toDate = parseDateEndParam(params.to, defaultTo)
  const granularity = parseGranularity(params.granularity)

  const metricsCount = await prisma.dailyAgentMetrics.count({
    where: { date: { gte: fromDate, lte: toDate } },
    take: 1,
  })

  let series: DailyActivityRow[]
  let source: 'table' | 'sql'

  if (metricsCount > 0) {
    series = await fetchDailyTrendsFromTable(fromDate, toDate, params.agentId)
    source = 'table'

    const cursor = new Date(fromDate)
    const filled = new Map<string, DailyActivityRow>()
    while (cursor <= toDate) {
      const key = cursor.toISOString().slice(0, 10)
      filled.set(key, {
        date: key,
        calls: 0,
        newRegistrations: 0,
        updatedRegistrations: 0,
        contactedCompanies: 0,
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    for (const row of series) filled.set(row.date, row)
    series = [...filled.values()].sort((a, b) => a.date.localeCompare(b.date))
  } else {
    series = await fetchDailyActivityFromSql(fromDate, params.agentId)
    source = 'sql'
  }

  if (granularity !== 'day') {
    // Reports trends endpoint is day-focused; week/month rollup kept for API compatibility.
    series = rollupDailySeries(series, granularity)
  }

  return {
    series,
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    granularity,
    source,
  }
}

function rollupDailySeries(
  series: DailyActivityRow[],
  granularity: 'week' | 'month'
): DailyActivityRow[] {
  const buckets = new Map<string, DailyActivityRow>()

  for (const row of series) {
    const date = new Date(row.date + 'T12:00:00')
    let key: string
    if (granularity === 'month') {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
    } else {
      const day = date.getDay()
      const diff = day === 0 ? -6 : 1 - day
      const monday = new Date(date)
      monday.setDate(date.getDate() + diff)
      key = monday.toISOString().slice(0, 10)
    }
    const existing = buckets.get(key) ?? {
      date: key,
      calls: 0,
      newRegistrations: 0,
      updatedRegistrations: 0,
      contactedCompanies: 0,
    }
    existing.calls += row.calls
    existing.newRegistrations += row.newRegistrations
    existing.updatedRegistrations += row.updatedRegistrations
    existing.contactedCompanies += row.contactedCompanies
    buckets.set(key, existing)
  }

  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Hourly breakdown for a single agent day (work hours 9–18). */
export async function fetchHourlyActivity(
  dateStr: string,
  agentId: string
): Promise<HourlyActivityRow[]> {
  const dayYmd = parseYmdString(dateStr) ?? todayYmdInAppTz()
  const dayStart = localDayStartUtc(dayYmd)
  const dayEnd = localDayEndUtc(dayYmd)
  const localCalledAt = toLocalWallClockSql('"calledAt"')

  const rows = await prisma.$queryRaw<
    { hour: number; calls: bigint; newRegistrations: bigint; updatedRegistrations: bigint }[]
  >`
    WITH ranked AS (
      SELECT
        "calledAt",
        EXTRACT(HOUR FROM ${localCalledAt})::int AS hour,
        ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "calledAt", id) AS company_rank
      FROM "CallLog"
      WHERE "agentId" = ${agentId}
        AND "calledAt" >= ${dayStart}
        AND "calledAt" <= ${dayEnd}
        ${sqlAndTenant()}
        AND EXTRACT(HOUR FROM ${localCalledAt}) >= 9
        AND EXTRACT(HOUR FROM ${localCalledAt}) <= 18
    )
    SELECT
      hour,
      COUNT(*)::bigint AS calls,
      COUNT(*) FILTER (WHERE company_rank = 1)::bigint AS "newRegistrations",
      COUNT(*) FILTER (WHERE company_rank > 1)::bigint AS "updatedRegistrations"
    FROM ranked
    GROUP BY hour
    ORDER BY hour
  `

  const byHour = new Map<number, HourlyActivityRow>()
  for (let h = 9; h <= 18; h++) {
    byHour.set(h, { hour: h, calls: 0, newRegistrations: 0, updatedRegistrations: 0 })
  }
  for (const row of rows) {
    if (row.hour >= 9 && row.hour <= 18) {
      byHour.set(row.hour, {
        hour: row.hour,
        calls: Number(row.calls),
        newRegistrations: Number(row.newRegistrations),
        updatedRegistrations: Number(row.updatedRegistrations),
      })
    }
  }

  return [...byHour.values()]
}

export async function fetchAgentSparklines(
  agentIds: string[],
  days = 7
): Promise<Record<string, { date: string; calls: number }[]>> {
  if (agentIds.length === 0) return {}

  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - (days - 1))
  fromDate.setHours(0, 0, 0, 0)

  const metricsCount = await prisma.dailyAgentMetrics.count({ take: 1 })

  if (metricsCount > 0) {
    const resetAtByAgent = await getLatestResetAtByAgentIds(agentIds)
    const rows = await prisma.dailyAgentMetrics.findMany({
      where: {
        agentId: { in: agentIds },
        date: { gte: fromDate },
      },
      orderBy: { date: 'asc' },
      select: { agentId: true, date: true, calls: true },
    })

    const result: Record<string, { date: string; calls: number }[]> = {}
    for (const id of agentIds) {
      result[id] = buildSparklineDays(fromDate, days)
    }
    for (const row of rows) {
      const resetAt = resetAtByAgent.get(row.agentId)
      if (resetAt && row.date.getTime() < resetAt.getTime()) continue
      const key = toDateKey(row.date)
      if (!result[row.agentId]) result[row.agentId] = buildSparklineDays(fromDate, days)
      const point = result[row.agentId].find((p) => p.date === key)
      if (point) point.calls = row.calls
    }
    return result
  }

  const rows = await prisma.$queryRaw<{ agentId: string; day: Date; calls: bigint }[]>`
    SELECT cl."agentId", DATE(cl."calledAt") AS day, COUNT(*)::bigint AS calls
    FROM "CallLog" cl
    LEFT JOIN LATERAL (
      SELECT "createdAt" AS reset_at
      FROM "AgentResetLog"
      WHERE "originalAgentId" = cl."agentId" ${sqlAndTenant()}
      ORDER BY "createdAt" DESC
      LIMIT 1
    ) r ON true
    WHERE cl."calledAt" >= ${fromDate}
      ${sqlAndTenant('cl')}
      AND cl."agentId" IN (${Prisma.join(agentIds)})
      AND (r.reset_at IS NULL OR cl."calledAt" >= r.reset_at)
    GROUP BY cl."agentId", DATE(cl."calledAt")
  `

  const result: Record<string, { date: string; calls: number }[]> = {}
  for (const id of agentIds) {
    result[id] = buildSparklineDays(fromDate, days)
  }
  for (const row of rows) {
    const key = toDateKey(row.day)
    if (!result[row.agentId]) result[row.agentId] = buildSparklineDays(fromDate, days)
    const point = result[row.agentId].find((p) => p.date === key)
    if (point) point.calls = Number(row.calls)
  }
  return result
}

function buildSparklineDays(fromDate: Date, days: number): { date: string; calls: number }[] {
  const series: { date: string; calls: number }[] = []
  const cursor = new Date(fromDate)
  for (let i = 0; i < days; i++) {
    series.push({ date: cursor.toISOString().slice(0, 10), calls: 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  return series
}
