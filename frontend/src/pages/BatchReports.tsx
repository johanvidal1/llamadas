import { useState, Fragment } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ArrowLeft, Filter, Package, RefreshCw, TrendingUp, AlertCircle,
  ChevronRight, ChevronDown,
} from 'lucide-react'
import {
  getReports,
  getCallActivity,
  getBatchReportBreakdown,
  type CallActivityGranularity,
  type BatchProgressRow as ApiBatchProgressRow,
  type BatchAgentBreakdownRow,
  type BatchAssignmentRunMetrics,
} from '../api/client'
import { CallActivityChart, formatGapMinutes, SMALL_SAMPLE_THRESHOLD } from '../components/CallActivityChart'
import { buildReportsUrl } from '../config/reportsNavigation'

type AgentOption = { id: string; name: string }
type BatchProgressRow = ApiBatchProgressRow

function Bar({ pct, color = 'bg-blue-500' }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function formatAssignedAt(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  // dd/MM/yyyy HH:mm is easier to scan than long locale text.
  return format(d, 'dd/MM/yyyy HH:mm', { locale: es })
}

function buildLotesUrl(agentId?: string) {
  return agentId ? `/reports/lotes?agentId=${agentId}` : '/reports/lotes'
}

function buildBatchDetailUrl(batchId: string, agentId?: string) {
  return agentId
    ? `/reports/lotes/${batchId}?agentId=${agentId}`
    : `/reports/lotes/${batchId}`
}

function BatchLotesAgentBreakdown({
  batch,
  expandedAgents,
  setExpandedAgents,
}: {
  batch: BatchProgressRow
  expandedAgents: Record<string, Record<string, boolean>>
  setExpandedAgents: React.Dispatch<React.SetStateAction<Record<string, Record<string, boolean>>>>
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports-batch-breakdown', batch.id, null],
    queryFn: () => getBatchReportBreakdown(batch.id),
    staleTime: 300_000,
  })

  if (isLoading) {
    return (
      <tr className="bg-gray-50/40">
        <td colSpan={9} className="px-4 py-3 pl-10">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Cargando desglose...
          </div>
        </td>
      </tr>
    )
  }

  if (isError || !data?.agentBreakdown) {
    return (
      <tr className="bg-gray-50/40">
        <td colSpan={9} className="px-4 py-3 pl-10 text-xs text-red-500">
          No se pudo cargar el desglose
        </td>
      </tr>
    )
  }

  return (
    <>
      {data.agentBreakdown.flatMap((a: BatchAgentBreakdownRow) => {
        const agentExpanded = !!expandedAgents[batch.id]?.[a.agentId]
        const toggleAgent = () => {
          setExpandedAgents((prev) => ({
            ...prev,
            [batch.id]: { ...(prev[batch.id] ?? {}), [a.agentId]: !(prev[batch.id]?.[a.agentId] ?? false) },
          }))
        }
        const agentKey = `${batch.id}:${a.agentId}`

        const row = (
          <tr
            key={agentKey}
            className="bg-gray-50/40 hover:bg-gray-50 transition-colors cursor-pointer"
            onClick={toggleAgent}
          >
            <td className="px-2 py-2">
              <button
                type="button"
                className="text-gray-500 hover:text-gray-800 p-1 rounded-md hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleAgent()
                }}
                aria-label={agentExpanded ? 'Contraer agente' : 'Expandir agente'}
              >
                {agentExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            </td>
            <td className="px-4 py-2 text-xs text-gray-700">
              <span className="inline-flex items-center gap-2">
                <span className="ml-4 font-medium text-gray-900">{a.agentName}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-500">Asignadas: {a.assignedCompanies}</span>
              </span>
            </td>
            <td className="px-4 py-2 text-xs text-gray-500">—</td>
            <td className="px-3 py-2 text-right text-xs">
              <span className="font-bold text-gray-900">{a.assignedCompanies}</span>
              <span className="text-gray-400 font-normal"> de </span>
              <span className="text-gray-500">{batch.batchTotalCompanies}</span>
            </td>
            <td className="px-3 py-2 text-right text-gray-700 font-medium text-xs">{a.callCount}</td>
            <td className="px-3 py-2 text-right text-xs">
              <span className="text-blue-700 font-medium">{a.contactedCompanies}</span>
              <span className="text-gray-400 text-[11px] ml-1">({a.contactedPct}%)</span>
            </td>
            <td className="px-3 py-2 text-right text-green-700 font-medium text-xs">{a.inFunnel}</td>
            <td className="px-3 py-2 text-right text-emerald-700 font-medium text-xs">{a.ventaCerrada}</td>
            <td className="px-4 py-2">
              <Bar
                pct={a.contactedPct}
                color={a.contactedPct >= 70 ? 'bg-green-500' : a.contactedPct >= 40 ? 'bg-amber-400' : 'bg-blue-400'}
              />
            </td>
          </tr>
        )

        if (!agentExpanded) return [row]

        const runRows = (a.assignmentRuns ?? []).map((r: BatchAssignmentRunMetrics) => {
          const runKey = `${agentKey}:run:${r.id}`
          const assignedLabel = r.isLegacy
            ? 'Asignación anterior (legacy)'
            : `${formatAssignedAt(r.assignedAt)} · ${r.assignedBy?.name ?? '—'}`
          return (
            <tr key={runKey} className="hover:bg-white">
              <td className="px-2 py-2">
                <div className="w-8" />
              </td>
              <td className="px-4 py-2 text-[11px] text-gray-600">
                <div className="ml-10">
                  <div className="font-medium text-gray-800">{assignedLabel}</div>
                  <div className="text-gray-400">
                    {r.isLegacy ? 'Sin runId histórico' : `Run · ${r.companyCount} empresas`}
                  </div>
                </div>
              </td>
              <td className="px-4 py-2 text-[11px] text-gray-500">—</td>
              <td className="px-3 py-2 text-right text-[11px] text-gray-700">
                <span className="font-bold text-gray-900">{r.companyCount}</span>
                <span className="text-gray-400 font-normal"> de </span>
                <span className="text-gray-500">{a.assignedCompanies}</span>
              </td>
              <td className="px-3 py-2 text-right text-gray-700 font-medium text-[11px]">{r.callCount}</td>
              <td className="px-3 py-2 text-right text-[11px]">
                <span className="text-blue-700 font-medium">{r.contactedCompanies}</span>
                <span className="text-gray-400 text-[10px] ml-1">({r.contactedPct}%)</span>
              </td>
              <td className="px-3 py-2 text-right text-green-700 font-medium text-[11px]">{r.inFunnel}</td>
              <td className="px-3 py-2 text-right text-emerald-700 font-medium text-[11px]">{r.ventaCerrada}</td>
              <td className="px-4 py-2">
                <Bar
                  pct={r.contactedPct}
                  color={r.contactedPct >= 70 ? 'bg-green-500' : r.contactedPct >= 40 ? 'bg-amber-400' : 'bg-blue-400'}
                />
              </td>
            </tr>
          )
        })

        return [row, ...runRows]
      })}
    </>
  )
}

export default function BatchReports() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const filterAgentId = searchParams.get('agentId') ?? ''
  const [granularity, setGranularity] = useState<CallActivityGranularity>('day')
  const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean>>({})
  const [expandedAgents, setExpandedAgents] = useState<Record<string, Record<string, boolean>>>({})

  const { data: reportsData, isLoading: reportsLoading, isFetching: fetchingReports } = useQuery({
    queryKey: ['reports', filterAgentId || null],
    queryFn: () => getReports(filterAgentId || undefined, { sections: ['agents', 'batches'] }),
  })

  const { data: activityData, isLoading: activityLoading, refetch: refetchActivity, isFetching: fetchingActivity } = useQuery({
    queryKey: ['callActivity', filterAgentId || null, granularity],
    queryFn: () =>
      getCallActivity({
        agentId: filterAgentId || undefined,
        granularity,
      }),
  })

  const agents: AgentOption[] = reportsData?.agentPerformance ?? []
  const batchProgress: BatchProgressRow[] = reportsData?.batchProgress ?? []
  const isRefreshing = fetchingReports || fetchingActivity
  const showAgentBreakdown = !filterAgentId

  const handleAgentChange = (agentId: string) => {
    if (agentId) setSearchParams({ agentId })
    else setSearchParams({})
    setExpandedBatches({})
    setExpandedAgents({})
  }

  const handleRefresh = () => {
    void queryClient.fetchQuery({
      queryKey: ['reports', filterAgentId || null],
      queryFn: () => getReports(filterAgentId || undefined, { refresh: true, sections: ['agents', 'batches'] }),
    })
    refetchActivity()
  }

  if (reportsLoading && !reportsData) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Cargando lotes...</p>
        </div>
      </div>
    )
  }

  const showSmallSampleWarning =
    activityData != null &&
    activityData.totalCalls > 0 &&
    activityData.totalCalls < SMALL_SAMPLE_THRESHOLD

  return (
    <div className="p-4 md:p-6 space-y-7">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            to={buildReportsUrl({ agentId: filterAgentId || undefined })}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mb-2"
          >
            <ArrowLeft size={14} />
            Volver a reportes
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Detalle de lotes</h1>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Filter size={15} className="text-gray-400" />
          <select
            className="input text-sm py-1.5 min-w-[200px]"
            value={filterAgentId}
            onChange={(e) => handleAgentChange(e.target.value)}
          >
            <option value="">Todos los agentes</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {filterAgentId && (
            <button
              onClick={() => handleAgentChange('')}
              className="text-xs text-blue-600 hover:underline whitespace-nowrap"
            >
              Ver todos
            </button>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Actualizar datos"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Call activity */}
      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp size={14} />
            Actividad de llamadas
            {filterAgentId && (
              <span className="font-normal normal-case text-gray-500">
                — {agents.find((a) => a.id === filterAgentId)?.name ?? 'agente filtrado'}
              </span>
            )}
          </h2>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
            {(['day', 'week', 'month'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGranularity(g)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  granularity === g
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {g === 'day' ? 'Día' : g === 'week' ? 'Semana' : 'Mes'}
              </button>
            ))}
          </div>
        </div>

        {showSmallSampleWarning && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>
              Muestra pequeña ({activityData!.totalCalls} llamadas). Los tiempos entre llamadas pueden no ser representativos.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(240px,320px)] gap-4">
          <div className="card p-4">
            {activityLoading && !activityData ? (
              <p className="text-sm text-gray-400 text-center py-8">Cargando actividad...</p>
            ) : (
              <CallActivityChart
                series={activityData?.series ?? []}
                granularity={granularity}
              />
            )}
          </div>

          <div className="card p-4 space-y-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">KPIs de ritmo</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xl font-bold text-gray-900">{activityData?.totalCalls ?? 0}</p>
                <p className="text-xs text-gray-500">Total llamadas</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {formatGapMinutes(activityData?.medianGapMinutes ?? null)}
                </p>
                <p className="text-xs text-gray-500" title="Mediana entre llamadas">Mediana</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {formatGapMinutes(activityData?.avgGapMinutes ?? null)}
                </p>
                <p className="text-xs text-gray-500" title="Promedio entre llamadas">Promedio</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{activityData?.gapCount ?? 0}</p>
                <p className="text-xs text-gray-500" title="Intervalos medidos">Intervalos</p>
              </div>
            </div>
            {activityData && activityData.byAgent.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Por agente</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {activityData.byAgent.map((a) => (
                    <div key={a.agentId} className="text-xs text-gray-700 truncate">
                      {a.name} · {a.totalCalls} · med. {formatGapMinutes(a.medianGapMinutes)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Batch list */}
      <section>
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Package size={14} />
          Lotes de importación
        </h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="w-10 px-2 py-3" />
                <th className="text-left px-4 py-3 font-medium text-gray-600">Archivo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">Asignadas / Total</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">Llamadas</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">Contactadas</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">En embudo</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">Venta cerrada</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[140px]">Progreso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batchProgress.map((b) => {
                const canExpand = showAgentBreakdown && b.assignedCompanies > 0
                const isExpanded = !!expandedBatches[b.id]
                const assigned = filterAgentId
                  ? (b.assignedToAgentCompanies ?? 0)
                  : b.assignedCompanies

                return (
                  <Fragment key={b.id}>
                  <tr
                    className={`${canExpand ? 'cursor-pointer' : ''} hover:bg-gray-50 transition-colors`}
                    onClick={() => {
                      if (!canExpand) return
                      setExpandedBatches((prev) => ({ ...prev, [b.id]: !prev[b.id] }))
                    }}
                  >
                    <td className="px-2 py-3">
                      {canExpand ? (
                        <button
                          type="button"
                          className="text-gray-500 hover:text-gray-800 p-1 rounded-md hover:bg-gray-100"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedBatches((prev) => ({ ...prev, [b.id]: !prev[b.id] }))
                          }}
                          aria-label={isExpanded ? 'Contraer lote' : 'Expandir lote'}
                        >
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      ) : (
                        <div className="w-8" />
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[240px] truncate">
                      <Link
                        to={buildBatchDetailUrl(b.id, filterAgentId || undefined)}
                        className="font-medium text-blue-600 hover:underline"
                        title={b.filename}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {b.filename}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {format(new Date(b.createdAt), 'd MMM yyyy', { locale: es })}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-bold text-gray-900">{assigned}</span>
                      <span className="text-gray-400 font-normal"> de </span>
                      <span className="text-gray-500">{b.batchTotalCompanies}</span>
                    </td>
                    <td className="px-3 py-3 text-right text-gray-700 font-medium">{b.callCount}</td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-blue-700 font-medium">{b.contactedCompanies}</span>
                      <span className="text-gray-400 text-xs ml-1">({b.contactedPct}%)</span>
                    </td>
                    <td className="px-3 py-3 text-right text-green-700 font-medium">{b.inFunnel}</td>
                    <td className="px-3 py-3 text-right text-emerald-700 font-medium">{b.ventaCerrada}</td>
                    <td className="px-4 py-3">
                      <Bar
                        pct={b.contactedPct}
                        color={b.contactedPct >= 70 ? 'bg-green-500' : b.contactedPct >= 40 ? 'bg-amber-400' : 'bg-blue-400'}
                      />
                    </td>
                  </tr>
                  {canExpand && isExpanded && (
                    <BatchLotesAgentBreakdown
                      batch={b}
                      expandedAgents={expandedAgents}
                      setExpandedAgents={setExpandedAgents}
                    />
                  )}
                  </Fragment>
                )
              })}
              {batchProgress.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">
                    Sin lotes importados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

export { buildLotesUrl, buildBatchDetailUrl }
