import { useMemo, useState } from 'react'
import type { CallHeatmapCell } from '../api/client'

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const HOURS = Array.from({ length: 10 }, (_, i) => i + 9)

function intensityColor(calls: number, max: number): string {
  if (calls === 0 || max === 0) return '#f9fafb'
  const t = calls / max
  if (t < 0.15) return '#dbeafe'
  if (t < 0.3) return '#93c5fd'
  if (t < 0.5) return '#60a5fa'
  if (t < 0.7) return '#3b82f6'
  if (t < 0.85) return '#2563eb'
  return '#1d4ed8'
}

type TooltipState = {
  dow: number
  hour: number
  calls: number
  x: number
  y: number
} | null

export function CallHeatmapChart({
  cells,
  periodLabel,
  loading,
}: {
  cells: CallHeatmapCell[]
  periodLabel: string
  loading?: boolean
}) {
  const [tooltip, setTooltip] = useState<TooltipState>(null)

  const { grid, maxCalls, totalCalls } = useMemo(() => {
    const lookup = new Map<string, number>()
    let max = 0
    let total = 0
    for (const cell of cells) {
      lookup.set(`${cell.dow}:${cell.hour}`, cell.calls)
      max = Math.max(max, cell.calls)
      total += cell.calls
    }
    return { grid: lookup, maxCalls: max, totalCalls: total }
  }, [cells])

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-3 bg-gray-100 rounded w-2/3" />
        <div className="grid gap-1" style={{ gridTemplateColumns: '48px repeat(10, 1fr)' }}>
          {Array.from({ length: 77 }).map((_, i) => (
            <div key={i} className="h-7 bg-gray-100 rounded-sm" />
          ))}
        </div>
      </div>
    )
  }

  if (totalCalls === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-20">
        Sin actividad en horario laboral (9:00–18:00)
      </p>
    )
  }

  return (
    <div className="relative">
      <p className="text-xs text-gray-500 mb-3">
        {periodLabel} · horario 9:00–18:00
      </p>

      <div
        className="grid gap-1 text-[10px]"
        style={{ gridTemplateColumns: '44px repeat(10, minmax(0, 1fr))' }}
        onMouseLeave={() => setTooltip(null)}
      >
        <div />
        {HOURS.map((hour) => (
          <div
            key={hour}
            className="text-center text-gray-400 font-medium pb-0.5 truncate"
            title={`${hour}:00`}
          >
            {hour}
          </div>
        ))}

        {DAY_LABELS.map((dayLabel, dayIndex) => {
          const dow = dayIndex + 1
          return (
            <div key={dow} className="contents">
              <div className="flex items-center text-gray-500 font-medium pr-1">{dayLabel}</div>
              {HOURS.map((hour) => {
                const calls = grid.get(`${dow}:${hour}`) ?? 0
                return (
                  <div
                    key={`${dow}-${hour}`}
                    className="aspect-square min-h-[1.75rem] rounded-sm border border-gray-100 transition-transform hover:scale-105 hover:z-10 hover:shadow-sm cursor-default"
                    style={{ backgroundColor: intensityColor(calls, maxCalls) }}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect()
                      const parent = e.currentTarget.closest('.relative')?.getBoundingClientRect()
                      if (!parent) return
                      setTooltip({
                        dow,
                        hour,
                        calls,
                        x: rect.left - parent.left + rect.width / 2,
                        y: rect.top - parent.top,
                      })
                    }}
                  />
                )
              })}
            </div>
          )
        })}
      </div>

      {tooltip && (
        <div
          className="absolute z-20 pointer-events-none -translate-x-1/2 -translate-y-full mb-1 px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-xs shadow-lg whitespace-nowrap"
          style={{ left: tooltip.x, top: tooltip.y - 6 }}
        >
          <span className="font-medium">{DAY_LABELS[tooltip.dow - 1]}</span>
          {' · '}
          {tooltip.hour}:00–{tooltip.hour + 1}:00
          <br />
          <span className="text-blue-200">{tooltip.calls} llamadas</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 mt-4 text-[10px] text-gray-400">
        <span>Menos</span>
        <div className="flex gap-0.5">
          {['#f9fafb', '#dbeafe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8'].map(
            (color) => (
              <div key={color} className="w-4 h-3 rounded-sm border border-gray-100" style={{ backgroundColor: color }} />
            )
          )}
        </div>
        <span>Más</span>
      </div>
    </div>
  )
}
