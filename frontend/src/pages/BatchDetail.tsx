import { Fragment, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  ArrowLeft, Filter, Package, Phone, RefreshCw, TrendingUp, AlertCircle, ChevronRight,
  Target, Users,
} from 'lucide-react'
import {
  getReports,
  getBatchDetail,
  getCallActivity,
  getAssignmentRunCompanies,
  getUntrackedCompanies,
  type CallActivityGranularity,
} from '../api/client'
import { DispositionBadge } from '../components/StatusBadge'
import { getResponseOption } from '../config/responseOptions'
import { CallActivityChart, formatGapMinutes, SMALL_SAMPLE_THRESHOLD } from '../components/CallActivityChart'
import { buildLotesUrl } from './BatchReports'

type AgentOption = { id: string; name: string }

function Bar({ pct, color = 'bg-blue-500' }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function RunCompanyDetail({
  runId,
  expanded,
  isLegacy,
  agentId,
  batchId,
}: {
  runId: string
  expanded: boolean
  isLegacy?: boolean
  agentId?: string
  batchId?: string
}) {
  const { data, isLoading } = useQuery({
    queryKey: isLegacy
      ? ['untrackedCompanies', agentId, batchId]
      : ['assignmentRunCompanies', runId],
    queryFn: () =>
      isLegacy
        ? getUntrackedCompanies(agentId!, batchId!)
        : getAssignmentRunCompanies(runId),
    enabled: expanded && (!isLegacy || (!!agentId && !!batchId)),
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <tr className="bg-gray-50/60">
        <td colSpan={9} className="px-4 py-2 pl-14 text-xs text-gray-400">
          Cargando empresas...
        </td>
      </tr>
    )
  }

  const companies = data?.companies ?? []
  if (companies.length === 0) {
    return (
      <tr className="bg-gray-50/60">
        <td colSpan={9} className="px-4 py-2 pl-14 text-xs text-gray-400">
          Sin empresas en esta asignación
        </td>
      </tr>
    )
  }

  return (
    <tr className="bg-gray-50/60">
      <td colSpan={9} className="px-4 py-2 pl-14">
        <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-3 py-1.5 font-medium text-gray-500">RUC</th>
                <th className="text-left px-3 py-1.5 font-medium text-gray-500">Razón social</th>
                <th className="text-left px-3 py-1.5 font-medium text-gray-500">Respuesta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {companies.map((company) => {
                const aclaracion =
                  company.lastAclaracion ??
                  (company.lastDisposition
                    ? getResponseOption(company.lastDisposition)?.aclaracion
                    : undefined)
                return (
                <tr key={company.id} className="hover:bg-gray-50">
                  <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{company.ruc}</td>
                  <td className="px-3 py-1.5 text-gray-900 truncate max-w-[200px]">
                    {company.razonSocial || '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    {company.lastDisposition ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <DispositionBadge disposition={company.lastDisposition} />
                        {aclaracion ? (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                            {aclaracion}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">Pendiente</span>
                    )}
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  )
}

export default function BatchDetail() {
  const { batchId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const filterAgentId = searchParams.get('agentId') ?? ''
  const [granularity, setGranularity] = useState<CallActivityGranularity>('day')
  const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({})

  const { data: agentsData } = useQuery({
    queryKey: ['reports', null],
    queryFn: () => getReports(),
    staleTime: 120_000,
  })

  const { data: batch, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['batchDetail', batchId, filterAgentId || null],
    queryFn: () => getBatchDetail(batchId, filterAgentId || undefined),
    enabled: !!batchId,
  })

  const { data: activityData, isLoading: activityLoading, refetch: refetchActivity, isFetching: fetchingActivity } = useQuery({
    queryKey: ['callActivity', batchId, filterAgentId || null, granularity],
    queryFn: () =>
      getCallActivity({
        batchId,
        agentId: filterAgentId || undefined,
        granularity,
      }),
    enabled: !!batchId,
  })

  const agents: AgentOption[] = agentsData?.agentPerformance ?? []
  const isRefreshing = isFetching || fetchingActivity

  const handleAgentChange = (agentId: string) => {
    if (agentId) setSearchParams({ agentId })
    else setSearchParams({})
  }

  const toggleRunExpand = (runId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedRuns((prev) => ({ ...prev, [runId]: !prev[runId] }))
  }

  const handleRefresh = () => {
    refetch()
    refetchActivity()
  }

  if (isLoading && !batch) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Cargando lote...</p>
        </div>
      </div>
    )
  }

  if (!batch) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Lote no encontrado</p>
        <Link to={buildLotesUrl(filterAgentId || undefined)} className="text-blue-600 text-sm hover:underline mt-2 inline-block">
          Volver a lotes
        </Link>
      </div>
    )
  }

  const assigned = filterAgentId
    ? (batch.assignedToAgentCompanies ?? 0)
    : batch.assignedCompanies
  const runs = batch.assignmentRuns ?? []
  const showSmallSampleWarning =
    activityData != null &&
    activityData.totalCalls > 0 &&
    activityData.totalCalls < SMALL_SAMPLE_THRESHOLD

  return (
    <div className="p-4 md:p-6 space-y-7">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            to={buildLotesUrl(filterAgentId || undefined)}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mb-2"
          >
            <ArrowLeft size={14} />
            Volver a lotes
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 truncate max-w-xl" title={batch.filename}>
            {batch.filename}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Importado el {format(new Date(batch.createdAt), "d 'de' MMMM yyyy", { locale: es })}
            {filterAgentId && (
              <span className="text-gray-400">
                {' · '}
                {agents.find((a) => a.id === filterAgentId)?.name ?? 'agente filtrado'}
              </span>
            )}
          </p>
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

      {/* Summary KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="card p-4">
          <div className="flex items-start gap-2">
            <Users size={16} className="text-gray-400 mt-0.5" />
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {assigned}
                <span className="text-sm font-normal text-gray-400"> / {batch.batchTotalCompanies}</span>
              </p>
              <p className="text-xs text-gray-500">Asignadas / total</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-start gap-2">
            <Phone size={16} className="text-gray-400 mt-0.5" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{batch.callCount}</p>
              <p className="text-xs text-gray-500">Llamadas</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-start gap-2">
            <Target size={16} className="text-gray-400 mt-0.5" />
            <div>
              <p className="text-2xl font-bold text-blue-700">{batch.contactedCompanies}</p>
              <p className="text-xs text-gray-500">Contactadas ({batch.contactedPct}%)</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-bold text-green-700">{batch.inFunnel}</p>
          <p className="text-xs text-gray-500">En embudo</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-bold text-emerald-700">{batch.ventaCerrada}</p>
          <p className="text-xs text-gray-500">Venta cerrada</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-bold text-gray-700">{batch.pendingCompanies}</p>
          <p className="text-xs text-gray-500">Pendientes</p>
        </div>
      </section>

      {/* Progress bar */}
      <section className="card p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium text-gray-700">Progreso de contacto</span>
          <span className="text-gray-500">{batch.contactedPct}%</span>
        </div>
        <Bar
          pct={batch.contactedPct}
          color={batch.contactedPct >= 70 ? 'bg-green-500' : batch.contactedPct >= 40 ? 'bg-amber-400' : 'bg-blue-400'}
        />
        {!filterAgentId && batch.unassignedCompanies > 0 && (
          <p className="text-xs text-gray-400 mt-2">
            {batch.unassignedCompanies} empresas sin asignar en este lote
          </p>
        )}
      </section>

      {/* Call activity */}
      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp size={14} />
            Actividad de llamadas en este lote
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
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Ritmo de llamadas</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xl font-bold text-gray-900">{activityData?.totalCalls ?? 0}</p>
                <p className="text-xs text-gray-500">Total llamadas</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {formatGapMinutes(activityData?.medianGapMinutes ?? null)}
                </p>
                <p className="text-xs text-gray-500">Mediana entre llamadas</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {formatGapMinutes(activityData?.avgGapMinutes ?? null)}
                </p>
                <p className="text-xs text-gray-500">Promedio entre llamadas</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{activityData?.gapCount ?? 0}</p>
                <p className="text-xs text-gray-500">Intervalos medidos</p>
              </div>
            </div>
            {activityData && activityData.byAgent.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Por agente</p>
                <div className="space-y-2">
                  {activityData.byAgent.map((a) => (
                    <div key={a.agentId} className="text-xs">
                      <div className="flex justify-between font-medium text-gray-700">
                        <span className="truncate mr-2">{a.name}</span>
                        <span>{a.totalCalls} llamadas</span>
                      </div>
                      <div className="flex justify-between text-gray-500 mt-0.5">
                        <span>Promedio</span>
                        <span>{formatGapMinutes(a.avgGapMinutes)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>Mediana</span>
                        <span>{formatGapMinutes(a.medianGapMinutes)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Assignment runs */}
      {filterAgentId && (
        <section>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Package size={14} />
            Desglose por asignación
          </h2>
          {runs.length === 0 ? (
            <div className="card p-6 text-center text-sm text-gray-400">
              Sin asignaciones registradas para este agente en el lote
            </div>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 w-8" />
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Asignación</th>
                    <th className="text-right px-3 py-3 font-medium text-gray-600">Empresas</th>
                    <th className="text-right px-3 py-3 font-medium text-gray-600">Llamadas</th>
                    <th className="text-right px-3 py-3 font-medium text-gray-600">Contactadas</th>
                    <th className="text-right px-3 py-3 font-medium text-gray-600">En embudo</th>
                    <th className="text-right px-3 py-3 font-medium text-gray-600">Venta cerrada</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[120px]">Progreso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {runs.map((run) => {
                    const runExpanded = expandedRuns[run.id] ?? false
                    return (
                      <Fragment key={run.id}>
                        <tr
                          className="hover:bg-gray-50 cursor-pointer text-xs"
                          onClick={(e) => toggleRunExpand(run.id, e)}
                        >
                          <td className="px-4 py-2 text-gray-400 w-8">
                            <ChevronRight
                              size={12}
                              className={`transition-transform ${runExpanded ? 'rotate-90' : ''}`}
                            />
                          </td>
                          <td className="px-4 py-2 text-gray-600">
                            {run.isLegacy ? (
                              'Asignación anterior (sin historial)'
                            ) : (
                              <>
                                {format(new Date(run.assignedAt!), 'd MMM yyyy, HH:mm', { locale: es })}
                                {' · '}
                                por {run.assignedBy.name}
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <span className="font-bold text-gray-700">{run.companyCount}</span>
                            <span className="text-gray-400 font-normal"> de </span>
                            <span className="text-gray-500">{batch.batchTotalCompanies}</span>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700 font-medium">{run.callCount}</td>
                          <td className="px-3 py-2 text-right">
                            <span className="text-blue-700 font-medium">{run.contactedCompanies}</span>
                            <span className="text-gray-400 ml-1">({run.contactedPct}%)</span>
                          </td>
                          <td className="px-3 py-2 text-right text-green-700 font-medium">{run.inFunnel}</td>
                          <td className="px-3 py-2 text-right text-emerald-700 font-medium">{run.ventaCerrada}</td>
                          <td className="px-4 py-2">
                            <Bar
                              pct={run.contactedPct}
                              color={run.contactedPct >= 70 ? 'bg-green-500' : run.contactedPct >= 40 ? 'bg-amber-400' : 'bg-blue-400'}
                            />
                          </td>
                        </tr>
                        {runExpanded && (
                          <RunCompanyDetail
                            runId={run.id}
                            expanded={runExpanded}
                            isLegacy={run.isLegacy}
                            agentId={filterAgentId}
                            batchId={batchId}
                          />
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {!filterAgentId && (
        <p className="text-sm text-gray-500 text-center py-2">
          Selecciona un agente para ver el desglose por asignación
        </p>
      )}
    </div>
  )
}
