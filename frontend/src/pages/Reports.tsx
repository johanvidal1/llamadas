import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getReports, getClients, getCallbacks } from '../api/client'
import { format, isPast, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  TrendingUp, Users, Phone, CalendarClock, Target,
  Award, AlertCircle, ChevronUp, ChevronDown, Package, Filter, X,
} from 'lucide-react'
import { StatusBadge } from '../components/StatusBadge'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentPerf {
  id: string; name: string
  assigned: number; calledClients: number; totalCalls: number
  interested: number; converted: number; notInterested: number
  contactRate: number; conversionRate: number; avgCallsPerClient: number
  pendingCallbacks: number; overdueCallbacks: number
}
interface DayCount { date: string; count: number }
interface DispCount { disposition: string; count: number }
interface BatchProgress {
  id: string; filename: string; createdAt: string; totalRecords: number
  pending: number; inProgress: number; interested: number; interestedContactCount: number
  converted: number; notInterested: number; doNotCall: number; contacted: number; callCount: number
}
interface Funnel {
  total: number; assigned: number; pending: number; inProgress: number
  interested: number; converted: number; notInterested: number; doNotCall: number
}
interface ReportsData {
  agentPerformance: AgentPerf[]
  callsByDay: DayCount[]
  dispositionBreakdown: DispCount[]
  batchProgress: BatchProgress[]
  funnel: Funnel
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DISP_LABELS: Record<string, string> = {
  INTERESTED: 'Interesado', NOT_INTERESTED: 'No interesado',
  NO_ANSWER: 'Sin respuesta', BUSY: 'Ocupado',
  CALLBACK: 'Callback agendado', DO_NOT_CALL: 'No llamar', OTHER: 'Otro',
}
const DISP_COLORS: Record<string, string> = {
  INTERESTED: 'bg-green-500', NOT_INTERESTED: 'bg-red-400',
  NO_ANSWER: 'bg-gray-400', BUSY: 'bg-yellow-400',
  CALLBACK: 'bg-blue-400', DO_NOT_CALL: 'bg-red-700', OTHER: 'bg-purple-400',
}

function Bar({ pct, color = 'bg-blue-500' }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function StatCard({ label, value, sub, color = 'text-gray-900', icon: Icon }: {
  label: string; value: string | number; sub?: string; color?: string; icon?: React.ElementType
}) {
  return (
    <div className="card p-4 flex items-start gap-3">
      {Icon && <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center shrink-0"><Icon size={17} className="text-gray-600" /></div>}
      <div className="min-w-0">
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        <p className="text-xs text-gray-500 leading-tight">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Drill-down types ─────────────────────────────────────────────────────────

type MetricKey = 'contactRate' | 'conversionRate' | 'avgCallsPerClient' | 'interested' | 'overdueCallbacks'

interface DrillDown { agentId: string; agentName: string; metric: MetricKey }

const METRIC_LABELS: Record<MetricKey, string> = {
  contactRate: 'Tasa de contacto',
  conversionRate: 'Tasa de conversión',
  avgCallsPerClient: 'Llamadas por cliente',
  interested: 'Clientes interesados',
  overdueCallbacks: 'Callbacks vencidos',
}

// ─── Drill-down drawer ────────────────────────────────────────────────────────

function DrillDownDrawer({ drill, onClose }: { drill: DrillDown; onClose: () => void }) {
  const [tab, setTab] = useState<'a' | 'b'>('a')

  const isCallbackMetric = drill.metric === 'overdueCallbacks'

  const { data: clientsData, isLoading: loadingClients } = useQuery({
    queryKey: ['drill-clients', drill.agentId],
    queryFn: () => getClients({ agentId: drill.agentId, limit: 500 }),
    enabled: !isCallbackMetric,
  })
  const { data: callbacksData, isLoading: loadingCallbacks } = useQuery({
    queryKey: ['drill-callbacks', drill.agentId],
    queryFn: () => getCallbacks({ agentId: drill.agentId, completed: false }),
    enabled: isCallbackMetric,
  })

  const allClients: Array<{
    id: string
    ruc: string
    razonSocial?: string
    status: string
    contacts: { id: string; nombre: string; telefono?: string }[]
    _count: { callLogs: number; callbacks: number }
  }> = clientsData?.clients ?? []

  const allContacts = allClients.flatMap((company) =>
    company.contacts.map((contact) => ({
      id: contact.id,
      name: contact.nombre,
      phone: contact.telefono ?? '',
      status: company.status,
      _count: company._count,
    }))
  )

  const allCallbacks: Array<{
    id: string; scheduledAt: string; notes?: string
    client: { id: string; name: string; phone: string }
  }> = callbacksData ?? []

  // Derive lists per metric
  let tabALabel = '', tabBLabel = ''
  let tabAList: typeof allContacts = []
  let tabBList: typeof allContacts = []
  let overdueList: typeof allCallbacks = []

  if (drill.metric === 'contactRate') {
    tabAList = allContacts.filter((c) => c._count.callLogs > 0)
    tabBList = allContacts.filter((c) => c._count.callLogs === 0)
    tabALabel = `Contactados (${tabAList.length})`
    tabBLabel = `Sin contactar (${tabBList.length})`
  } else if (drill.metric === 'conversionRate') {
    tabAList = allContacts.filter((c) => c.status === 'INTERESTED' || c.status === 'CONVERTED')
    tabBList = allContacts.filter((c) => c._count.callLogs > 0 && c.status !== 'INTERESTED' && c.status !== 'CONVERTED')
    tabALabel = `Interesados/Convertidos (${tabAList.length})`
    tabBLabel = `Contactados sin conversión (${tabBList.length})`
  } else if (drill.metric === 'avgCallsPerClient') {
    tabAList = [...allContacts].sort((a, b) => b._count.callLogs - a._count.callLogs)
    tabALabel = `Todos los contactos (${tabAList.length})`
  } else if (drill.metric === 'interested') {
    tabAList = allContacts.filter((c) => c.status === 'INTERESTED' || c.status === 'CONVERTED')
    tabALabel = `Interesados (${tabAList.length})`
  } else if (drill.metric === 'overdueCallbacks') {
    overdueList = allCallbacks.filter((cb) => {
      const d = new Date(cb.scheduledAt)
      return isPast(d) && !isToday(d)
    })
  }

  const hasTabs = tabBLabel !== ''
  const activeList = isCallbackMetric ? [] : (hasTabs && tab === 'b' ? tabBList : tabAList)
  const isLoading = isCallbackMetric ? loadingCallbacks : loadingClients

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b bg-gray-50">
          <div>
            <p className="font-semibold text-gray-900">{drill.agentName}</p>
            <p className="text-xs text-blue-600 font-medium mt-0.5">{METRIC_LABELS[drill.metric]}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200 text-gray-500">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        {hasTabs && (
          <div className="flex border-b border-gray-200 shrink-0">
            {([['a', tabALabel], ['b', tabBLabel]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                  tab === key ? 'border-b-2 border-blue-600 text-blue-700' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center h-40 text-gray-400">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Callbacks overdue list */}
          {isCallbackMetric && !isLoading && (
            <div className="divide-y divide-gray-100">
              {overdueList.length === 0
                ? <p className="text-center text-gray-400 py-12 text-sm">Sin callbacks vencidos</p>
                : overdueList.map((cb) => (
                  <div key={cb.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                    <div>
                      <p className="font-medium text-sm text-gray-900">{cb.client.name}</p>
                      <p className="text-xs text-gray-500">{cb.client.phone}</p>
                      {cb.notes && <p className="text-xs text-gray-400 italic mt-0.5">{cb.notes}</p>}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium text-red-600 bg-red-50 border border-red-200 whitespace-nowrap">
                      <CalendarClock size={10} className="inline mr-1" />
                      {format(new Date(cb.scheduledAt), 'dd/MM HH:mm', { locale: es })}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {/* Client list */}
          {!isCallbackMetric && !isLoading && (
            <div className="divide-y divide-gray-100">
              {activeList.length === 0
                ? <p className="text-center text-gray-400 py-12 text-sm">Sin clientes en esta categoría</p>
                : activeList.map((c, i) => (
                  <div key={c.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                    <div className="min-w-0 flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-5 shrink-0">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-gray-900 truncate">{c.name}</p>
                        <p className="text-xs text-gray-500 font-mono">{c.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-3">
                      {drill.metric === 'avgCallsPerClient' && (
                        <span className="text-xs text-gray-500">
                          <Phone size={11} className="inline mr-0.5" />{c._count.callLogs}
                        </span>
                      )}
                      <StatusBadge status={c.status} />
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── Sort hook ─────────────────────────────────────────────────────────────────

type SortKey = keyof AgentPerf
function useSortedAgents(agents: AgentPerf[]) {
  const [sortBy, setSortBy] = useState<SortKey>('conversionRate')
  const [asc, setAsc] = useState(false)
  const toggle = (key: SortKey) => {
    if (sortBy === key) setAsc((a) => !a)
    else { setSortBy(key); setAsc(false) }
  }
  const sorted = [...agents].sort((a, b) => {
    const va = a[sortBy] as number
    const vb = b[sortBy] as number
    return asc ? va - vb : vb - va
  })
  return { sorted, sortBy, asc, toggle }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Reports() {
  const [filterAgentId, setFilterAgentId] = useState('')
  const [drillDown, setDrillDown] = useState<DrillDown | null>(null)

  const drill = (agentId: string, agentName: string, metric: MetricKey) =>
    setDrillDown({ agentId, agentName, metric })

  // Load all agents from unfiltered report to populate selector
  const { data: allData } = useQuery<ReportsData>({
    queryKey: ['reports', 'all'],
    queryFn: () => getReports(),
    staleTime: 60_000,
  })

  const { data, isLoading } = useQuery<ReportsData>({
    queryKey: ['reports', filterAgentId],
    queryFn: () => getReports(filterAgentId || undefined),
    staleTime: 60_000,
  })

  const { sorted: sortedAgents, sortBy, asc, toggle } = useSortedAgents(data?.agentPerformance ?? [])

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Generando reportes...</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  const agents = allData?.agentPerformance ?? []

  const { funnel, callsByDay, dispositionBreakdown, batchProgress } = data
  const maxDay = Math.max(...callsByDay.map((d) => d.count), 1)
  const totalDisp = dispositionBreakdown.reduce((s, d) => s + d.count, 0)
  const contactedPct = funnel.total > 0 ? Math.round((funnel.inProgress + funnel.interested + funnel.converted + funnel.notInterested + funnel.doNotCall) / funnel.total * 100) : 0
  const interestedPct = funnel.total > 0 ? Math.round((funnel.interested + funnel.converted) / funnel.total * 100) : 0

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortBy === k
      ? (asc ? <ChevronUp size={13} className="text-blue-600" /> : <ChevronDown size={13} className="text-blue-600" />)
      : <ChevronDown size={13} className="text-gray-300" />

  return (
    <div className="p-6 space-y-7 overflow-y-auto h-full">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes y Análisis</h1>
          <p className="text-gray-500 text-sm mt-1">Campaña de migración de operador — métricas de eficacia y efectividad</p>
        </div>

        {/* Agent filter */}
        <div className="flex items-center gap-2 shrink-0">
          <Filter size={15} className="text-gray-400" />
          <select
            className="input text-sm py-1.5 min-w-[200px]"
            value={filterAgentId}
            onChange={(e) => setFilterAgentId(e.target.value)}
          >
            <option value="">Todos los agentes</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          {filterAgentId && (
            <button
              onClick={() => setFilterAgentId('')}
              className="text-xs text-blue-600 hover:underline whitespace-nowrap"
            >
              Ver todos
            </button>
          )}
          {isLoading && filterAgentId && (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>

      {/* ── Funnel ── */}
      <section>
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Embudo de campaña</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="Total clientes" value={funnel.total} icon={Users} />
          <StatCard label="Asignados" value={funnel.assigned} icon={UserCheck2} color="text-blue-700" sub="contactos" />
          <StatCard label="Pendientes" value={funnel.pending} color="text-gray-600" />
          <StatCard label="En progreso" value={funnel.inProgress} color="text-blue-600" />
          <StatCard label="Interesados" value={funnel.interested} color="text-green-600" icon={Target} />
          <StatCard label="Convertidos" value={funnel.converted} color="text-emerald-700" icon={Award} />
          <StatCard label="No interesados" value={funnel.notInterested} color="text-red-500" />
        </div>
        {/* Funnel bar */}
        <div className="card p-4 mt-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Tasa de contacto</span><span className="font-bold text-blue-700">{contactedPct}%</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
            {[
              { pct: funnel.interested / funnel.total * 100, cls: 'bg-green-500' },
              { pct: funnel.converted / funnel.total * 100, cls: 'bg-emerald-600' },
              { pct: funnel.inProgress / funnel.total * 100, cls: 'bg-blue-400' },
              { pct: funnel.notInterested / funnel.total * 100, cls: 'bg-red-300' },
              { pct: funnel.doNotCall / funnel.total * 100, cls: 'bg-red-600' },
            ].map((s, i) => (
              <div key={i} className={`h-full ${s.cls} transition-all`} style={{ width: `${s.pct}%` }} />
            ))}
          </div>
          <div className="flex gap-4 flex-wrap text-xs text-gray-500">
            {[
              { cls: 'bg-green-500', label: 'Interesado' }, { cls: 'bg-emerald-600', label: 'Convertido' },
              { cls: 'bg-blue-400', label: 'En progreso' }, { cls: 'bg-red-300', label: 'No interesado' },
              { cls: 'bg-red-600', label: 'No llamar' }, { cls: 'bg-gray-200', label: 'Pendiente' },
            ].map((s) => (
              <span key={s.label} className="flex items-center gap-1">
                <span className={`w-2.5 h-2.5 rounded-sm ${s.cls}`} />{s.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Agent performance table ── */}
      <section>
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Rendimiento por agente</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Agente</th>
                {[
                  { k: 'assigned' as SortKey, l: 'Asignados' },
                  { k: 'calledClients' as SortKey, l: 'Contactados' },
                  { k: 'totalCalls' as SortKey, l: 'Llamadas' },
                  { k: 'contactRate' as SortKey, l: 'Tasa contacto' },
                  { k: 'conversionRate' as SortKey, l: 'Tasa conversión' },
                  { k: 'avgCallsPerClient' as SortKey, l: 'Llamadas/cliente' },
                  { k: 'interested' as SortKey, l: 'Interesados' },
                  { k: 'overdueCallbacks' as SortKey, l: 'Callbacks venc.' },
                ].map(({ k, l }) => (
                  <th key={k} className="px-3 py-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none" onClick={() => toggle(k)}>
                    <div className="flex items-center gap-1 justify-end"><span>{l}</span><SortIcon k={k} /></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedAgents.map((a, idx) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-xs shrink-0">
                        {a.name.charAt(0)}
                      </div>
                      <span className="font-medium text-gray-900 text-sm">{a.name}</span>
                      {idx === 0 && <Award size={13} className="text-amber-500" aria-label="Mejor conversión" />}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-gray-700">{a.assigned}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-gray-700">{a.calledClients}</span>
                      <Bar pct={a.assigned > 0 ? (a.calledClients / a.assigned) * 100 : 0} color="bg-blue-400" />
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-gray-700">{a.totalCalls}</td>
                  <td
                    className="px-3 py-3 text-right cursor-pointer hover:bg-blue-50 rounded transition-colors group"
                    onClick={() => drill(a.id, a.name, 'contactRate')}
                    title="Ver detalle de clientes contactados"
                  >
                    <span className={`text-sm font-semibold group-hover:underline ${a.contactRate >= 70 ? 'text-green-700' : a.contactRate >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                      {a.contactRate}%
                    </span>
                    <Bar pct={a.contactRate} color={a.contactRate >= 70 ? 'bg-green-500' : a.contactRate >= 40 ? 'bg-amber-400' : 'bg-red-400'} />
                  </td>
                  <td
                    className="px-3 py-3 text-right cursor-pointer hover:bg-blue-50 rounded transition-colors group"
                    onClick={() => drill(a.id, a.name, 'conversionRate')}
                    title="Ver clientes interesados/convertidos"
                  >
                    <span className={`text-sm font-semibold group-hover:underline ${a.conversionRate >= 20 ? 'text-green-700' : a.conversionRate >= 10 ? 'text-amber-600' : 'text-red-500'}`}>
                      {a.conversionRate}%
                    </span>
                    <Bar pct={a.conversionRate * 3} color={a.conversionRate >= 20 ? 'bg-green-500' : a.conversionRate >= 10 ? 'bg-amber-400' : 'bg-red-400'} />
                  </td>
                  <td
                    className="px-3 py-3 text-right cursor-pointer hover:bg-blue-50 rounded transition-colors group"
                    onClick={() => drill(a.id, a.name, 'avgCallsPerClient')}
                    title="Ver clientes por nº de llamadas"
                  >
                    <span className="text-gray-700 group-hover:underline">{a.avgCallsPerClient}</span>
                  </td>
                  <td
                    className="px-3 py-3 text-right cursor-pointer hover:bg-blue-50 rounded transition-colors group"
                    onClick={() => drill(a.id, a.name, 'interested')}
                    title="Ver clientes interesados"
                  >
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-green-700 font-semibold group-hover:underline">{a.interested}</span>
                      <Bar pct={a.assigned > 0 ? (a.interested / a.assigned) * 100 : 0} color="bg-green-500" />
                    </div>
                  </td>
                  <td
                    className="px-3 py-3 text-right cursor-pointer hover:bg-blue-50 rounded transition-colors"
                    onClick={() => drill(a.id, a.name, 'overdueCallbacks')}
                    title="Ver callbacks vencidos"
                  >
                    {a.overdueCallbacks > 0
                      ? <span className="text-red-600 font-semibold flex items-center justify-end gap-1 hover:underline"><AlertCircle size={13} />{a.overdueCallbacks}</span>
                      : <span className="text-gray-400">0</span>}
                  </td>
                </tr>
              ))}
              {sortedAgents.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">Sin datos de agentes</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Drill-down drawer ── */}
      {drillDown && <DrillDownDrawer drill={drillDown} onClose={() => setDrillDown(null)} />}

      {/* ── Calls per day + Disposition side by side ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Calls per day */}
        <section>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
            <span className="flex items-center gap-2"><TrendingUp size={14} />Llamadas últimos 30 días</span>
          </h2>
          <div className="card p-4">
            <div className="flex items-end gap-0.5 h-28">
              {callsByDay.slice(-14).map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group" title={`${d.date}: ${d.count} llamadas`}>
                  <span className="text-[9px] text-gray-400 opacity-0 group-hover:opacity-100 whitespace-nowrap">{d.count}</span>
                  <div
                    className="w-full bg-blue-500 rounded-t hover:bg-blue-400 transition-colors"
                    style={{ height: `${d.count > 0 ? Math.max((d.count / maxDay) * 80, 4) : 2}px` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-0.5">
              <span>{callsByDay[callsByDay.length - 14]?.date ? format(new Date(callsByDay[callsByDay.length - 14].date), 'd MMM', { locale: es }) : ''}</span>
              <span>Hoy</span>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-right">
              Total: <span className="font-semibold text-gray-700">{callsByDay.reduce((s, d) => s + d.count, 0)}</span> llamadas
            </p>
          </div>
        </section>

        {/* Disposition breakdown */}
        <section>
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
            <span className="flex items-center gap-2"><Phone size={14} />Resultado de llamadas</span>
          </h2>
          <div className="card p-4 space-y-2.5">
            {dispositionBreakdown
              .sort((a, b) => b.count - a.count)
              .map((d) => (
                <div key={d.disposition} className="space-y-0.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-700">{DISP_LABELS[d.disposition] ?? d.disposition}</span>
                    <span className="font-semibold text-gray-900">{d.count} <span className="text-gray-400 font-normal">({totalDisp > 0 ? Math.round(d.count / totalDisp * 100) : 0}%)</span></span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${DISP_COLORS[d.disposition] ?? 'bg-gray-400'}`}
                      style={{ width: `${totalDisp > 0 ? (d.count / totalDisp) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            {dispositionBreakdown.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Sin llamadas registradas</p>}
          </div>
        </section>
      </div>

      {/* ── Batch progress ── */}
      <section>
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">
          <span className="flex items-center gap-2"><Package size={14} />Progreso por lote de importación</span>
        </h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Archivo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">Total</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">Llamadas</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">Emp. contactadas</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600 border-l border-gray-200">Int. x contacto</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">Int. x empresa</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">Convertidos</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">No interesados</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[160px]">Progreso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batchProgress.map((b) => {
                const contactedPct = b.totalRecords > 0 ? (b.contacted / b.totalRecords) * 100 : 0
                const intPct = b.totalRecords > 0 ? ((b.interested + b.converted) / b.totalRecords) * 100 : 0
                return (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate" title={b.filename}>
                      {b.filename}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {format(new Date(b.createdAt), "d MMM yyyy", { locale: es })}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-700">{b.totalRecords}</td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-gray-700 font-medium">{b.callCount}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-blue-700 font-medium">{b.contacted}</span>
                      <span className="text-gray-400 text-xs ml-1">({Math.round(contactedPct)}%)</span>
                    </td>
                    <td className="px-3 py-3 text-right border-l border-gray-100">
                      <span className="text-green-600 font-medium">{b.interestedContactCount}</span>
                      <span className="text-gray-400 text-xs ml-1 block leading-none">llamadas</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-green-700 font-medium">{b.interested}</span>
                      <span className="text-gray-400 text-xs ml-1 block leading-none">empresas</span>
                    </td>
                    <td className="px-3 py-3 text-right text-emerald-700 font-medium">{b.converted}</td>
                    <td className="px-3 py-3 text-right text-red-500">{b.notInterested}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-gray-400">
                          <span>Contacto</span><span>{Math.round(contactedPct)}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden flex">
                          <div className="bg-green-500 h-full" style={{ width: `${intPct}%` }} />
                          <div className="bg-blue-400 h-full" style={{ width: `${Math.max(contactedPct - intPct, 0)}%` }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {batchProgress.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">Sin lotes importados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// small icon alias to avoid reserved word collision
const UserCheck2 = Users
