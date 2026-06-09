import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDashboardStats, getAgentStats, getMyBatches } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { Users, Phone, CalendarClock, TrendingUp, PhoneCall, Layers } from 'lucide-react'
import { DispositionBadge } from '../components/StatusBadge'
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

export default function Dashboard() {
  const { isAdmin, user } = useAuth()
  const [selectedBatchId, setSelectedBatchId] = useState<string | undefined>(undefined)

  const { data: myBatches } = useQuery({
    queryKey: ['my-batches'],
    queryFn: getMyBatches,
    enabled: !isAdmin,
  })

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard', 'stats', selectedBatchId],
    queryFn: () => getDashboardStats(selectedBatchId),
    refetchInterval: 60000,
  })

  const { data: agentStats } = useQuery({
    queryKey: ['dashboard', 'agents-stats'],
    queryFn: getAgentStats,
    enabled: isAdmin,
  })

  if (isLoading) {
    return (
      <div className="p-8">
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
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Buen día, {user?.name.split(' ')[0]} 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
        </p>
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
          <StatCard label="Clientes asignados" value={stats?.assignedClients ?? 0} icon={Users} color="bg-blue-600" />
          <StatCard label="Llamadas realizadas" value={stats?.totalCalls ?? 0} icon={Phone} color="bg-green-600" />
          <StatCard label="Callbacks hoy" value={stats?.todayCallbacks ?? 0} icon={CalendarClock} color="bg-amber-500" />
          <StatCard label="Callbacks pendientes" value={stats?.pendingCallbacks ?? 0} icon={TrendingUp} color="bg-purple-600" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status breakdown */}
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Estado de clientes</h2>
          <div className="space-y-3">
            {Object.entries(stats?.clientsByStatus ?? {}).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{STATUS_LABELS[status] ?? status}</span>
                <span className="text-sm font-semibold text-gray-900">{count as number}</span>
              </div>
            ))}
            {Object.keys(stats?.clientsByStatus ?? {}).length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Sin datos todavía</p>
            )}
          </div>
        </div>

        {/* Recent calls */}
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Últimas llamadas</h2>
          <div className="space-y-3">
            {stats?.recentCalls?.map(
              (call: {
                id: string
                disposition: string
                calledAt: string
                client: { name: string; phone: string }
                agent?: { name: string }
              }) => (
                <div key={call.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{call.client.name}</p>
                    <p className="text-xs text-gray-400">
                      {call.client.phone}
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
