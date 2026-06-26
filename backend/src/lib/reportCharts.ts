import { prisma } from './prisma'
import { Prisma } from '@prisma/client'
import { parseDateParam } from './callActivity'

export type ReportPeriod = 'day' | 'week' | 'month'

export type AgentCallRow = {
  agentId: string
  name: string
  calls: number
}

export type HeatmapCell = {
  dow: number
  hour: number
  calls: number
}

function parseReportPeriod(value?: string): ReportPeriod {
  if (value === 'week' || value === 'month') return value
  return 'day'
}

/** Calendar day, ISO week (Mon–Sun), or calendar month containing `date`. */
export function resolvePeriodRange(
  period: ReportPeriod,
  dateStr?: string
): { from: Date; to: Date; date: string } {
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
}): Promise<{ period: ReportPeriod; date: string; from: string; to: string; agents: AgentCallRow[] }> {
  const period = parseReportPeriod(params.period)
  const { from, to, date } = resolvePeriodRange(period, params.date)

  const agents = await prisma.user.findMany({
    where: { role: 'AGENT', active: true },
    select: { id: true, name: true },
  })

  const rows = await prisma.$queryRaw<{ agentId: string; calls: bigint }[]>`
    SELECT cl."agentId", COUNT(*)::bigint AS calls
    FROM "CallLog" cl
    INNER JOIN "User" u ON u.id = cl."agentId" AND u.role = 'AGENT' AND u.active = true
    WHERE cl."calledAt" >= ${from}
      AND cl."calledAt" <= ${to}
    GROUP BY cl."agentId"
  `

  const callsByAgent = Object.fromEntries(rows.map((r) => [r.agentId, Number(r.calls)]))

  const result = agents
    .map((a) => ({
      agentId: a.id,
      name: a.name,
      calls: callsByAgent[a.id] ?? 0,
    }))
    .sort((a, b) => b.calls - a.calls || a.name.localeCompare(b.name))

  return {
    period,
    date,
    from: from.toISOString(),
    to: to.toISOString(),
    agents: result,
  }
}

export async function fetchCallHeatmap(params: {
  weeks?: string | number
  agentId?: string
}): Promise<{ weeks: number; cells: HeatmapCell[] }> {
  const weeks = Math.min(Math.max(Number(params.weeks) || 4, 1), 12)
  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - weeks * 7)
  fromDate.setHours(0, 0, 0, 0)

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

  return { weeks, cells }
}
