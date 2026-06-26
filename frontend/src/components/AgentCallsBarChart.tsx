import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts'
import type { AgentCallChartRow } from '../api/client'

const BAR_DEFAULT = '#93c5fd'
const BAR_HIGHLIGHT = '#2563eb'
const BAR_MUTED = '#dbeafe'

function truncateName(name: string, max = 12) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name
}

export function AgentCallsBarChart({
  data,
  loading,
  highlightedAgentId,
  periodLabel,
}: {
  data: AgentCallChartRow[]
  loading?: boolean
  highlightedAgentId?: string
  periodLabel?: string
}) {
  if (loading) {
    return (
      <div className="h-72 flex items-center justify-center animate-pulse">
        <div className="w-full space-y-3 px-4">
          <div className="h-3 bg-gray-100 rounded w-1/3" />
          <div className="h-48 bg-gray-100 rounded-lg" />
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-20">
        Sin agentes activos para mostrar
      </p>
    )
  }

  const chartData = data.map((row) => ({
    ...row,
    shortName: truncateName(row.name),
  }))

  const totalCalls = data.reduce((s, d) => s + d.calls, 0)
  const teamAverage =
    data.length > 0 ? Math.round((totalCalls / data.length) * 10) / 10 : 0
  const hasCalls = totalCalls > 0

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <p className="text-xs text-gray-500">
          {periodLabel ?? 'Período actual'}
          {highlightedAgentId && (
            <span className="text-blue-600 font-medium ml-1.5">· agente resaltado</span>
          )}
        </p>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>
            <span className="inline-block w-3 h-0.5 bg-amber-500 align-middle mr-1.5" />
            Promedio equipo: <strong className="text-gray-700">{teamAverage}</strong>
          </span>
          <span>
            Total: <strong className="text-gray-700">{totalCalls}</strong>
          </span>
        </div>
      </div>

      {!hasCalls ? (
        <p className="text-sm text-gray-400 text-center py-16">
          Sin llamadas en el período seleccionado
        </p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: -12, bottom: 48 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="shortName"
                tick={{ fontSize: 11, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={chartData.length > 6 ? -35 : 0}
                textAnchor={chartData.length > 6 ? 'end' : 'middle'}
                height={chartData.length > 6 ? 56 : 32}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
                axisLine={false}
                tickLine={false}
                width={36}
              />
              <Tooltip
                cursor={{ fill: 'rgba(59, 130, 246, 0.06)' }}
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  fontSize: 12,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                }}
                formatter={(value: number) => [value, 'Llamadas']}
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as AgentCallChartRow | undefined
                  return row?.name ?? ''
                }}
              />
              <ReferenceLine
                y={teamAverage}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `Prom. ${teamAverage}`,
                  position: 'insideTopRight',
                  fill: '#d97706',
                  fontSize: 10,
                }}
              />
              <Bar dataKey="calls" radius={[4, 4, 0, 0]} maxBarSize={48}>
                {chartData.map((entry) => {
                  const isHighlight = highlightedAgentId === entry.agentId
                  const isDimmed =
                    highlightedAgentId && highlightedAgentId !== entry.agentId
                  return (
                    <Cell
                      key={entry.agentId}
                      fill={
                        isHighlight
                          ? BAR_HIGHLIGHT
                          : isDimmed
                            ? BAR_MUTED
                            : BAR_DEFAULT
                      }
                      stroke={isHighlight ? '#1d4ed8' : undefined}
                      strokeWidth={isHighlight ? 1 : 0}
                    />
                  )
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
