import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDashboardStats, getAgentStats, getMyBatches } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { Users, Phone, CalendarClock, TrendingUp, PhoneCall, Layers, RefreshCw } from 'lucide-react'
import { DispositionBadge } from '../components/StatusBadge'
import { StatusHelpPopover } from '../components/StatusHelpPopover'
import { isStatusHelpKey } from '../config/statusHelp'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number | string
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
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  )
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En progreso',
  INTERESTED: 'Interesado',
  CONVERTED: 'Convertido',
  NOT_INTERESTED: 'No interesado',
  DO_NOT_CALL: 'No llamar',
}

const COMPANY_STATUS_EXCLUDE = new Set(['NOT_INTERESTED', 'DO_NOT_CALL'])

export default function Dashboard() {
  const { isAdmin, user } = useAuth()
  const [selectedBatchId, setSelectedBatchId] = useState<string | undefined>(undefined)

  const { data: myBatches } = useQuery({
    queryKey: ['my-batches'],
    queryFn: getMyBatches,
    enabled: !isAdmin,
  })

  const { data: stats, isLoading, isFetching: isFetchingStats, refetch: refetchStats } = useQuery({
    queryKey: ['dashboard', 'stats', selectedBatchId],
    queryFn: () => getDashboardStats(selectedBatchId),
  })

  const { data: agentStats, isFetching: isFetchingAgents, refetch: refetchAgents } = useQuery({
    queryKey: ['dashboard', 'agents-stats'],
    queryFn: getAgentStats,
    enabled: isAdmin,
  })

  const isRefreshing = isFetchingStats || (isAdmin && isFetchingAgents)

  const handleRefresh = () => {
    refetchStats()
    if (isAdmin) refetchAgents()
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total clientes" value={stats?.totalClients ?? 0} icon={Users} color="bg-blue-600" />
          <StatCard label="Agentes activos" value={stats?.totalAgents ?? 0} icon={PhoneCall} color="bg-indigo-600" />
          <StatCard label="Llamadas realizadas" value={stats?.totalCalls ?? 0} icon={Phone} color="bg-green-600" />
          <StatCard label="Callbacks pendientes" value={stats?.pendingCallbacks ?? 0} icon={CalendarClock} color="bg-amber-500" />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Contactos asignados" value={stats?.assignedContacts ?? stats?.assignedClients ?? 0} icon={Users} color="bg-blue-600" />
          <StatCard label="Llamadas realizadas" value={stats?.totalCalls ?? 0} icon={Phone} color="bg-green-600" />
          <StatCard label="Callbacks hoy" value={stats?.todayCallbacks ?? 0} icon={CalendarClock} color="bg-amber-500" />
          <StatCard label="Callbacks pendientes" value={stats?.pendingCallbacks ?? 0} icon={TrendingUp} color="bg-purple-600" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Record status breakdown (primary) */}
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Estado de registros</h2>
          <p className="text-xs text-gray-400 mb-4">Por contacto (cada fila del Excel)</p>
          <div className="space-y-3">
            {Object.entries(stats?.contactsByStatus ?? {}).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between group/row">
                <div className="text-sm text-gray-600 flex items-center gap-1">
                  {STATUS_LABELS[status] ?? status}
                  {isStatusHelpKey(status) && <StatusHelpPopover helpKey={status} />}
                </div>
                <span className="text-sm font-semibold text-gray-900">{count as number}</span>
              </div>
            ))}
            {Object.keys(stats?.contactsByStatus ?? {}).length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Sin datos todavía</p>
            )}
          </div>
        </div>

        {/* Company status breakdown (supplementary) */}
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Por empresa (RUC)</h2>
          <p className="text-xs text-gray-400 mb-4">Estado agregado por RUC (derivado de contactos)</p>
          <div className="space-y-3">
            {Object.entries(stats?.companiesByStatus ?? stats?.clientsByStatus ?? {})
              .filter(([status]) => !COMPANY_STATUS_EXCLUDE.has(status))
              .map(([status, count]) => (
              <div key={status} className="flex items-center justify-between group/row">
                <div className="text-sm text-gray-600 flex items-center gap-1">
                  {STATUS_LABELS[status] ?? status}
                  {isStatusHelpKey(status) && <StatusHelpPopover helpKey={status} companyLevel />}
                </div>
                <span className="text-sm font-semibold text-gray-500">{count as number}</span>
              </div>
            ))}
            {Object.entries(stats?.companiesByStatus ?? stats?.clientsByStatus ?? {})
              .filter(([status]) => !COMPANY_STATUS_EXCLUDE.has(status)).length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Sin datos todavía</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent calls */}
        <div className="card p-6 lg:col-span-2">
          <h2 className="font-semibold text-gray-900 mb-4">Últimas llamadas</h2>
          <div className="space-y-3">
            {stats?.recentCalls?.map(
              (call: {
                id: string
                disposition: string
                calledAt: string
                company: { ruc: string; razonSocial?: string }
                contact?: { nombre: string } | null
                agent?: { name: string }
              }) => (
                <div key={call.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{call.company.razonSocial || call.company.ruc}</p>
                    <p className="text-xs text-gray-400">
                      {call.contact ? call.contact.nombre : call.company.ruc}
                      {call.agent ? ` · ${call.agent.name}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <DispositionBadge disposition={call.disposition} />
                    <p className="text-xs text-gray-400 mt-1">
                      {format(new Date(call.calledAt), 'dd/MM HH:mm')}
                    </p>
                  </div>
                </div>
              )
            )}
            {!stats?.recentCalls?.length && (
              <p className="text-sm text-gray-400 text-center py-4">Sin llamadas registradas</p>
            )}
          </div>
        </div>
      </div>

      {/* Agent performance table (admin only) */}
      {isAdmin && agentStats && agentStats.length > 0 && (
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Rendimiento por agente</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 font-medium text-gray-600">Agente</th>
                  <th className="text-center py-2 font-medium text-gray-600">Asignados</th>
                  <th className="text-center py-2 font-medium text-gray-600">Llamadas</th>
                  <th className="text-center py-2 font-medium text-gray-600">Interesados</th>
                  <th className="text-center py-2 font-medium text-gray-600">No contesta</th>
                  <th className="text-center py-2 font-medium text-gray-600">Callbacks</th>
                </tr>
              </thead>
              <tbody>
                {agentStats.map(
                  (a: {
                    id: string
                    name: string
                    _count: { assignments: number; callLogs: number; callbacks: number }
                    dispositions: Record<string, number>
                  }) => (
                    <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3 font-medium text-gray-900">{a.name}</td>
                      <td className="py-3 text-center text-gray-600">{a._count.assignments}</td>
                      <td className="py-3 text-center text-gray-600">{a._count.callLogs}</td>
                      <td className="py-3 text-center text-green-600 font-medium">
                        {a.dispositions['INTERESTED'] ?? 0}
                      </td>
                      <td className="py-3 text-center text-gray-400">
                        {a.dispositions['NO_ANSWER'] ?? 0}
                      </td>
                      <td className="py-3 text-center text-blue-600">
                        {a.dispositions['CALLBACK'] ?? 0}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
