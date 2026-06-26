import { prisma } from './prisma'
import { Prisma } from '@prisma/client'
import { parseDateParam } from './callActivity'
import { FUNNEL_PIPELINE_KEYS, pipelineBucketForDisposition } from './companyDisposition'
import { SALES_FUNNEL_DISPOSITIONS } from './responseOptions'

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

/** Calendar day, ISO week (Mon–Sun), calendar month, or explicit from/to range. */
export function resolvePeriodRange(
  period: ReportPeriod,
  dateStr?: string,
  fromStr?: string,
  toStr?: string
): { from: Date; to: Date; date: string } {
  if (period === 'range') {
    const fallback = new Date()
    const from = parseDateParam(fromStr, fallback)
    from.setHours(0, 0, 0, 0)
    const to = parseDateParam(toStr ?? fromStr, from)
    to.setHours(23, 59, 59, 999)
    if (to < from) {
      const swap = new Date(from)
      from.setTime(to.getTime())
      from.setHours(0, 0, 0, 0)
      to.setTime(swap.getTime())
      to.setHours(23, 59, 59, 999)
    }
    return { from, to, date: from.toISOString().slice(0, 10) }
  }

  const base = parseDateParam(dateStr, new Date())
  base.setHours(12, 0, 0, 0)

  if (period === 'day') {
    const from = new Date(base)
    from.setHours(0, 0, 0, 0)
    const to = new Date(base)
    to.setHours(23, 59, 59, 999)
    return { from, to, date: from.toISOString().slice(0, 10) }
  }

  if (period === 'week') {
    const day = base.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const from = new Date(base)
    from.setDate(base.getDate() + diff)
    from.setHours(0, 0, 0, 0)
    const to = new Date(from)
    to.setDate(from.getDate() + 6)
    to.setHours(23, 59, 59, 999)
    return { from, to, date: from.toISOString().slice(0, 10) }
  }

  const from = new Date(base.getFullYear(), base.getMonth(), 1, 0, 0, 0, 0)
  const to = new Date(base.getFullYear(), base.getMonth() + 1, 0, 23, 59, 59, 999)
  return { from, to, date: from.toISOString().slice(0, 10) }
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
}): Promise<{ from: string; to: string; stages: Record<string, number>; total: number }> {
  const { from, to } = resolvePeriodRange('range', undefined, params.from, params.to)

  const agentFilter = params.agentId
    ? Prisma.sql`AND cl."agentId" = ${params.agentId}`
    : Prisma.sql`AND cl."agentId" IN (SELECT id FROM "User" WHERE role = 'AGENT' AND active = true)`

  const rows = await prisma.$queryRaw<{ disposition: string; calls: bigint }[]>`
    SELECT cl.disposition, COUNT(*)::bigint AS calls
    FROM "CallLog" cl
    WHERE cl."calledAt" >= ${from}
      AND cl."calledAt" <= ${to}
      AND cl.disposition IN (${Prisma.join([...FUNNEL_CALL_DISPOSITIONS])})
      ${agentFilter}
    GROUP BY cl.disposition
  `

  const stages = Object.fromEntries(FUNNEL_PIPELINE_KEYS.map((k) => [k, 0])) as Record<string, number>
  for (const row of rows) {
    const bucket = pipelineBucketForDisposition(row.disposition)
    if ((FUNNEL_PIPELINE_KEYS as readonly string[]).includes(bucket)) {
      stages[bucket] += Number(row.calls)
    }
  }

  const total = Object.values(stages).reduce((sum, n) => sum + n, 0)

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    stages,
    total,
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
    fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - weeks * 7)
    fromDate.setHours(0, 0, 0, 0)
    toDate = new Date()
    toDate.setHours(23, 59, 59, 999)
  }

  const agentFilter = params.agentId
    ? Prisma.sql`AND cl."agentId" = ${params.agentId}`
    : Prisma.sql`AND cl."agentId" IN (SELECT id FROM "User" WHERE role = 'AGENT' AND active = true)`

  const rows = await prisma.$queryRaw<{ dow: number; hour: number; calls: bigint }[]>`
    SELECT
      EXTRACT(ISODOW FROM cl."calledAt")::int AS dow,
      EXTRACT(HOUR FROM cl."calledAt")::int AS hour,
      COUNT(*)::bigint AS calls
    FROM "CallLog" cl
    WHERE cl."calledAt" >= ${fromDate}
      AND cl."calledAt" <= ${toDate}
      ${agentFilter}
      AND EXTRACT(HOUR FROM cl."calledAt") >= 9
      AND EXTRACT(HOUR FROM cl."calledAt") <= 18
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
