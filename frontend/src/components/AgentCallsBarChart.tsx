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
  Legend,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import type { AgentCallChartRow } from '../api/client'

const CALLS_DEFAULT = '#93c5fd'
const CALLS_HIGHLIGHT = '#2563eb'
const CALLS_MUTED = '#dbeafe'

const REGISTERED_DEFAULT = '#10b981'
const REGISTERED_HIGHLIGHT = '#059669'
const REGISTERED_MUTED = '#a7f3d0'

function truncateName(name: string, max = 12) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name
}

type ChartRow = AgentCallChartRow & { shortName: string }

function AgentCallsTooltip({
  active,
  payload,
}: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload as ChartRow | undefined
  if (!row) return null

  const followUps = row.calls - row.registered

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-gray-900 mb-1.5">{row.name}</p>
      <div className="space-y-1 text-gray-600">
        <p>
          <span className="inline-block w-2 h-2 rounded-sm bg-blue-300 mr-1.5 align-middle" />
          Llamadas: <strong className="text-gray-800">{row.calls}</strong>
        </p>
        <p>
          <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 mr-1.5 align-middle" />
          Registrados (empresas): <strong className="text-gray-800">{row.registered}</strong>
        </p>
        {followUps > 0 && (
          <p className="text-gray-500 pt-0.5 border-t border-gray-100">
            Seguimientos: <strong className="text-gray-700">{followUps}</strong>
          </p>
        )}
      </div>
    </div>
  )
}

export function AgentCallsBarChart({
  data,
  loading,
  highlightedAgentId,
  periodLabel,
  onAgentClick,
}: {
  data: AgentCallChartRow[]
  loading?: boolean
  highlightedAgentId?: string
  periodLabel?: string
  onAgentClick?: (agentId: string) => void
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

  const chartData: ChartRow[] = data.map((row) => ({
    ...row,
    shortName: truncateName(row.name),
  }))

  const totalCalls = data.reduce((s, d) => s + d.calls, 0)
  const totalRegistered = data.reduce((s, d) => s + d.registered, 0)
  const teamAverage =
    data.length > 0 ? Math.round((totalCalls / data.length) * 10) / 10 : 0
  const hasCalls = totalCalls > 0
  const clickable = !!onAgentClick

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <p className="text-xs text-gray-500">
          {periodLabel ?? 'Período actual'}
          {highlightedAgentId && (
            <span className="text-blue-600 font-medium ml-1.5">· agente resaltado</span>
          )}
          {clickable && hasCalls && (
            <span className="text-gray-400 ml-1.5">· clic en barra para ver clientes</span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span>
            <span className="inline-block w-3 h-0.5 bg-amber-500 align-middle mr-1.5" />
            Promedio equipo: <strong className="text-gray-700">{teamAverage}</strong>
          </span>
          <span>
            Total llamadas: <strong className="text-gray-700">{totalCalls}</strong>
          </span>
          <span>
            Total registrados: <strong className="text-gray-700">{totalRegistered}</strong>
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
              <Tooltip cursor={{ fill: 'rgba(59, 130, 246, 0.06)' }} content={<AgentCallsTooltip />} />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="square"
                iconSize={10}
                wrapperStyle={{ fontSize: 11, paddingBottom: 4 }}
                formatter={(value) =>
                  value === 'calls' ? 'Llamadas' : 'Registrados (empresas)'
                }
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
              <Bar
                dataKey="calls"
                name="calls"
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
                legendType="square"
                style={clickable ? { cursor: 'pointer' } : undefined}
                onClick={(barData) => {
                  const row = barData as ChartRow | undefined
                  if (row?.agentId && onAgentClick) onAgentClick(row.agentId)
                }}
              >
                {chartData.map((entry) => {
                  const isHighlight = highlightedAgentId === entry.agentId
                  const isDimmed =
                    highlightedAgentId && highlightedAgentId !== entry.agentId
                  return (
                    <Cell
                      key={`calls-${entry.agentId}`}
                      fill={
                        isHighlight
                          ? CALLS_HIGHLIGHT
                          : isDimmed
                            ? CALLS_MUTED
                            : CALLS_DEFAULT
                      }
                      stroke={isHighlight ? '#1d4ed8' : undefined}
                      strokeWidth={isHighlight ? 1 : 0}
                    />
                  )
                })}
              </Bar>
              <Bar
                dataKey="registered"
                name="registered"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
                legendType="square"
                style={clickable ? { cursor: 'pointer' } : undefined}
                onClick={(barData) => {
                  const row = barData as ChartRow | undefined
                  if (row?.agentId && onAgentClick) onAgentClick(row.agentId)
                }}
              >
                {chartData.map((entry) => {
                  const isHighlight = highlightedAgentId === entry.agentId
                  const isDimmed =
                    highlightedAgentId && highlightedAgentId !== entry.agentId
                  return (
                    <Cell
                      key={`registered-${entry.agentId}`}
                      fill={
                        isHighlight
                          ? REGISTERED_HIGHLIGHT
                          : isDimmed
                            ? REGISTERED_MUTED
                            : REGISTERED_DEFAULT
                      }
                      stroke={isHighlight ? '#047857' : undefined}
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
