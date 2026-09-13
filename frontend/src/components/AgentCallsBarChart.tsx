import { useEffect, useState } from 'react'
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
  LabelList,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import type { AgentCallChartRow } from '../api/client'

const CALLS_DEFAULT = '#93c5fd'
const CALLS_HIGHLIGHT = '#2563eb'
const CALLS_MUTED = '#dbeafe'

const REGISTERED_DEFAULT = '#10b981'
const REGISTERED_HIGHLIGHT = '#059669'
const REGISTERED_MUTED = '#a7f3d0'

const MD_QUERY = '(min-width: 768px)'

function truncateName(name: string, max = 12) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name
}

/** Nice ceiling so Recharts ticks stay even and labels fit past the longest bar. */
function niceCeil(value: number): number {
  if (value <= 0) return 10
  const mag = 10 ** Math.floor(Math.log10(value))
  const n = value / mag
  const nice =
    n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 3 ? 3 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 6 ? 6 : n <= 8 ? 8 : 10
  return nice * mag
}

function mobileXMax(rows: { calls: number; registered: number }[], teamAverage: number): number {
  const raw = Math.max(
    ...rows.map((row) => Math.max(row.calls, row.registered)),
    teamAverage,
    1
  )
  return niceCeil(raw * 1.12)
}

type MobileBarLabelProps = {
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
  value?: number | string
}

function MobileBarEndLabel({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  value,
  kind,
}: MobileBarLabelProps & { kind: 'calls' | 'registered' }) {
  if (value == null || value === '') return null
  const left = Number(x) || 0
  const top = Number(y) || 0
  const w = Number(width) || 0
  const h = Number(height) || 0
  const barWideEnough = w >= 28
  const labelX = barWideEnough ? left + w - 5 : left + w + 4
  return (
    <text
      x={labelX}
      y={top + h / 2}
      dy={3}
      textAnchor={barWideEnough ? 'end' : 'start'}
      fill={
        barWideEnough
          ? kind === 'calls'
            ? '#1e3a8a'
            : '#ffffff'
          : kind === 'calls'
            ? '#2563eb'
            : '#059669'
      }
      fontSize={10}
      fontWeight={600}
    >
      {value}
    </text>
  )
}

function ChartSeriesLegend() {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-[11px] text-gray-600">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-2.5 h-2.5 rounded-[2px] bg-blue-300" aria-hidden />
        Llamadas
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-2.5 h-2.5 rounded-[2px] bg-emerald-500" aria-hidden />
        Registrados (empresas)
      </span>
    </div>
  )
}

function useIsMd() {
  const [isMd, setIsMd] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MD_QUERY).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(MD_QUERY)
    const handler = (e: MediaQueryListEvent) => setIsMd(e.matches)
    setIsMd(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isMd
}

type ChartRow = AgentCallChartRow & { shortName: string }

function AgentCallsTooltip({
  active,
  payload,
  onViewClients,
}: TooltipProps<number, string> & { onViewClients?: (agentId: string) => void }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload as ChartRow | undefined
  if (!row) return null

  const followUps = row.calls - row.registered

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs shadow-md pointer-events-auto min-w-[10rem]">
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
      {onViewClients && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onViewClients(row.agentId)
          }}
          className="mt-2 text-blue-600 hover:underline font-medium"
        >
          Ver clientes →
        </button>
      )}
    </div>
  )
}

function AgentAxisTick({
  x,
  y,
  payload,
  textAnchor,
  angle = 0,
  chartData,
  highlightedAgentId,
  onAgentSelect,
}: {
  x: number
  y: number
  payload?: { value: string }
  textAnchor?: 'end' | 'start' | 'middle' | 'inherit'
  angle?: number
  chartData: ChartRow[]
  highlightedAgentId?: string
  onAgentSelect?: (agentId: string) => void
}) {
  const row = chartData.find((r) => r.shortName === payload?.value)
  if (!row) return null

  const isHighlight = highlightedAgentId === row.agentId
  const selectable = !!onAgentSelect

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={angle ? 4 : 16}
        textAnchor={textAnchor ?? 'middle'}
        fill={isHighlight ? '#2563eb' : '#6b7280'}
        fontSize={11}
        fontWeight={isHighlight ? 600 : 400}
        transform={angle ? `rotate(${angle})` : undefined}
        style={selectable ? { cursor: 'pointer' } : undefined}
        onClick={() => onAgentSelect?.(row.agentId)}
      >
        {payload?.value}
      </text>
    </g>
  )
}

function AgentYAxisTick({
  x,
  y,
  payload,
  chartData,
  highlightedAgentId,
  onAgentSelect,
}: {
  x: number
  y: number
  payload?: { value: string }
  chartData: ChartRow[]
  highlightedAgentId?: string
  onAgentSelect?: (agentId: string) => void
}) {
  const row = chartData.find((r) => r.shortName === payload?.value)
  if (!row) return null

  const isHighlight = highlightedAgentId === row.agentId
  const selectable = !!onAgentSelect

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={4}
        textAnchor="end"
        fill={isHighlight ? '#2563eb' : '#6b7280'}
        fontSize={11}
        fontWeight={isHighlight ? 600 : 400}
        style={selectable ? { cursor: 'pointer' } : undefined}
        onClick={() => onAgentSelect?.(row.agentId)}
      >
        {payload?.value}
      </text>
    </g>
  )
}

function barFill(
  entry: ChartRow,
  highlightedAgentId: string | undefined,
  kind: 'calls' | 'registered'
) {
  const isHighlight = highlightedAgentId === entry.agentId
  const isDimmed = highlightedAgentId && highlightedAgentId !== entry.agentId
  if (kind === 'calls') {
    return isHighlight ? CALLS_HIGHLIGHT : isDimmed ? CALLS_MUTED : CALLS_DEFAULT
  }
  return isHighlight
    ? REGISTERED_HIGHLIGHT
    : isDimmed
      ? REGISTERED_MUTED
      : REGISTERED_DEFAULT
}

export function AgentCallsBarChart({
  data,
  loading,
  highlightedAgentId,
  periodLabel,
  onAgentSelect,
  onViewClients,
}: {
  data: AgentCallChartRow[]
  loading?: boolean
  highlightedAgentId?: string
  periodLabel?: string
  onAgentSelect?: (agentId: string) => void
  onViewClients?: (agentId: string) => void
}) {
  const isMd = useIsMd()

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

  const nameMax = isMd ? 12 : typeof window !== 'undefined' && window.innerWidth < 380 ? 8 : 10
  const chartData: ChartRow[] = data.map((row) => ({
    ...row,
    shortName: truncateName(row.name, nameMax),
  }))

  const totalCalls = data.reduce((s, d) => s + d.calls, 0)
  const totalRegistered = data.reduce((s, d) => s + d.registered, 0)
  const teamAverage =
    data.length > 0 ? Math.round((totalCalls / data.length) * 10) / 10 : 0
  const hasCalls = totalCalls > 0
  const selectable = !!onAgentSelect
  const rotateTicks = chartData.length > 6
  const tickAngle = rotateTicks ? -35 : 0

  // Horizontal chart: grow with agent count so bars, top axis, and end labels aren't crushed
  const mobileHeight = Math.max(320, chartData.length * 48 + 108)
  const mobileXDomainMax = mobileXMax(chartData, teamAverage)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <p className="text-xs text-gray-500">
          {periodLabel ?? 'Período actual'}
          {highlightedAgentId && (
            <span className="text-blue-600 font-medium ml-1.5">· agente resaltado</span>
          )}
          {selectable && hasCalls && (
            <span className="text-gray-400 ml-1.5">
              · clic en barra o nombre para filtrar por agente
              {highlightedAgentId && onViewClients && (
                <span> · enlace a Clientes debajo del gráfico</span>
              )}
            </span>
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
      ) : isMd ? (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{
                top: 8,
                right: 8,
                left: -12,
                bottom: rotateTicks ? 64 : 48,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="shortName"
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={tickAngle}
                textAnchor={rotateTicks ? 'end' : 'middle'}
                height={rotateTicks ? 64 : 32}
                tick={(props) => (
                  <AgentAxisTick
                    {...props}
                    angle={tickAngle}
                    chartData={chartData}
                    highlightedAgentId={highlightedAgentId}
                    onAgentSelect={onAgentSelect}
                  />
                )}
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
                wrapperStyle={{ pointerEvents: 'auto', zIndex: 20 }}
                offset={12}
                content={<AgentCallsTooltip onViewClients={onViewClients} />}
              />
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
                style={selectable ? { cursor: 'pointer' } : undefined}
                onClick={(barData) => {
                  const row = barData as ChartRow | undefined
                  if (row?.agentId && onAgentSelect) onAgentSelect(row.agentId)
                }}
              >
                {chartData.map((entry) => (
                  <Cell
                    key={`calls-${entry.agentId}`}
                    fill={barFill(entry, highlightedAgentId, 'calls')}
                    stroke={
                      highlightedAgentId === entry.agentId ? '#1d4ed8' : undefined
                    }
                    strokeWidth={highlightedAgentId === entry.agentId ? 1 : 0}
                  />
                ))}
              </Bar>
              <Bar
                dataKey="registered"
                name="registered"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
                legendType="square"
                style={selectable ? { cursor: 'pointer' } : undefined}
                onClick={(barData) => {
                  const row = barData as ChartRow | undefined
                  if (row?.agentId && onAgentSelect) onAgentSelect(row.agentId)
                }}
              >
                {chartData.map((entry) => (
                  <Cell
                    key={`registered-${entry.agentId}`}
                    fill={barFill(entry, highlightedAgentId, 'registered')}
                    stroke={
                      highlightedAgentId === entry.agentId ? '#047857' : undefined
                    }
                    strokeWidth={highlightedAgentId === entry.agentId ? 1 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div>
          <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm pb-1.5 mb-1">
            <ChartSeriesLegend />
          </div>
          <div className="w-full" style={{ height: mobileHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={chartData}
                margin={{ top: 22, right: 36, left: 4, bottom: 8 }}
                barCategoryGap="16%"
                barGap={3}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis
                  xAxisId="bottom"
                  type="number"
                  domain={[0, mobileXDomainMax]}
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <XAxis
                  xAxisId="top"
                  type="number"
                  orientation="top"
                  domain={[0, mobileXDomainMax]}
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="shortName"
                  axisLine={false}
                  tickLine={false}
                  width={88}
                  interval={0}
                  tick={(props) => (
                    <AgentYAxisTick
                      {...props}
                      chartData={chartData}
                      highlightedAgentId={highlightedAgentId}
                      onAgentSelect={onAgentSelect}
                    />
                  )}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(59, 130, 246, 0.06)' }}
                  wrapperStyle={{ pointerEvents: 'auto', zIndex: 20 }}
                  offset={12}
                  content={<AgentCallsTooltip onViewClients={onViewClients} />}
                />
                <ReferenceLine
                  xAxisId="bottom"
                  x={teamAverage}
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
                  xAxisId="bottom"
                  dataKey="calls"
                  name="calls"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={18}
                  isAnimationActive={false}
                  style={selectable ? { cursor: 'pointer' } : undefined}
                  onClick={(barData) => {
                    const row = barData as ChartRow | undefined
                    if (row?.agentId && onAgentSelect) onAgentSelect(row.agentId)
                  }}
                >
                  {chartData.map((entry) => (
                    <Cell
                      key={`m-calls-${entry.agentId}`}
                      fill={barFill(entry, highlightedAgentId, 'calls')}
                      stroke={
                        highlightedAgentId === entry.agentId ? '#1d4ed8' : undefined
                      }
                      strokeWidth={highlightedAgentId === entry.agentId ? 1 : 0}
                    />
                  ))}
                  <LabelList
                    dataKey="calls"
                    content={(props) => <MobileBarEndLabel {...props} kind="calls" />}
                  />
                </Bar>
                <Bar
                  xAxisId="bottom"
                  dataKey="registered"
                  name="registered"
                  radius={[0, 3, 3, 0]}
                  maxBarSize={14}
                  isAnimationActive={false}
                  style={selectable ? { cursor: 'pointer' } : undefined}
                  onClick={(barData) => {
                    const row = barData as ChartRow | undefined
                    if (row?.agentId && onAgentSelect) onAgentSelect(row.agentId)
                  }}
                >
                  {chartData.map((entry) => (
                    <Cell
                      key={`m-registered-${entry.agentId}`}
                      fill={barFill(entry, highlightedAgentId, 'registered')}
                      stroke={
                        highlightedAgentId === entry.agentId ? '#047857' : undefined
                      }
                      strokeWidth={highlightedAgentId === entry.agentId ? 1 : 0}
                    />
                  ))}
                  <LabelList
                    dataKey="registered"
                    content={(props) => <MobileBarEndLabel {...props} kind="registered" />}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
