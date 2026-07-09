import { useMemo } from 'react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Sector } from 'recharts'
import { AGENT_PIPELINE_FUNNEL } from '../config/companyPipeline'

const FUNNEL_CHART_COLORS: Record<string, string> = {
  INTERESADO: '#22c55e',
  PROPUESTA_PRESENTADA: '#16a34a',
  DISCUSION_PROPUESTA: '#10b981',
  ESPERA_RESPUESTA: '#14b8a6',
  VENTA_CERRADA: '#047857',
}

export type DonutSeriesRow = {
  key: string
  name: string
  fullLabel: string
  color: string
  highlight?: boolean
}

type FunnelSlice = {
  key: string
  name: string
  fullLabel: string
  value: number
  pct: number
  color: string
  highlight?: boolean
}

export function FunnelDonutChart({
  pipeline,
  series,
  loading,
  onStageClick,
  emptyMessage = 'Sin empresas en el periodo',
  centerLabel = 'empresas',
  legendScrollThreshold = 6,
}: {
  pipeline: Record<string, number>
  series?: DonutSeriesRow[]
  loading?: boolean
  onStageClick: (stageKey: string) => void
  emptyMessage?: string
  centerLabel?: string
  legendScrollThreshold?: number
}) {
  const legendRows: DonutSeriesRow[] = series ?? AGENT_PIPELINE_FUNNEL.map((row) => ({
    key: row.key,
    name: row.shortLabel ?? row.label,
    fullLabel: row.fullLabel,
    color: FUNNEL_CHART_COLORS[row.key] ?? '#6b7280',
  }))

  const { slices, total } = useMemo(() => {
    const chartTotal = legendRows.reduce(
      (sum, row) => sum + (pipeline[row.key] ?? 0),
      0
    )
    const built: FunnelSlice[] = legendRows
      .map((row) => {
        const value = pipeline[row.key] ?? 0
        return {
          key: row.key,
          name: row.name,
          fullLabel: row.fullLabel,
          value,
          pct: chartTotal > 0 ? Math.round((value / chartTotal) * 100) : 0,
          color: row.color,
          highlight: row.highlight,
        }
      })
      .filter((s) => s.value > 0)

    return { slices: built, total: chartTotal }
  }, [pipeline, legendRows])

  const legendScrollable = slices.length > legendScrollThreshold

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center animate-pulse">
        <div className="w-40 h-40 rounded-full bg-gray-100" />
      </div>
    )
  }

  if (total === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-20">
        {emptyMessage}
      </p>
    )
  }

  return (
    <div>
      <div className="h-56 w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="82%"
              paddingAngle={2}
              stroke="#fff"
              strokeWidth={2}
              activeShape={(props: unknown) => {
                const p = props as {
                  outerRadius?: number
                  innerRadius?: number
                  cx?: number
                  cy?: number
                  startAngle?: number
                  endAngle?: number
                  fill?: string
                }
                return (
                  <Sector
                    {...p}
                    outerRadius={(p.outerRadius ?? 0) + 6}
                    fill={p.fill}
                    style={{ cursor: 'pointer' }}
                  />
                )
              }}
              onClick={(_, index) => {
                const slice = slices[index]
                if (slice) onStageClick(slice.key)
              }}
              style={{ cursor: 'pointer' }}
              label={false}
            >
              {slices.map((slice) => (
                <Cell
                  key={slice.key}
                  fill={slice.color}
                  stroke={slice.highlight ? slice.color : '#fff'}
                  strokeWidth={slice.highlight ? 3 : 2}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: '1px solid #e5e7eb',
                fontSize: 12,
              }}
              formatter={(value: number, _name: string, item: { payload?: FunnelSlice }) => {
                const slice = item.payload
                if (!slice) return [value, '']
                return [`${value} (${slice.pct}%)`, slice.fullLabel]
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900 leading-none">{total}</p>
            <p className="text-[11px] text-gray-500 mt-1">{centerLabel}</p>
          </div>
        </div>
      </div>

      <div
        className={`mt-3${legendScrollable ? ' max-h-32 overflow-y-auto pr-1' : ''}`}
      >
        <div className="space-y-1.5">
          {legendRows.map((row) => {
            const count = pipeline[row.key] ?? 0
            if (count === 0) return null
            const pct = total > 0 ? Math.round((count / total) * 100) : 0
            const highlighted = row.highlight ?? row.key === 'VOLVER_A_LLAMAR'
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => onStageClick(row.key)}
                className={`w-full flex items-center justify-between rounded-md px-2 py-1 hover:bg-gray-50 transition-colors text-left text-xs${
                  highlighted ? ' bg-blue-50/60 ring-1 ring-blue-100' : ''
                }`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0${highlighted ? ' ring-2 ring-blue-300 ring-offset-1' : ''}`}
                    style={{ backgroundColor: row.color }}
                  />
                  <span className={`truncate ${highlighted ? 'font-bold text-blue-800' : 'text-gray-700'}`}>
                    {row.name}
                  </span>
                </span>
                <span className={`shrink-0 ${highlighted ? 'font-bold text-blue-900' : 'text-gray-900 font-semibold'}`}>
                  {count}
                  <span className={`font-normal ml-1 ${highlighted ? 'text-blue-500' : 'text-gray-400'}`}>
                    ({pct}%)
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
