import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getDashboardStats, getMyBatches } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import {
  Users,
  Phone,
  CalendarClock,
  Calendar,
  PhoneCall,
  Layers,
  RefreshCw,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { RecentCallRow } from '../components/RecentCallRow'
import ClientRecordModal from '../components/ClientRecordModal'
import { DISPOSITION_BAR_COLORS, isFunnelDisposition } from '../config/responseOptions'
import {
  AGENT_PIPELINE_FUNNEL,
  AGENT_PIPELINE_OPERATIONAL,
  AGENT_PIPELINE_QUEUE,
  buildPipelineClientsUrl,
} from '../config/companyPipeline'
import { RELEASES } from '../content/releaseNotes'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const RELEASE_HISTORY_PREVIEW = 5

function StatCard({
  label,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  label: string
  value: number | string
  subtitle?: string
  icon: React.ElementType
  color: string
}) {
  return (
    <div className="card p-6 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={24} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {subtitle ? <p className="text-xs text-gray-400">{subtitle}</p> : null}
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { isAdmin, user } = useAuth()
  const navigate = useNavigate()
  const [selectedBatchId, setSelectedBatchId] = useState<string | undefined>(undefined)
  const [recordModal, setRecordModal] = useState<{ clientId: string } | null>(null)
  const [showFullReleaseHistory, setShowFullReleaseHistory] = useState(false)

  const goToMyLeadsFilter = (filter: string) => {
    const params = new URLSearchParams()
    if (filter) params.set('filter', filter)
    if (selectedBatchId) params.set('batchId', selectedBatchId)
    params.set('from', 'dashboard')
    const query = params.toString()
    navigate(`/my-leads?${query}`)
  }

  const goToClientsFilter = (filter: string) => {
    navigate(buildPipelineClientsUrl(filter, { from: 'dashboard' }))
  }

  const onPipelineFilter = isAdmin ? goToClientsFilter : goToMyLeadsFilter
  const pipelineListLabel = isAdmin ? 'Clientes' : 'Mis Clientes'

  const { data: myBatches } = useQuery({
    queryKey: ['my-batches'],
    queryFn: getMyBatches,
    enabled: !isAdmin,
  })

  const bypassCacheRef = useRef(false)

  const {
    data: stats,
    isLoading,
    isFetching: isFetchingStats,
    isError: isStatsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['dashboard', 'stats', selectedBatchId],
    queryFn: () => {
      const refresh = bypassCacheRef.current
      bypassCacheRef.current = false
      return getDashboardStats(selectedBatchId, { refresh })
    },
  })

  const isRefreshing = isFetchingStats

  const handleRefresh = () => {
    bypassCacheRef.current = true
    void refetchStats()
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-gray-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Buen día, {user?.name.split(' ')[0]} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="Actualizar datos"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 shrink-0"
        >
          <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {isStatsError && !stats ? (
        <p className="text-sm text-red-600">No se pudieron cargar las estadísticas. Prueba Actualizar.</p>
      ) : null}

      {/* Batch filter chips (agent only) */}
      {!isAdmin && myBatches && myBatches.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-gray-400 mr-1">
            <Layers size={14} />
            <span className="text-xs font-medium">Lote:</span>
          </div>
          <button
            onClick={() => setSelectedBatchId(undefined)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              !selectedBatchId
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            Todos ({myBatches.reduce((s: number, b: { clientCount: number }) => s + b.clientCount, 0)})
          </button>
          {myBatches.map((b: { id: string; filename: string; clientCount: number }) => (
            <button
              key={b.id}
              onClick={() => setSelectedBatchId(b.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                selectedBatchId === b.id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              {b.filename.replace(/\.[^.]+$/, '')}
              <span className={`ml-1.5 ${selectedBatchId === b.id ? 'text-blue-200' : 'text-gray-400'}`}>
                {b.clientCount}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Stat cards */}
      {isAdmin ? (
        (() => {
          const pipeline = stats?.companyPipeline
          const assignedCompanies = stats?.assignedCompanies ?? 0
          const pendingCount = pipeline?.PENDING ?? 0
          const companyContactPct =
            assignedCompanies > 0
              ? Math.round(((assignedCompanies - pendingCount) / assignedCompanies) * 100)
              : (stats?.companyContactRate ?? 0)

          return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Empresas asignadas"
                value={assignedCompanies}
                subtitle={
                  stats?.assignedContacts != null
                    ? `${stats.assignedContacts} contactos`
                    : undefined
                }
                icon={Users}
                color="bg-blue-600"
              />
              <StatCard
                label="Tasa contacto empresas"
                value={`${companyContactPct}%`}
                icon={Phone}
                color="bg-emerald-600"
              />
              <StatCard label="Agentes activos" value={stats?.totalAgents ?? 0} icon={PhoneCall} color="bg-indigo-600" />
              <StatCard label="Callbacks pendientes" value={stats?.pendingCallbacks ?? 0} icon={CalendarClock} color="bg-amber-500" />
            </div>
          )
        })()
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Contactos asignados"
            value={stats?.assignedContacts ?? stats?.assignedClients ?? 0}
            subtitle={
              stats?.assignedCompanies != null
                ? `${stats.assignedCompanies} empresas`
                : undefined
            }
            icon={Users}
            color="bg-blue-600"
          />
          <StatCard label="Llamadas realizadas" value={stats?.totalCalls ?? 0} icon={Phone} color="bg-green-600" />
          <StatCard label="Callbacks hoy" value={stats?.todayCallbacks ?? 0} icon={CalendarClock} color="bg-amber-500" />
          <StatCard label="Callbacks pendientes" value={stats?.pendingCallbacks ?? 0} icon={Calendar} color="bg-purple-600" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(() => {
          const pipeline = stats?.companyPipeline
          const totalCompanies = stats?.assignedCompanies ?? 0
          const pendingCount = pipeline?.PENDING ?? 0
          const withResponse = totalCompanies - pendingCount
          const otrosRow = AGENT_PIPELINE_OPERATIONAL.find((row) => row.key === 'OTROS')
          const queueRows = [
            ...AGENT_PIPELINE_QUEUE,
            ...((pipeline?.OTROS ?? 0) > 0 && otrosRow ? [otrosRow] : []),
          ]

          return (
            <div className="card p-6 overflow-visible lg:col-span-2">
              <h2 className="font-semibold text-gray-900 mb-1">Por empresa (RUC)</h2>
              <p className="text-xs text-gray-500 mb-5">
                {pipeline ? (
                  <>
                    <span className="font-medium text-gray-700">{totalCompanies} empresas</span>
                    <span className="text-gray-300 mx-1.5">·</span>
                    <span>{pendingCount} pendientes</span>
                    <span className="text-gray-300 mx-1.5">·</span>
                    <span>{withResponse} con respuesta</span>
                  </>
                ) : isAdmin ? (
                  'Empresas con al menos un contacto asignado — última respuesta global por RUC'
                ) : (
                  'Última respuesta registrada por el agente por empresa'
                )}
              </p>

              {pipeline ? (
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,35%)_minmax(0,65%)] gap-6 md:gap-0">
                  <div className="md:pr-6 md:border-r md:border-gray-200">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                      Cola de trabajo
                    </h3>
                    <div className="space-y-2">
                      {queueRows.map((row) => {
                        const count = pipeline[row.key] ?? 0
                        return (
                          <button
                            key={row.key}
                            type="button"
                            onClick={() => onPipelineFilter(row.key)}
                            title={`Ver ${row.label.toLowerCase()} en ${pipelineListLabel}`}
                            className={`w-full flex items-center justify-between rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${row.bgClass}`}
                          >
                            <div className="text-sm text-gray-700 text-left">
                              {row.label}
                              {'aclaracion' in row && (
                                <span className="ml-1.5 text-[10px] font-semibold text-gray-400">
                                  {row.aclaracion}
                                </span>
                              )}
                            </div>
                            <span className="text-sm font-semibold text-gray-900">{count}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="md:pl-6">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                      Embudo comercial (25%–100%)
                    </h3>
                    <div className="space-y-2.5">
                      {AGENT_PIPELINE_FUNNEL.map((row) => {
                        const count = pipeline[row.key] ?? 0
                        return (
                          <button
                            key={row.key}
                            type="button"
                            onClick={() => onPipelineFilter(row.key)}
                            title={`Ver ${row.fullLabel.toLowerCase()} en ${pipelineListLabel}`}
                            className="w-full space-y-0.5 cursor-pointer rounded-md px-1 -mx-1 py-0.5 hover:bg-gray-50 transition-colors text-left"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-700">
                                <span title={row.fullLabel}>{row.shortLabel ?? row.label}</span>
                                <span className="text-gray-400"> ({row.aclaracion})</span>
                              </span>
                              <span className="font-semibold text-gray-900">{count}</span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${DISPOSITION_BAR_COLORS[row.key] ?? 'bg-green-500'}`}
                                style={{
                                  width: `${totalCompanies > 0 ? (count / totalCompanies) * 100 : 0}%`,
                                }}
                              />
                            </div>
                          </button>
                        )
                      })}
                      {AGENT_PIPELINE_FUNNEL.every((row) => (pipeline[row.key] ?? 0) === 0) && (
                        <p className="text-sm text-gray-400 text-center py-4">Sin avance comercial registrado</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400 text-center py-4">Sin datos todavía</p>
              )}
            </div>
          )
        })()}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent calls */}
        <div className="card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Últimas llamadas</h2>
            <Link
              to="/clients"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              Ver más →
            </Link>
          </div>
          <div className="space-y-3">
            {stats?.recentCalls?.map((call) => {
              const clickable = isFunnelDisposition(call.disposition)
              return (
                <RecentCallRow
                  key={call.id}
                  call={call}
                  showAgent={isAdmin}
                  title={clickable ? 'Ver registro' : undefined}
                  onClick={
                    clickable
                      ? () => setRecordModal({ clientId: call.company.id })
                      : undefined
                  }
                />
              )
            })}
            {!stats?.recentCalls?.length && (
              <p className="text-sm text-gray-400 text-center py-4">Sin llamadas registradas</p>
            )}
          </div>
        </div>
      </div>

      {isAdmin && RELEASES.length > 0 && (
        <div className="card p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <Sparkles size={18} className="text-blue-600" />
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900">Novedades del sistema</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Última actualización: {RELEASES[0].dateLabel}
              </p>
            </div>
          </div>
          <div className="space-y-5">
            {(showFullReleaseHistory || RELEASES.length <= RELEASE_HISTORY_PREVIEW
              ? RELEASES
              : RELEASES.slice(0, RELEASE_HISTORY_PREVIEW)
            ).map((release) => (
              <section key={release.date}>
                <h3 className="text-sm font-medium text-gray-800 mb-2">{release.dateLabel}</h3>
                <ul className="space-y-2.5 list-disc list-outside pl-5 text-sm text-gray-600">
                  {release.items.map((item) => (
                    <li key={item} className="leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {RELEASES.length > RELEASE_HISTORY_PREVIEW && !showFullReleaseHistory && (
            <button
              type="button"
              onClick={() => setShowFullReleaseHistory(true)}
              className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              Ver historial
            </button>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => navigate('/clients')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
          >
            Ver reportes y análisis
            <ArrowRight size={15} />
          </button>
        </div>
      )}

      {recordModal && (
        <ClientRecordModal
          clientId={recordModal.clientId}
          initialFocus="history"
          onClose={() => setRecordModal(null)}
        />
      )}
    </div>
  )
}
