import { prisma } from './prisma'
import { Prisma } from '@prisma/client'
import {
  addDaysYmd,
  daysInMonth,
  getAppTimezone,
  isoDowForYmd,
  localDayEndUtc,
  localDayStartUtc,
  parseYmdString,
  todayYmdInAppTz,
  toLocalWallClockSql,
} from './appTimezone'
import { FUNNEL_PIPELINE_KEYS, pipelineBucketForDisposition } from './companyDisposition'
import { RESPONSE_OPTIONS, SALES_FUNNEL_DISPOSITIONS } from './responseOptions'

/** Zero-progress dispositions agents can select (excludes audit-only e.g. AGENDA_COMPLETADA). */
const ZERO_PROGRESS_CALL_DISPOSITIONS = RESPONSE_OPTIONS.filter(
  (o) => o.progress === 0 && o.agentSelectable !== false
).map((o) => o.code)

export type ReportPeriod = 'day' | 'week' | 'month' | 'range'

export type AgentCallRow = {
  agentId: string
  name: string
  calls: number
  registered: number
}

export type HeatmapCell = {
  dow: number
  hour: number
  calls: number
}

function parseReportPeriod(value?: string): ReportPeriod {
  if (value === 'week' || value === 'month' || value === 'range') return value
  return 'day'
}

/** Calendar day, ISO week (Mon–Sun), calendar month, or explicit from/to range (app timezone). */
export function resolvePeriodRange(
  period: ReportPeriod,
  dateStr?: string,
  fromStr?: string,
  toStr?: string
): { from: Date; to: Date; date: string } {
  const tz = getAppTimezone()
  const todayYmd = todayYmdInAppTz()

  if (period === 'range') {
    let fromYmd = parseYmdString(fromStr) ?? todayYmd
    let toYmd = parseYmdString(toStr ?? fromStr) ?? fromYmd
    if (toYmd < fromYmd) {
      const swap = fromYmd
      fromYmd = toYmd
      toYmd = swap
    }
    return {
      from: localDayStartUtc(fromYmd, tz),
      to: localDayEndUtc(toYmd, tz),
      date: fromYmd,
    }
  }

  const baseYmd = parseYmdString(dateStr) ?? todayYmd

  if (period === 'day') {
    return {
      from: localDayStartUtc(baseYmd, tz),
      to: localDayEndUtc(baseYmd, tz),
      date: baseYmd,
    }
  }

  if (period === 'week') {
    const dow = isoDowForYmd(baseYmd, tz)
    const mondayYmd = addDaysYmd(baseYmd, -(dow - 1), tz)
    const sundayYmd = addDaysYmd(mondayYmd, 6, tz)
    return {
      from: localDayStartUtc(mondayYmd, tz),
      to: localDayEndUtc(sundayYmd, tz),
      date: mondayYmd,
    }
  }

  const [y, m] = baseYmd.split('-').map(Number)
  const monthStart = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = daysInMonth(y, m)
  const monthEnd = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return {
    from: localDayStartUtc(monthStart, tz),
    to: localDayEndUtc(monthEnd, tz),
    date: monthStart,
  }
}

export async function fetchAgentCallsByPeriod(params: {
  period?: string
  date?: string
  from?: string
  to?: string
}): Promise<{ period: ReportPeriod; date: string; from: string; to: string; agents: AgentCallRow[] }> {
  const period = parseReportPeriod(params.period)
  const { from, to, date } =
    period === 'range'
      ? resolvePeriodRange('range', undefined, params.from, params.to)
      : resolvePeriodRange(period, params.date)

  const agents = await prisma.user.findMany({
    where: { role: 'AGENT', active: true },
    select: { id: true, name: true },
  })

  const rows = await prisma.$queryRaw<{ agentId: string; calls: bigint; registered: bigint }[]>`
    SELECT
      cl."agentId",
      COUNT(*)::bigint AS calls,
      COUNT(DISTINCT cl."companyId")::bigint AS registered
    FROM "CallLog" cl
    INNER JOIN "User" u ON u.id = cl."agentId" AND u.role = 'AGENT' AND u.active = true
    WHERE cl."calledAt" >= ${from}
      AND cl."calledAt" <= ${to}
    GROUP BY cl."agentId"
  `

  const statsByAgent = Object.fromEntries(
    rows.map((r) => [
      r.agentId,
      { calls: Number(r.calls), registered: Number(r.registered) },
    ])
  )

  const result = agents
    .map((a) => {
      const calls = statsByAgent[a.id]?.calls ?? 0
      const registered = Math.min(statsByAgent[a.id]?.registered ?? 0, calls)
      return {
        agentId: a.id,
        name: a.name,
        calls,
        registered,
      }
    })
    .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name))

  return {
    period,
    date,
    from: from.toISOString(),
    to: to.toISOString(),
    agents: result,
  }
}

const FUNNEL_CALL_DISPOSITIONS = [...SALES_FUNNEL_DISPOSITIONS, 'INTERESTED'] as const

export async function fetchFunnelByPeriod(params: {
  from?: string
  to?: string
  agentId?: string
}): Promise<{
  from: string
  to: string
  stages: Record<string, number>
  total: number
  registeredStages: Record<string, number>
  registeredTotal: number
}> {
  const { from, to } = resolvePeriodRange('range', undefined, params.from, params.to)

  const agentFilter = params.agentId
    ? Prisma.sql`AND cl."agentId" = ${params.agentId}`
    : Prisma.sql`AND cl."agentId" IN (SELECT id FROM "User" WHERE role = 'AGENT' AND active = true)`

  const rows = await prisma.$queryRaw<{ disposition: string; calls: bigint; registered: bigint }[]>`
    SELECT
      cl.disposition,
      COUNT(*)::bigint AS calls,
      COUNT(DISTINCT cl."companyId")::bigint AS registered
    FROM "CallLog" cl
    WHERE cl."calledAt" >= ${from}
      AND cl."calledAt" <= ${to}
      AND cl.disposition IN (${Prisma.join([...FUNNEL_CALL_DISPOSITIONS])})
      ${agentFilter}
    GROUP BY cl.disposition
  `

  const stages = Object.fromEntries(FUNNEL_PIPELINE_KEYS.map((k) => [k, 0])) as Record<string, number>
  const registeredStages = Object.fromEntries(FUNNEL_PIPELINE_KEYS.map((k) => [k, 0])) as Record<string, number>
  for (const row of rows) {
    const bucket = pipelineBucketForDisposition(row.disposition)
    if ((FUNNEL_PIPELINE_KEYS as readonly string[]).includes(bucket)) {
      stages[bucket] += Number(row.calls)
      registeredStages[bucket] += Number(row.registered)
    }
  }

  const total = Object.values(stages).reduce((sum, n) => sum + n, 0)
  const registeredTotal = Object.values(registeredStages).reduce((sum, n) => sum + n, 0)

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    stages,
    total,
    registeredStages,
    registeredTotal,
  }
}

export async function fetchZeroResponsesByPeriod(params: {
  from?: string
  to?: string
  agentId?: string
}): Promise<{
  from: string
  to: string
  dispositions: Record<string, number>
  total: number
  registeredDispositions: Record<string, number>
  registeredTotal: number
}> {
  const { from, to } = resolvePeriodRange('range', undefined, params.from, params.to)

  const agentFilter = params.agentId
    ? Prisma.sql`AND cl."agentId" = ${params.agentId}`
    : Prisma.sql`AND cl."agentId" IN (SELECT id FROM "User" WHERE role = 'AGENT' AND active = true)`

  const rows = await prisma.$queryRaw<{ disposition: string; calls: bigint; registered: bigint }[]>`
    SELECT
      cl.disposition,
      COUNT(*)::bigint AS calls,
      COUNT(DISTINCT cl."companyId")::bigint AS registered
    FROM "CallLog" cl
    WHERE cl."calledAt" >= ${from}
      AND cl."calledAt" <= ${to}
      AND cl.disposition IN (${Prisma.join(ZERO_PROGRESS_CALL_DISPOSITIONS)})
      ${agentFilter}
    GROUP BY cl.disposition
  `

  const dispositions = Object.fromEntries(
    ZERO_PROGRESS_CALL_DISPOSITIONS.map((k) => [k, 0])
  ) as Record<string, number>
  const registeredDispositions = Object.fromEntries(
    ZERO_PROGRESS_CALL_DISPOSITIONS.map((k) => [k, 0])
  ) as Record<string, number>
  for (const row of rows) {
    if ((ZERO_PROGRESS_CALL_DISPOSITIONS as readonly string[]).includes(row.disposition)) {
      dispositions[row.disposition] = Number(row.calls)
      registeredDispositions[row.disposition] = Number(row.registered)
    }
  }

  const total = Object.values(dispositions).reduce((sum, n) => sum + n, 0)
  const registeredTotal = Object.values(registeredDispositions).reduce((sum, n) => sum + n, 0)

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    dispositions,
    total,
    registeredDispositions,
    registeredTotal,
  }
}

export async function fetchCallHeatmap(params: {
  weeks?: string | number
  from?: string
  to?: string
  agentId?: string
}): Promise<{ from: string; to: string; cells: HeatmapCell[] }> {
  let fromDate: Date
  let toDate: Date

  if (params.from && params.to) {
    const range = resolvePeriodRange('range', undefined, params.from, params.to)
    fromDate = range.from
    toDate = range.to
  } else {
    const weeks = Math.min(Math.max(Number(params.weeks) || 4, 1), 12)
    const toYmd = todayYmdInAppTz()
    const fromYmd = addDaysYmd(toYmd, -weeks * 7, getAppTimezone())
    fromDate = localDayStartUtc(fromYmd)
    toDate = localDayEndUtc(toYmd)
  }

  const agentFilter = params.agentId
    ? Prisma.sql`AND cl."agentId" = ${params.agentId}`
    : Prisma.sql`AND cl."agentId" IN (SELECT id FROM "User" WHERE role = 'AGENT' AND active = true)`

  const localCalledAt = toLocalWallClockSql('cl."calledAt"')

  const rows = await prisma.$queryRaw<{ dow: number; hour: number; calls: bigint }[]>`
    SELECT
      EXTRACT(ISODOW FROM ${localCalledAt})::int AS dow,
      EXTRACT(HOUR FROM ${localCalledAt})::int AS hour,
      COUNT(*)::bigint AS calls
    FROM "CallLog" cl
    WHERE cl."calledAt" >= ${fromDate}
      AND cl."calledAt" <= ${toDate}
      ${agentFilter}
      AND EXTRACT(HOUR FROM ${localCalledAt}) >= 9
      AND EXTRACT(HOUR FROM ${localCalledAt}) <= 18
    GROUP BY dow, hour
  `

  const lookup = new Map<string, number>()
  for (const row of rows) {
    lookup.set(`${row.dow}:${row.hour}`, Number(row.calls))
  }

  const cells: HeatmapCell[] = []
  for (let dow = 1; dow <= 7; dow++) {
    for (let hour = 9; hour <= 18; hour++) {
      cells.push({
        dow,
        hour,
        calls: lookup.get(`${dow}:${hour}`) ?? 0,
      })
    }
  }

  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
    cells,
  }
}
