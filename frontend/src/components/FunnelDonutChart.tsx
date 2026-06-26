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

type FunnelSlice = {
  key: string
  name: string
  fullLabel: string
  value: number
  pct: number
  color: string
}

export function FunnelDonutChart({
  pipeline,
  loading,
  onStageClick,
}: {
  pipeline: Record<string, number>
  loading?: boolean
  onStageClick: (stageKey: string) => void
}) {
  const { slices, total } = useMemo(() => {
    const funnelTotal = AGENT_PIPELINE_FUNNEL.reduce(
      (sum, row) => sum + (pipeline[row.key] ?? 0),
      0
    )
    const built: FunnelSlice[] = AGENT_PIPELINE_FUNNEL.map((row) => {
      const value = pipeline[row.key] ?? 0
      return {
        key: row.key,
        name: row.shortLabel ?? row.label,
        fullLabel: row.fullLabel,
        value,
        pct: funnelTotal > 0 ? Math.round((value / funnelTotal) * 100) : 0,
        color: FUNNEL_CHART_COLORS[row.key] ?? '#6b7280',
      }
    }).filter((s) => s.value > 0)

    return { slices: built, total: funnelTotal }
  }, [pipeline])

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
        Sin llamadas de embudo en el periodo
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
                <Cell key={slice.key} fill={slice.color} />
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
                return [`${value} (${slice?.pct ?? 0}%)`, slice?.fullLabel ?? '']
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900 leading-none">{total}</p>
            <p className="text-[11px] text-gray-500 mt-1">llamadas</p>
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1.5 max-h-32 overflow-y-auto pr-1">
        {AGENT_PIPELINE_FUNNEL.map((row) => {
          const count = pipeline[row.key] ?? 0
          if (count === 0) return null
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <button
              key={row.key}
              type="button"
              onClick={() => onStageClick(row.key)}
              className="w-full flex items-center justify-between text-xs rounded-md px-2 py-1 hover:bg-gray-50 transition-colors text-left"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: FUNNEL_CHART_COLORS[row.key] }}
                />
                <span className="text-gray-700 truncate">{row.shortLabel ?? row.label}</span>
              </span>
              <span className="text-gray-900 font-semibold shrink-0 ml-2">
                {count}
                <span className="text-gray-400 font-normal ml-1">({pct}%)</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
