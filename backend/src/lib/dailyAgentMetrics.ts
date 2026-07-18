import { prisma } from './prisma'
import { OPTICK_TENANT_ID } from './tenant'

function toUtcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

type CallLogForMetrics = {
  id: string
  companyId: string
  agentId: string
  calledAt: Date
}

/** Incrementally update DailyAgentMetrics when a call log is created. */
export async function incrementDailyMetricsForNewCall(callLog: CallLogForMetrics): Promise<void> {
  const date = toUtcDateOnly(callLog.calledAt)

  const [priorCompanyCalls, priorDayCompanyCalls] = await Promise.all([
    prisma.callLog.count({
      where: {
        companyId: callLog.companyId,
        OR: [
          { calledAt: { lt: callLog.calledAt } },
          { calledAt: callLog.calledAt, id: { lt: callLog.id } },
        ],
      },
    }),
    prisma.callLog.count({
      where: {
        companyId: callLog.companyId,
        agentId: callLog.agentId,
        calledAt: {
          gte: new Date(date),
          lt: new Date(date.getTime() + 86_400_000),
        },
        id: { not: callLog.id },
      },
    }),
  ])

  const isNewRegistration = priorCompanyCalls === 0
  const isNewCompanyContactToday = priorDayCompanyCalls === 0

  await prisma.dailyAgentMetrics.upsert({
    where: {
      date_agentId: { date, agentId: callLog.agentId },
    },
    create: {
      tenantId: OPTICK_TENANT_ID,
      date,
      agentId: callLog.agentId,
      calls: 1,
      newRegistrations: isNewRegistration ? 1 : 0,
      updatedRegistrations: isNewRegistration ? 0 : 1,
      contactedCompanies: isNewCompanyContactToday ? 1 : 0,
    },
    update: {
      calls: { increment: 1 },
      ...(isNewRegistration
        ? { newRegistrations: { increment: 1 } }
        : { updatedRegistrations: { increment: 1 } }),
      ...(isNewCompanyContactToday ? { contactedCompanies: { increment: 1 } } : {}),
    },
  })
}

/** Rebuild DailyAgentMetrics from CallLog for a date range (backfill / nightly job). */
export async function backfillDailyAgentMetrics(options?: {
  from?: Date
  to?: Date
  agentId?: string
}): Promise<{ daysProcessed: number; rowsUpserted: number }> {
  const from = options?.from ?? new Date(0)
  from.setHours(0, 0, 0, 0)
  const to = options?.to ?? new Date()
  to.setHours(23, 59, 59, 999)

  const rows = options?.agentId
    ? await prisma.$queryRaw<
        {
          day: Date
          agentId: string
          calls: bigint
          newRegistrations: bigint
          updatedRegistrations: bigint
          contactedCompanies: bigint
        }[]
      >`
        WITH ranked AS (
          SELECT
            cl."calledAt",
            cl."companyId",
            cl."agentId",
            ROW_NUMBER() OVER (PARTITION BY cl."companyId" ORDER BY cl."calledAt", cl.id) AS company_rank
          FROM "CallLog" cl
          WHERE cl."calledAt" >= ${from}
            AND cl."calledAt" <= ${to}
            AND cl."agentId" = ${options.agentId}
        ),
        daily AS (
          SELECT
            DATE("calledAt") AS day,
            "agentId",
            COUNT(*)::bigint AS calls,
            COUNT(*) FILTER (WHERE company_rank = 1)::bigint AS "newRegistrations",
            COUNT(*) FILTER (WHERE company_rank > 1)::bigint AS "updatedRegistrations"
          FROM ranked
          GROUP BY DATE("calledAt"), "agentId"
        ),
        contacted AS (
          SELECT
            DATE("calledAt") AS day,
            "agentId",
            COUNT(DISTINCT "companyId")::bigint AS "contactedCompanies"
          FROM "CallLog"
          WHERE "calledAt" >= ${from}
            AND "calledAt" <= ${to}
            AND "agentId" = ${options.agentId}
          GROUP BY DATE("calledAt"), "agentId"
        )
        SELECT
          d.day,
          d."agentId",
          d.calls,
          d."newRegistrations",
          d."updatedRegistrations",
          COALESCE(c."contactedCompanies", 0::bigint) AS "contactedCompanies"
        FROM daily d
        LEFT JOIN contacted c ON c.day = d.day AND c."agentId" = d."agentId"
      `
    : await prisma.$queryRaw<
        {
          day: Date
          agentId: string
          calls: bigint
          newRegistrations: bigint
          updatedRegistrations: bigint
          contactedCompanies: bigint
        }[]
      >`
        WITH ranked AS (
          SELECT
            cl."calledAt",
            cl."companyId",
            cl."agentId",
            ROW_NUMBER() OVER (PARTITION BY cl."companyId" ORDER BY cl."calledAt", cl.id) AS company_rank
          FROM "CallLog" cl
          WHERE cl."calledAt" >= ${from}
            AND cl."calledAt" <= ${to}
        ),
        daily AS (
          SELECT
            DATE("calledAt") AS day,
            "agentId",
            COUNT(*)::bigint AS calls,
            COUNT(*) FILTER (WHERE company_rank = 1)::bigint AS "newRegistrations",
            COUNT(*) FILTER (WHERE company_rank > 1)::bigint AS "updatedRegistrations"
          FROM ranked
          GROUP BY DATE("calledAt"), "agentId"
        ),
        contacted AS (
          SELECT
            DATE("calledAt") AS day,
            "agentId",
            COUNT(DISTINCT "companyId")::bigint AS "contactedCompanies"
          FROM "CallLog"
          WHERE "calledAt" >= ${from}
            AND "calledAt" <= ${to}
          GROUP BY DATE("calledAt"), "agentId"
        )
        SELECT
          d.day,
          d."agentId",
          d.calls,
          d."newRegistrations",
          d."updatedRegistrations",
          COALESCE(c."contactedCompanies", 0::bigint) AS "contactedCompanies"
        FROM daily d
        LEFT JOIN contacted c ON c.day = d.day AND c."agentId" = d."agentId"
      `

  const days = new Set<string>()
  let rowsUpserted = 0

  for (const row of rows) {
    const date = toUtcDateOnly(row.day instanceof Date ? row.day : new Date(String(row.day)))
    days.add(date.toISOString().slice(0, 10))

    await prisma.dailyAgentMetrics.upsert({
      where: {
        date_agentId: { date, agentId: row.agentId },
      },
      create: {
        tenantId: OPTICK_TENANT_ID,
        date,
        agentId: row.agentId,
        calls: Number(row.calls),
        newRegistrations: Number(row.newRegistrations),
        updatedRegistrations: Number(row.updatedRegistrations),
        contactedCompanies: Number(row.contactedCompanies),
      },
      update: {
        calls: Number(row.calls),
        newRegistrations: Number(row.newRegistrations),
        updatedRegistrations: Number(row.updatedRegistrations),
        contactedCompanies: Number(row.contactedCompanies),
      },
    })
    rowsUpserted++
  }

  return { daysProcessed: days.size, rowsUpserted }
}
