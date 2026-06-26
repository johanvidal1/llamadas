/**
 * Backfill DailyAgentMetrics from CallLog.
 * Usage: npx ts-node scripts/backfill-daily-metrics.ts [--days=30] [--agentId=...]
 */
import { backfillDailyAgentMetrics } from '../src/lib/dailyAgentMetrics'

async function main() {
  const args = process.argv.slice(2)
  let days = 30
  let agentId: string | undefined

  for (const arg of args) {
    if (arg.startsWith('--days=')) days = Number(arg.slice(7)) || 30
    if (arg.startsWith('--agentId=')) agentId = arg.slice(10) || undefined
  }

  const from = new Date()
  from.setDate(from.getDate() - days)
  from.setHours(0, 0, 0, 0)

  console.log(`Backfilling daily metrics from ${from.toISOString().slice(0, 10)}...`)
  const result = await backfillDailyAgentMetrics({ from, agentId })
  console.log(`Done: ${result.rowsUpserted} rows across ${result.daysProcessed} days`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
