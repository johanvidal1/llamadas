import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { CallActivityGranularity } from '../api/client'

function formatPeriodLabel(period: string, granularity: CallActivityGranularity): string {
  if (granularity === 'month') {
    const [y, m] = period.split('-')
    return format(new Date(Number(y), Number(m) - 1, 1), 'MMM yyyy', { locale: es })
  }
  const date = new Date(period + 'T12:00:00')
  if (granularity === 'week') {
    return format(date, "d MMM ''yy", { locale: es })
  }
  return format(date, 'd MMM', { locale: es })
}

export function CallActivityChart({
  series,
  granularity,
  maxBars = 14,
}: {
  series: { period: string; count: number }[]
  granularity: CallActivityGranularity
  maxBars?: number
}) {
  const visible = series.length > maxBars ? series.slice(-maxBars) : series
  const maxCount = Math.max(...visible.map((d) => d.count), 1)
  const total = series.reduce((s, d) => s + d.count, 0)

  if (series.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">Sin llamadas en el período seleccionado</p>
    )
  }

  return (
    <div>
      <div className="flex items-end gap-0.5 h-32">
        {visible.map((d) => (
          <div
            key={d.period}
            className="flex-1 flex flex-col items-center gap-0.5 group min-w-0"
            title={`${formatPeriodLabel(d.period, granularity)}: ${d.count} llamadas`}
          >
            <span className="text-[9px] text-gray-400 opacity-0 group-hover:opacity-100 whitespace-nowrap">
              {d.count}
            </span>
            <div
              className="w-full bg-blue-500 rounded-t hover:bg-blue-400 transition-colors"
              style={{ height: `${d.count > 0 ? Math.max((d.count / maxCount) * 96, 4) : 2}px` }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-0.5">
        <span>
          {visible[0]?.period
            ? formatPeriodLabel(visible[0].period, granularity)
            : ''}
        </span>
        <span>
          {visible[visible.length - 1]?.period
            ? formatPeriodLabel(visible[visible.length - 1].period, granularity)
            : ''}
        </span>
      </div>
      <p className="text-xs text-gray-500 mt-2 text-right">
        Total: <span className="font-semibold text-gray-700">{total}</span> llamadas
      </p>
    </div>
  )
}

export function formatGapMinutes(minutes: number | null): string {
  if (minutes == null) return '—'
  if (minutes < 1) return '< 1 min'
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = minutes / 60
  if (hours < 24) return `${Math.round(hours * 10) / 10} h`
  const days = hours / 24
  return `${Math.round(days * 10) / 10} d`
}

export const SMALL_SAMPLE_THRESHOLD = 10
