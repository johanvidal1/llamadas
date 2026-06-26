import { useState, Fragment, useEffect, useRef, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, keepPreviousData, useQueryClient } from '@tanstack/react-query'
import {
  getReports, getUsers, getClients, getCallbacks, getAssignmentRunCompanies, getUntrackedCompanies,
  getBatchReportBreakdown, getAgentReportRuns, getReportAgentCalls, getReportCallHeatmap, getReportFunnelByPeriod,
  type BatchAgentBreakdownRow,
  type ReportChartPeriod,
} from '../api/client'
import { format, isPast, isToday, addDays, addMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Users, Phone, CalendarClock, Target,
  Award, AlertCircle, ChevronUp, ChevronDown, Package, Filter, X, RefreshCw, ChevronRight,
  ChevronLeft, Calendar,
} from 'lucide-react'
import { StatusBadge, DispositionBadge } from '../components/StatusBadge'
import { StatusHelpPopover } from '../components/StatusHelpPopover'
import { AgentCallsBarChart } from '../components/AgentCallsBarChart'
import { FunnelDonutChart } from '../components/FunnelDonutChart'
import { CallHeatmapChart } from '../components/CallHeatmapChart'
import type { StatusHelpKey } from '../config/statusHelp'
import {
  DISPOSITION_BAR_COLORS,
  ZERO_PROGRESS_OPTIONS,
  getDispositionLabel,
  getResponseOption,
} from '../config/responseOptions'
import {
  AGENT_PIPELINE_FUNNEL,
  AGENT_PIPELINE_QUEUE,
  buildPipelineClientsUrl,
  sumFunnelStages,
  sumPipelineBarSegments,
} from '../config/companyPipeline'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentPerf {
  id: string; name: string
  assigned: number; assignedCompanies: number
  calledClients: number; totalCalls: number
  companiesWithResponse: number; companiesInFunnel: number
  interested: number; converted: number; notInterested: number
  interestedRecords: number; convertedRecords: number; notInterestedRecords: number; pendingRecords: number
  interestedCompanies: number; convertedCompanies: number; notInterestedCompanies: number; pendingCompanies: number
  ventaCerrada: number; closeRate: number
  contactRate: number; companyContactRate: number
  conversionRate: number; avgCallsPerClient: number
  pendingCallbacks: number; overdueCallbacks: number
  sparkline?: { date: string; calls: number }[]
  assignmentRuns?: AgentAssignmentRun[]
}
interface DispCount { disposition: string; count: number }
interface BatchAssignmentRun {
  id: string
  isLegacy?: boolean
  assignedAt: string | null
  companyCount: number
  assignedBy: { name: string }
  batchLabel?: string
  callCount: number
  contactedCompanies: number
  contactedPct: number
  inFunnel: number
  ventaCerrada: number
  pendingCompanies: number
  closeRate: number
}
type AgentAssignmentRun = BatchAssignmentRun
interface BatchProgress {
  id: string; filename: string; createdAt: string
  batchTotalCompanies: number
  assignedCompanies: number
  assignedToAgentCompanies: number | null
  unassignedCompanies: number
  callCount: number
  contactedCompanies: number; contactedPct: number
  inFunnel: number; ventaCerrada: number; pendingCompanies: number
  companyPipeline: Record<string, number>
  assignmentRuns?: BatchAssignmentRun[]
  agentBreakdown?: BatchAgentBreakdownRow[]
}
interface FunnelSlice {
  total: number; assigned: number; pending: number; inProgress: number
  interested: number; converted: number; notInterested: number; doNotCall: number
}
interface Funnel {
  companies: FunnelSlice
}
interface ReportsData {
  agentPerformance: AgentPerf[]
  dispositionBreakdown: DispCount[]
  batchProgress: BatchProgress[]
  funnel: Funnel
  assignedCompanies: number
  companyPipeline: Record<string, number>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Bar({ pct, color = 'bg-blue-500' }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  )
}

function AgentRunSubRowLabel({ run }: { run: AgentAssignmentRun }) {
  const label = run.batchLabel ?? 'Sin lote'
  const dateStr = run.assignedAt
    ? format(new Date(run.assignedAt), 'd MMM yyyy', { locale: es })
    : null

  if (run.isLegacy) {
    return (
      <span className="inline-flex items-center gap-0 min-w-0 flex-wrap">
        <span className="truncate max-w-[160px]" title={label}>{label}</span>
        <span className="text-gray-400 shrink-0"> · </span>
        <span>Asignación anterior (sin historial)</span>
        {dateStr && (
          <>
            <span className="text-gray-400 shrink-0"> · </span>
            <span>{dateStr}</span>
          </>
        )}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-0 min-w-0 flex-wrap">
      <span className="truncate max-w-[160px]" title={label}>{label}</span>
      {dateStr && (
        <>
          <span className="text-gray-400 shrink-0"> · </span>
          <span>{dateStr}</span>
        </>
      )}
    </span>
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
        <td colSpan={10} className="px-4 py-2 pl-14 text-xs text-gray-400">
          Cargando empresas...
        </td>
      </tr>
    )
  }

  const companies = data?.companies ?? []
  if (companies.length === 0) {
    return (
      <tr className="bg-gray-50/60">
        <td colSpan={10} className="px-4 py-2 pl-14 text-xs text-gray-400">
          Sin empresas en esta asignación
        </td>
      </tr>
    )
  }

  return (
    <tr className="bg-gray-50/60">
      <td colSpan={10} className="px-4 py-2 pl-14">
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

function StatCard({ label, value, sub, color = 'text-gray-900', icon: Icon, statusHelpKey, companyLevel, onClick }: {
  label: string; value: string | number; sub?: string; color?: string; icon?: React.ElementType
  statusHelpKey?: StatusHelpKey; companyLevel?: boolean; onClick?: () => void
}) {
  const content = (
    <>
      {Icon && <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center shrink-0"><Icon size={17} className="text-gray-600" /></div>}
      <div className="min-w-0">
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        <div className="text-xs text-gray-500 leading-tight inline-flex items-center gap-1 min-h-[2rem]">
          <span>{label}</span>
          {statusHelpKey && <StatusHelpPopover helpKey={statusHelpKey} companyLevel={companyLevel} />}
        </div>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </>
  )
  if (onClick) {
    return (
      <div
        role="link"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        }}
        className="card p-4 flex items-start gap-3 overflow-visible w-full text-left cursor-pointer hover:bg-gray-50 transition-colors"
      >
        {content}
      </div>
    )
  }
  return (
    <div className="card p-4 flex items-start gap-3 overflow-visible">
      {content}
    </div>
  )
}

// ─── Drill-down types ─────────────────────────────────────────────────────────

type MetricKey = 'contactRate' | 'avgCallsPerClient' | 'overdueCallbacks'

interface DrillDown { agentId: string; agentName: string; metric: MetricKey }

const METRIC_LABELS: Record<MetricKey, string> = {
  contactRate: 'Tasa de contacto (empresas)',
  avgCallsPerClient: 'Llamadas por registro',
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
    contacts: Array<{
      id: string
      nombre: string
      telefono?: string
      status: string
      _count?: { callLogs: number }
    }>
    _count: { callLogs: number; callbacks: number }
  }> = clientsData?.clients ?? []

  const allContacts = allClients.flatMap((company) =>
    company.contacts.map((contact) => ({
      id: contact.id,
      name: contact.nombre,
      phone: contact.telefono ?? '',
      status: contact.status,
      _count: { callLogs: contact._count?.callLogs ?? 0 },
    }))
  )

  const allCallbacks: Array<{
    id: string; scheduledAt: string; notes?: string
    client: { id: string; name: string; phone: string }
  }> = callbacksData ?? []

  let tabALabel = '', tabBLabel = ''
  let tabAList: typeof allContacts = []
  let tabBList: typeof allContacts = []
  let overdueList: typeof allCallbacks = []

  if (drill.metric === 'contactRate') {
    tabAList = allContacts.filter((c) => c._count.callLogs > 0)
    tabBList = allContacts.filter((c) => c._count.callLogs === 0)
    tabALabel = `Contactados (${tabAList.length})`
    tabBLabel = `Sin contactar (${tabBList.length})`
  } else if (drill.metric === 'avgCallsPerClient') {
    tabAList = [...allContacts].sort((a, b) => b._count.callLogs - a._count.callLogs)
    tabALabel = `Todos los registros (${tabAList.length})`
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
        <div className="flex items-center justify-between p-5 border-b bg-gray-50">
          <div>
            <p className="font-semibold text-gray-900">{drill.agentName}</p>
            <p className="text-xs text-blue-600 font-medium mt-0.5">{METRIC_LABELS[drill.metric]}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200 text-gray-500">
            <X size={18} />
          </button>
        </div>

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

        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center h-40 text-gray-400">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

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

          {!isCallbackMetric && !isLoading && (
            <div className="divide-y divide-gray-100">
              {activeList.length === 0
                ? <p className="text-center text-gray-400 py-12 text-sm">Sin registros en esta categoría</p>
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

function AgentExpandedRuns({ agentId, expanded }: { agentId: string; expanded: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ['agent-report-runs', agentId],
    queryFn: () => getAgentReportRuns(agentId),
    enabled: expanded,
    staleTime: 300_000,
  })

  if (isLoading) {
    return (
      <tr className="bg-gray-50/80">
        <td colSpan={11} className="px-4 py-2 pl-10 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Cargando asignaciones...
          </div>
        </td>
      </tr>
    )
  }

  const runs = data?.assignmentRuns ?? []
  if (runs.length === 0) {
    return (
      <tr className="bg-gray-50/80">
        <td colSpan={11} className="px-4 py-2 pl-10 text-xs text-gray-400">
          Sin asignaciones registradas
        </td>
      </tr>
    )
  }

  return (
    <>
      {runs.map((run) => (
        <tr key={run.id} className="bg-gray-50/80 text-xs">
          <td className="px-4 py-2 w-8" />
          <td className="px-4 py-2 pl-10 text-gray-600">
            <AgentRunSubRowLabel run={run} />
          </td>
          <td className="px-3 py-2 text-right font-medium text-gray-700">{run.companyCount}</td>
          <td className="px-3 py-2 text-right text-gray-700">{run.contactedCompanies}</td>
          <td className="px-3 py-2 text-right text-gray-500">{run.pendingCompanies}</td>
          <td className="px-3 py-2 text-right">
            <span className={`font-medium ${run.contactedPct >= 70 ? 'text-green-700' : run.contactedPct >= 40 ? 'text-amber-600' : 'text-gray-700'}`}>
              {run.contactedPct}%
            </span>
          </td>
          <td className="px-3 py-2 text-right text-green-700 font-medium">{run.inFunnel}</td>
          <td className="px-3 py-2 text-right text-gray-700">{run.callCount}</td>
          <td className="px-3 py-2 text-right text-emerald-700 font-medium">{run.ventaCerrada}</td>
          <td className="px-3 py-2 text-right">
            <span className={`font-medium ${run.closeRate >= 20 ? 'text-green-700' : run.closeRate >= 10 ? 'text-amber-600' : 'text-gray-600'}`}>
              {run.closeRate}%
            </span>
          </td>
          <td className="px-3 py-2 text-right text-gray-400">—</td>
        </tr>
      ))}
    </>
  )
}

function BatchExpandedRows({
  batch,
  filterAgentId,
  expandedRuns,
  expandedBatchAgents,
  toggleRunExpand,
  toggleBatchAgentExpand,
}: {
  batch: BatchProgress
  filterAgentId: string
  expandedRuns: Record<string, boolean>
  expandedBatchAgents: Record<string, Record<string, boolean>>
  toggleRunExpand: (runId: string, e: React.MouseEvent) => void
  toggleBatchAgentExpand: (batchId: string, agentId: string, e?: React.MouseEvent) => void
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['reports-batch-breakdown', batch.id, filterAgentId || null],
    queryFn: () => getBatchReportBreakdown(batch.id, filterAgentId || undefined),
    staleTime: 300_000,
  })

  if (isLoading) {
    return (
      <tr className="bg-gray-50/80">
        <td colSpan={9} className="px-4 py-3 pl-10">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Cargando desglose...
          </div>
        </td>
      </tr>
    )
  }

  if (isError || !data) {
    return (
      <tr className="bg-gray-50/80">
        <td colSpan={9} className="px-4 py-3 pl-10 text-xs text-red-500">
          No se pudo cargar el desglose
        </td>
      </tr>
    )
  }

  const runs = data.assignmentRuns ?? []
  const agentBreakdown = data.agentBreakdown ?? []

  if (filterAgentId) {
    return (
      <>
        {runs.map((run) => {
          const runExpanded = expandedRuns[run.id] ?? false
          return (
            <Fragment key={run.id}>
              <tr
                className="bg-gray-50/80 text-xs cursor-pointer hover:bg-gray-100/80"
                onClick={(e) => toggleRunExpand(run.id, e)}
              >
                <td className="px-4 py-2 text-gray-400 w-8">
                  <ChevronRight
                    size={12}
                    className={`transition-transform ${runExpanded ? 'rotate-90' : ''}`}
                  />
                </td>
                <td className="px-4 py-2 pl-10 text-gray-600">
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
                <td className="px-4 py-2" />
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
                  agentId={filterAgentId ?? undefined}
                  batchId={batch.id}
                />
              )}
            </Fragment>
          )
        })}
        {runs.length === 0 && (
          <tr className="bg-gray-50/80">
            <td colSpan={9} className="px-4 py-2 pl-10 text-xs text-gray-400">
              Sin asignaciones en este lote
            </td>
          </tr>
        )}
      </>
    )
  }

  return (
    <>
      {agentBreakdown.map((a) => {
        const agentExpanded = expandedBatchAgents[batch.id]?.[a.agentId] ?? false
        const agentRuns = a.assignmentRuns ?? []
        return (
          <Fragment key={`${batch.id}:${a.agentId}`}>
            <tr
              className="bg-gray-50/80 text-xs cursor-pointer hover:bg-gray-100/80"
              onClick={() => toggleBatchAgentExpand(batch.id, a.agentId)}
            >
              <td className="px-4 py-2 text-gray-400 w-8">
                <ChevronRight
                  size={12}
                  className={`transition-transform ${agentExpanded ? 'rotate-90' : ''}`}
                />
              </td>
              <td className="px-4 py-2 pl-10 text-gray-700">
                <span className="font-medium text-gray-900">{a.agentName}</span>
                <span className="text-gray-400"> · </span>
                <span className="text-gray-500">Asignadas: {a.assignedCompanies}</span>
              </td>
              <td className="px-4 py-2 text-gray-500">—</td>
              <td className="px-3 py-2 text-right">
                <span className="font-bold text-gray-700">{a.assignedCompanies}</span>
                <span className="text-gray-400 font-normal"> de </span>
                <span className="text-gray-500">{batch.batchTotalCompanies}</span>
              </td>
              <td className="px-3 py-2 text-right text-gray-700 font-medium">{a.callCount}</td>
              <td className="px-3 py-2 text-right">
                <span className="text-blue-700 font-medium">{a.contactedCompanies}</span>
                <span className="text-gray-400 ml-1">({a.contactedPct}%)</span>
              </td>
              <td className="px-3 py-2 text-right text-green-700 font-medium">{a.inFunnel}</td>
              <td className="px-3 py-2 text-right text-emerald-700 font-medium">{a.ventaCerrada}</td>
              <td className="px-4 py-2">
                <Bar
                  pct={a.contactedPct}
                  color={a.contactedPct >= 70 ? 'bg-green-500' : a.contactedPct >= 40 ? 'bg-amber-400' : 'bg-blue-400'}
                />
              </td>
            </tr>
            {agentExpanded && agentRuns.map((run) => (
              <tr key={`${batch.id}:${a.agentId}:${run.id}`} className="bg-gray-50/60 text-xs">
                <td className="px-4 py-2 w-8" />
                <td className="px-4 py-2 pl-14 text-gray-600">
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
                <td className="px-4 py-2" />
                <td className="px-3 py-2 text-right">
                  <span className="font-bold text-gray-700">{run.companyCount}</span>
                  <span className="text-gray-400 font-normal"> de </span>
                  <span className="text-gray-500">{a.assignedCompanies}</span>
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
            ))}
          </Fragment>
        )
      })}
      {agentBreakdown.length === 0 && (
        <tr className="bg-gray-50/80">
          <td colSpan={9} className="px-4 py-2 pl-10 text-xs text-gray-400">
            Sin agentes asignados en este lote
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Loading skeletons ────────────────────────────────────────────────────────

function ReportsPipelineSkeleton() {
  return (
    <section>
      <div className="card p-6 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-40 mb-2" />
        <div className="h-3 bg-gray-100 rounded w-64 mb-5" />
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,35%)_minmax(0,65%)] gap-6">
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded-lg" />
            ))}
          </div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 bg-gray-100 rounded w-full" />
                <div className="h-2 bg-gray-100 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function ReportsKpiSkeleton() {
  return (
    <section>
      <div className="h-4 bg-gray-200 rounded w-48 mb-3 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 animate-pulse">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="card p-4 h-24 bg-gray-100" />
        ))}
      </div>
      <div className="card p-4 mt-3 h-16 bg-gray-100 animate-pulse" />
    </section>
  )
}

function ReportsAgentTableSkeleton() {
  return (
    <section>
      <div className="h-4 bg-gray-200 rounded w-44 mb-3 animate-pulse" />
      <div className="card overflow-hidden animate-pulse">
        <div className="h-11 bg-gray-50 border-b border-gray-200" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-14 border-b border-gray-100 bg-gray-50/50" />
        ))}
      </div>
    </section>
  )
}

function ReportsBatchSkeleton() {
  return (
    <section>
      <div className="h-4 bg-gray-200 rounded w-36 mb-3 animate-pulse" />
      <div className="card overflow-hidden animate-pulse">
        <div className="h-11 bg-gray-50 border-b border-gray-200" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 border-b border-gray-100 bg-gray-50/50" />
        ))}
      </div>
    </section>
  )
}

// ─── Chart period filter ───────────────────────────────────────────────────────

type ChartFilterMode = 'day' | 'week' | 'month' | 'custom'

function chartTodayLocal(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function deriveChartRange(
  mode: ChartFilterMode,
  anchor: string,
  customFrom: string,
  customTo: string
): { from: string; to: string; period: ReportChartPeriod; date: string } {
  const anchorDate = new Date(anchor + 'T12:00:00')

  if (mode === 'custom') {
    const from = customFrom || chartTodayLocal()
    const to = customTo || from
    return { from, to, period: 'range', date: from }
  }

  if (mode === 'day') {
    return { from: anchor, to: anchor, period: 'day', date: anchor }
  }

  if (mode === 'week') {
    const from = format(startOfWeek(anchorDate, { locale: es }), 'yyyy-MM-dd')
    const to = format(endOfWeek(anchorDate, { locale: es }), 'yyyy-MM-dd')
    return { from, to, period: 'week', date: anchor }
  }

  const from = format(startOfMonth(anchorDate), 'yyyy-MM-dd')
  const to = format(endOfMonth(anchorDate), 'yyyy-MM-dd')
  return { from, to, period: 'month', date: anchor }
}

function formatChartPeriodLabel(mode: ChartFilterMode, from: string, to: string): string {
  const fmtFull = (d: string) => format(new Date(d + 'T12:00:00'), 'd MMM yyyy', { locale: es })
  const fmtShort = (d: string) => format(new Date(d + 'T12:00:00'), 'd MMM', { locale: es })

  if (mode === 'day') return fmtFull(from)
  if (mode === 'month') {
    return format(new Date(from + 'T12:00:00'), 'MMMM yyyy', { locale: es })
  }
  if (from === to) return fmtFull(from)
  if (from.slice(0, 4) === to.slice(0, 4)) {
    return `${fmtShort(from)} – ${fmtFull(to)}`
  }
  return `${fmtFull(from)} – ${fmtFull(to)}`
}

function shiftChartAnchor(mode: ChartFilterMode, anchor: string, delta: -1 | 1): string {
  const d = new Date(anchor + 'T12:00:00')
  if (mode === 'day') return format(addDays(d, delta), 'yyyy-MM-dd')
  if (mode === 'week') return format(addDays(d, delta * 7), 'yyyy-MM-dd')
  if (mode === 'month') return format(addMonths(d, delta), 'yyyy-MM-dd')
  return anchor
}

function ReportChartPeriodFilter({
  mode,
  anchor,
  customFrom,
  customTo,
  periodLabel,
  onModeChange,
  onAnchorChange,
  onCustomApply,
}: {
  mode: ChartFilterMode
  anchor: string
  customFrom: string
  customTo: string
  periodLabel: string
  onModeChange: (mode: ChartFilterMode) => void
  onAnchorChange: (anchor: string) => void
  onCustomApply: (from: string, to: string) => void
}) {
  const [customOpen, setCustomOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState(customFrom)
  const [draftTo, setDraftTo] = useState(customTo)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!customOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setCustomOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [customOpen])

  useEffect(() => {
    if (customOpen) {
      setDraftFrom(customFrom)
      setDraftTo(customTo)
    }
  }, [customOpen, customFrom, customTo])

  const handleModeClick = (next: ChartFilterMode) => {
    if (next === 'custom') {
      onModeChange('custom')
      setCustomOpen(true)
      return
    }
    setCustomOpen(false)
    onModeChange(next)
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-0.5 bg-white">
          {([
            ['day', 'Día'],
            ['week', 'Semana'],
            ['month', 'Mes'],
            ['custom', 'Personalizado'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => handleModeClick(value)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                mode === value
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode !== 'custom' ? (
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-1 py-0.5">
            <button
              type="button"
              onClick={() => onAnchorChange(shiftChartAnchor(mode, anchor, -1))}
              className="p-1 rounded-md text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
              aria-label="Periodo anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => onAnchorChange(chartTodayLocal())}
              className="px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => onAnchorChange(shiftChartAnchor(mode, anchor, 1))}
              className="p-1 rounded-md text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
              aria-label="Periodo siguiente"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <div ref={rootRef} className="relative">
            <button
              type="button"
              onClick={() => setCustomOpen((v) => !v)}
              aria-expanded={customOpen}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                customOpen
                  ? 'border-blue-300 bg-blue-50 text-blue-800'
                  : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Calendar size={14} />
              Elegir rango
              <ChevronDown size={14} className={`transition-transform ${customOpen ? 'rotate-180' : ''}`} />
            </button>
            {customOpen && (
              <div className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                <p className="text-xs font-medium text-gray-500 mb-3">Rango personalizado</p>
                <label className="block space-y-1 mb-3">
                  <span className="text-xs text-gray-500">Desde</span>
                  <input
                    type="date"
                    value={draftFrom}
                    onChange={(e) => setDraftFrom(e.target.value)}
                    className="input w-full py-1.5 text-sm"
                  />
                </label>
                <label className="block space-y-1 mb-3">
                  <span className="text-xs text-gray-500">Hasta</span>
                  <input
                    type="date"
                    value={draftTo}
                    onChange={(e) => setDraftTo(e.target.value)}
                    className="input w-full py-1.5 text-sm"
                  />
                </label>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomOpen(false)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded-md"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!draftFrom && !draftTo}
                    onClick={() => {
                      if (!draftFrom && !draftTo) return
                      const from = draftFrom || draftTo
                      const to = draftTo || draftFrom
                      onCustomApply(from, to)
                      setCustomOpen(false)
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-xs font-medium text-gray-600">
        <Calendar size={12} className="text-gray-400" />
        {periodLabel}
      </span>
    </div>
  )
}

// ─── Sort hook ─────────────────────────────────────────────────────────────────

type AgentSortKey = 'assignedCompanies' | 'companiesWithResponse' | 'companyContactRate' | 'companiesInFunnel' | 'pendingCompanies' | 'totalCalls' | 'ventaCerrada' | 'closeRate' | 'overdueCallbacks'
function useSortedAgents(agents: AgentPerf[]) {
  const [sortBy, setSortBy] = useState<AgentSortKey>('closeRate')
  const [asc, setAsc] = useState(false)
  const toggle = (key: AgentSortKey) => {
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
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [filterAgentId, setFilterAgentId] = useState('')
  const [drillDown, setDrillDown] = useState<DrillDown | null>(null)
  const [showStatusDetail, setShowStatusDetail] = useState(false)
  const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean>>({})
  const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({})
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({})
  const [expandedBatchAgents, setExpandedBatchAgents] = useState<Record<string, Record<string, boolean>>>({})
  const [chartMode, setChartMode] = useState<ChartFilterMode>('day')
  const [chartAnchor, setChartAnchor] = useState(chartTodayLocal)
  const [chartCustomFrom, setChartCustomFrom] = useState(chartTodayLocal)
  const [chartCustomTo, setChartCustomTo] = useState(chartTodayLocal)

  const chartRange = useMemo(
    () => deriveChartRange(chartMode, chartAnchor, chartCustomFrom, chartCustomTo),
    [chartMode, chartAnchor, chartCustomFrom, chartCustomTo]
  )

  const chartPeriodLabel = useMemo(
    () => formatChartPeriodLabel(chartMode, chartRange.from, chartRange.to),
    [chartMode, chartRange.from, chartRange.to]
  )

  const toggleBatchExpand = (batchId: string) => {
    setExpandedBatches((prev) => ({ ...prev, [batchId]: !prev[batchId] }))
  }

  const toggleBatchAgentExpand = (batchId: string, agentId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setExpandedBatchAgents((prev) => ({
      ...prev,
      [batchId]: { ...(prev[batchId] ?? {}), [agentId]: !(prev[batchId]?.[agentId] ?? false) },
    }))
  }

  const toggleAgentExpand = (agentId: string) => {
    setExpandedAgents((prev) => ({ ...prev, [agentId]: !prev[agentId] }))
  }

  const toggleRunExpand = (runId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedRuns((prev) => ({ ...prev, [runId]: !prev[runId] }))
  }

  const goToClientsFilter = (filter: string) => {
    navigate(buildPipelineClientsUrl(filter, {
      agentId: filterAgentId || undefined,
      from: 'reports',
    }))
  }

  const drill = (agentId: string, agentName: string, metric: MetricKey) =>
    setDrillDown({ agentId, agentName, metric })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
    staleTime: 300_000,
  })

  const agents = users.filter((u) => u.role === 'AGENT' && u.active)

  const filterKey = filterAgentId || 'all'

  const {
    data: summaryData,
    isLoading: summaryLoading,
    isFetching: summaryFetching,
  } = useQuery({
    queryKey: ['reports-summary', filterKey],
    queryFn: () => getReports(filterAgentId || undefined, { sections: ['summary'] }),
    staleTime: 300_000,
    placeholderData: keepPreviousData,
  })

  const {
    data: agentsData,
    isLoading: agentsLoading,
    isFetching: agentsFetching,
  } = useQuery({
    queryKey: ['reports-agents', filterKey],
    queryFn: () => getReports(filterAgentId || undefined, { sections: ['agents'] }),
    staleTime: 300_000,
    placeholderData: keepPreviousData,
  })

  const {
    data: batchesData,
    isLoading: batchesLoading,
    isFetching: batchesFetching,
  } = useQuery({
    queryKey: ['reports-batches', filterKey],
    queryFn: () => getReports(filterAgentId || undefined, { sections: ['batches'] }),
    staleTime: 300_000,
    placeholderData: keepPreviousData,
  })

  const {
    data: agentCallsData,
    isLoading: agentCallsLoading,
    isFetching: agentCallsFetching,
  } = useQuery({
    queryKey: ['reports-agent-calls', chartRange.period, chartRange.date, chartRange.from, chartRange.to],
    queryFn: () =>
      getReportAgentCalls({
        period: chartRange.period,
        date: chartRange.period === 'range' ? undefined : chartRange.date,
        from: chartRange.period === 'range' ? chartRange.from : undefined,
        to: chartRange.period === 'range' ? chartRange.to : undefined,
      }),
    staleTime: 120_000,
    placeholderData: keepPreviousData,
  })

  const {
    data: funnelPeriodData,
    isLoading: funnelPeriodLoading,
    isFetching: funnelPeriodFetching,
  } = useQuery({
    queryKey: ['reports-funnel-by-period', filterKey, chartRange.from, chartRange.to],
    queryFn: () =>
      getReportFunnelByPeriod({
        from: chartRange.from,
        to: chartRange.to,
        agentId: filterAgentId || undefined,
      }),
    staleTime: 120_000,
    placeholderData: keepPreviousData,
  })

  const {
    data: heatmapData,
    isLoading: heatmapLoading,
    isFetching: heatmapFetching,
  } = useQuery({
    queryKey: ['reports-call-heatmap', filterKey, chartRange.from, chartRange.to],
    queryFn: () =>
      getReportCallHeatmap({
        from: chartRange.from,
        to: chartRange.to,
        agentId: filterAgentId || undefined,
      }),
    staleTime: 120_000,
    placeholderData: keepPreviousData,
  })

  const isFetching = summaryFetching || agentsFetching || batchesFetching || agentCallsFetching || funnelPeriodFetching || heatmapFetching
  const hasAnyData = !!(summaryData || agentsData || batchesData)

  const handleRefresh = () => {
    const refreshOpts = { refresh: true as const }
    void queryClient.fetchQuery({
      queryKey: ['reports-summary', filterKey],
      queryFn: () => getReports(filterAgentId || undefined, { ...refreshOpts, sections: ['summary'] }),
    })
    void queryClient.fetchQuery({
      queryKey: ['reports-agents', filterKey],
      queryFn: () => getReports(filterAgentId || undefined, { ...refreshOpts, sections: ['agents'] }),
    })
    void queryClient.fetchQuery({
      queryKey: ['reports-batches', filterKey],
      queryFn: () => getReports(filterAgentId || undefined, { ...refreshOpts, sections: ['batches'] }),
    })
    void queryClient.invalidateQueries({ queryKey: ['agent-report-runs'] })
    void queryClient.invalidateQueries({ queryKey: ['reports-agent-calls'] })
    void queryClient.invalidateQueries({ queryKey: ['reports-funnel-by-period'] })
    void queryClient.invalidateQueries({ queryKey: ['reports-call-heatmap'] })
  }

  const { sorted: sortedAgents, sortBy, asc, toggle } = useSortedAgents(agentsData?.agentPerformance ?? [])

  const funnel = summaryData?.funnel
  const dispositionBreakdown = summaryData?.dispositionBreakdown ?? []
  const batchProgress = batchesData?.batchProgress ?? []
  const companyPipeline = summaryData?.companyPipeline
  const assignedCompanies = summaryData?.assignedCompanies
  const companies = funnel?.companies
  const totalDisp = dispositionBreakdown.reduce((s, d) => s + d.count, 0)
  const pipelineTotal = assignedCompanies ?? 0
  const pipelinePending = companyPipeline?.PENDING ?? 0
  const pipelineWithResponse = pipelineTotal - pipelinePending
  const zeroProgressBreakdown = summaryData ? [
    ...ZERO_PROGRESS_OPTIONS.map((opt) => ({
      disposition: opt.code,
      label: opt.label,
      count: dispositionBreakdown.find((d) => d.disposition === opt.code)?.count ?? 0,
    })),
    ...dispositionBreakdown
      .filter((d) => !getResponseOption(d.disposition) && !ZERO_PROGRESS_OPTIONS.some((z) => z.code === d.disposition))
      .map((d) => ({
        disposition: d.disposition,
        label: getDispositionLabel(d.disposition),
        count: d.count,
      })),
  ].filter((d) => d.count > 0) : []
  const funnelCompanies = sumFunnelStages(companyPipeline ?? {})
  const otrosCompanies = companyPipeline?.OTROS ?? 0
  const ventaCerrada = companyPipeline?.VENTA_CERRADA ?? 0
  const volverALlamar = companyPipeline?.VOLVER_A_LLAMAR ?? 0
  const companyContactPct = pipelineTotal > 0
    ? Math.round((pipelineWithResponse / pipelineTotal) * 100)
    : 0
  const pipelineBarSegments = sumPipelineBarSegments(companyPipeline ?? {}, pipelineTotal)
  const pipelineBarColor = (key: string) =>
    key === 'PENDING' ? 'bg-gray-300'
      : key === 'OTROS' ? 'bg-slate-400'
        : (DISPOSITION_BAR_COLORS[key] ?? 'bg-gray-400')

  const SortIcon = ({ k }: { k: AgentSortKey }) =>
    sortBy === k
      ? (asc ? <ChevronUp size={13} className="text-blue-600" /> : <ChevronDown size={13} className="text-blue-600" />)
      : <ChevronDown size={13} className="text-gray-300" />

  const filteredAgentName = agents.find((a) => a.id === filterAgentId)?.name

  const isUpdating = isFetching && hasAnyData

  return (
    <div className="p-4 md:p-6 space-y-7">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes y Análisis</h1>
          <p className="text-gray-500 text-sm mt-1">Campaña de migración de operador — métricas de eficacia y efectividad</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Filter size={15} className="text-gray-400" />
          <select
            className="input text-sm py-1.5 min-w-[200px]"
            value={filterAgentId}
            onChange={(e) => {
              setFilterAgentId(e.target.value)
              setExpandedBatches({})
              setExpandedBatchAgents({})
              setExpandedRuns({})
            }}
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
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isFetching}
            title="Actualizar datos"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
            Actualizar
          </button>
          {isUpdating && (
            <span className="text-xs text-gray-400 animate-pulse whitespace-nowrap">Actualizando...</span>
          )}
        </div>
      </div>

      {summaryLoading && !summaryData ? (
        <>
          <ReportsPipelineSkeleton />
          <ReportsKpiSkeleton />
        </>
      ) : summaryData ? (
      <>
      {/* ── Company pipeline (primary) ── */}
      <section>
        <div className="card p-6 overflow-visible">
          <h2 className="font-semibold text-gray-900 mb-1">Por empresa (RUC)</h2>
          <p className="text-xs text-gray-500 mb-5">
            {companyPipeline ? (
              <>
                <span className="font-medium text-gray-700">{pipelineTotal} empresas</span>
                <span className="text-gray-300 mx-1.5">·</span>
                <span>{pipelinePending} pendientes</span>
                <span className="text-gray-300 mx-1.5">·</span>
                <span>{pipelineWithResponse} con respuesta</span>
                {filterAgentId && (
                  <span className="text-gray-400 ml-1.5">
                    — {filteredAgentName ?? 'agente filtrado'}
                  </span>
                )}
              </>
            ) : (
              'Última respuesta registrada por empresa'
            )}
          </p>

          {companyPipeline ? (
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,35%)_minmax(0,65%)] gap-6 md:gap-0">
              <div className="md:pr-6 md:border-r md:border-gray-200">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                  Cola de trabajo
                </h3>
                <div className="space-y-2">
                  {AGENT_PIPELINE_QUEUE.map((row) => {
                    const count = companyPipeline[row.key] ?? 0
                    return (
                      <button
                        key={row.key}
                        type="button"
                        onClick={() => goToClientsFilter(row.key)}
                        title={`Ver ${row.label.toLowerCase()} en Clientes`}
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
                    const count = companyPipeline[row.key] ?? 0
                    return (
                      <button
                        key={row.key}
                        type="button"
                        onClick={() => goToClientsFilter(row.key)}
                        title={`Ver ${row.fullLabel.toLowerCase()} en Clientes`}
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
                              width: `${pipelineTotal > 0 ? (count / pipelineTotal) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </button>
                    )
                  })}
                  {AGENT_PIPELINE_FUNNEL.every((row) => (companyPipeline[row.key] ?? 0) === 0) && (
                    <p className="text-sm text-gray-400 text-center py-4">Sin avance comercial registrado</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">Sin datos todavía</p>
          )}
        </div>
      </section>

      {/* ── Company KPI row ── */}
      <section>
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Resumen por empresa (RUC)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 overflow-visible">
          <StatCard label="Total empresas" value={pipelineTotal} icon={Users} sub="empresas" />
          <StatCard label="Pendientes" value={pipelinePending} color="text-gray-600" sub="empresas" statusHelpKey="PENDING" companyLevel onClick={() => goToClientsFilter('PENDING')} />
          <StatCard label="Volver a llamar" value={volverALlamar} color="text-blue-600" sub="empresas" onClick={() => goToClientsFilter('VOLVER_A_LLAMAR')} />
          <StatCard label="En embudo comercial" value={funnelCompanies} color="text-green-600" icon={Target} sub="empresas" onClick={() => goToClientsFilter('FUNNEL')} />
          <StatCard label="Venta cerrada" value={ventaCerrada} color="text-emerald-700" icon={Award} sub="empresas" onClick={() => goToClientsFilter('VENTA_CERRADA')} />
          <StatCard label="Otros" value={otrosCompanies} color="text-slate-600" sub="empresas" onClick={() => goToClientsFilter('OTROS')} />
        </div>
        <div className="card p-4 mt-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Tasa de contacto (empresas)</span>
            <span className="font-bold text-blue-700">{companyContactPct}%</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
            {pipelineBarSegments.map((s) => (
              <div
                key={s.key}
                className={`h-full transition-all ${pipelineBarColor(s.key)}`}
                style={{ width: `${s.pct}%` }}
                title={`${s.key}: ${Math.round(s.pct)}%`}
              />
            ))}
          </div>
          <p className="text-[10px] text-gray-400">
            {pipelineWithResponse} de {pipelineTotal} empresas con al menos una respuesta registrada
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowStatusDetail((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-bold text-gray-400 uppercase tracking-wider mt-5 mb-3 hover:text-gray-600 transition-colors"
        >
          <ChevronRight
            size={14}
            className={`transition-transform ${showStatusDetail ? 'rotate-90' : ''}`}
          />
          Detalle y otras respuestas
        </button>
        {showStatusDetail && (
          <div className="space-y-5">
            <div>
              <h3 className="text-xs font-semibold text-gray-600 mb-2">
                Otros ({otrosCompanies} empresas)
              </h3>
              <div className="card p-4 space-y-2.5">
                {zeroProgressBreakdown.length > 0 ? (
                  zeroProgressBreakdown
                    .sort((a, b) => b.count - a.count)
                    .map((d) => (
                      <div key={d.disposition} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-700">{d.label}</span>
                          <span className="font-semibold text-gray-900">
                            {d.count}{' '}
                            <span className="text-gray-400 font-normal">
                              ({totalDisp > 0 ? Math.round(d.count / totalDisp * 100) : 0}%)
                            </span>
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${DISPOSITION_BAR_COLORS[d.disposition] ?? 'bg-gray-400'}`}
                            style={{ width: `${totalDisp > 0 ? (d.count / totalDisp) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    ))
                ) : (
                  <p className="text-sm text-gray-400 text-center py-2">Sin desglose de respuestas 0%</p>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-3">Estado legacy por RUC (derivado de contactos)</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 overflow-visible">
                <StatCard label="En progreso" value={companies!.inProgress} color="text-blue-500" sub="empresas" statusHelpKey="IN_PROGRESS" companyLevel />
                <StatCard label="Interesados" value={companies!.interested} color="text-green-600" sub="empresas" statusHelpKey="INTERESTED" companyLevel />
                <StatCard label="Convertidos" value={companies!.converted} color="text-emerald-600" sub="empresas" statusHelpKey="CONVERTED" companyLevel />
                <StatCard label="No interesados" value={companies!.notInterested} color="text-red-500" sub="empresas" statusHelpKey="NOT_INTERESTED" companyLevel />
                <StatCard label="No llamar" value={companies!.doNotCall} color="text-red-700" sub="empresas" />
              </div>
            </div>
          </div>
        )}
      </section>
      </>
      ) : null}

      {/* ── Análisis visual ── */}
      <section>
        <div className="card p-5 md:p-6 space-y-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">
              Análisis visual
            </h2>
            <ReportChartPeriodFilter
              mode={chartMode}
              anchor={chartAnchor}
              customFrom={chartCustomFrom}
              customTo={chartCustomTo}
              periodLabel={chartPeriodLabel}
              onModeChange={(mode) => {
                if (mode === 'custom') {
                  const current = deriveChartRange(
                    chartMode === 'custom' ? 'day' : chartMode,
                    chartAnchor,
                    chartCustomFrom,
                    chartCustomTo
                  )
                  setChartCustomFrom(current.from)
                  setChartCustomTo(current.to)
                }
                setChartMode(mode)
              }}
              onAnchorChange={setChartAnchor}
              onCustomApply={(from, to) => {
                setChartCustomFrom(from)
                setChartCustomTo(to)
                setChartMode('custom')
              }}
            />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Llamadas por agente</h3>
            <p className="text-xs text-gray-500 mb-3">
              Llamadas totales y empresas registradas · {chartPeriodLabel}
            </p>
            <AgentCallsBarChart
              data={agentCallsData?.agents ?? []}
              loading={agentCallsLoading && !agentCallsData}
              highlightedAgentId={filterAgentId || undefined}
              periodLabel={chartPeriodLabel}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-5 pt-2 border-t border-gray-100">
            <div className="lg:pr-5 lg:border-r lg:border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Embudo comercial</h3>
              <p className="text-xs text-gray-500 mb-3">
                Llamadas por etapa · {chartPeriodLabel}
                {filterAgentId && (
                  <span className="text-gray-400"> — {filteredAgentName ?? 'agente filtrado'}</span>
                )}
              </p>
              <FunnelDonutChart
                pipeline={funnelPeriodData?.stages ?? {}}
                loading={funnelPeriodLoading && !funnelPeriodData}
                onStageClick={goToClientsFilter}
              />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Actividad por día y hora</h3>
              <p className="text-xs text-gray-500 mb-3">
                Intensidad de llamadas en horario laboral
                {filterAgentId && (
                  <span className="text-gray-400"> — {filteredAgentName ?? 'agente filtrado'}</span>
                )}
              </p>
              <CallHeatmapChart
                cells={heatmapData?.cells ?? []}
                periodLabel={chartPeriodLabel}
                loading={heatmapLoading && !heatmapData}
              />
            </div>
          </div>
        </div>
      </section>

      {agentsLoading && !agentsData ? (
        <ReportsAgentTableSkeleton />
      ) : agentsData ? (
      <>
      {/* ── Agent performance table ── */}
      <section>
        <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Rendimiento por agente</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-8" />
                <th className="text-left px-4 py-3 font-medium text-gray-600">Agente</th>
                {[
                  { k: 'assignedCompanies' as AgentSortKey, l: 'Asignado' },
                  { k: 'companiesWithResponse' as AgentSortKey, l: 'Registrados' },
                  { k: 'pendingCompanies' as AgentSortKey, l: 'Pendiente' },
                  { k: 'companyContactRate' as AgentSortKey, l: 'Tasa contacto' },
                  { k: 'companiesInFunnel' as AgentSortKey, l: 'En embudo' },
                  { k: 'totalCalls' as AgentSortKey, l: 'Llamadas' },
                  { k: 'ventaCerrada' as AgentSortKey, l: 'Ventas' },
                  { k: 'closeRate' as AgentSortKey, l: '% cierre' },
                  { k: 'overdueCallbacks' as AgentSortKey, l: 'Callbacks venc.' },
                ].map(({ k, l }) => (
                  <th key={k} className="px-3 py-3 font-medium text-gray-600 cursor-pointer hover:bg-gray-100 select-none" onClick={() => toggle(k)}>
                    <div className="flex items-center gap-1 justify-end"><span>{l}</span><SortIcon k={k} /></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedAgents.map((a, idx) => {
                const isExpandable = a.assignedCompanies > 0
                const isExpanded = expandedAgents[a.id] ?? false

                return (
                  <Fragment key={a.id}>
                    <tr
                      className={`hover:bg-gray-50 ${isExpandable ? 'cursor-pointer' : ''}`}
                      onClick={isExpandable ? () => toggleAgentExpand(a.id) : undefined}
                    >
                      <td className="px-4 py-3 text-gray-400 w-8">
                        {isExpandable && (
                          <ChevronRight
                            size={14}
                            className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-xs shrink-0">
                            {a.name.charAt(0)}
                          </div>
                          <span className="font-medium text-gray-900 text-sm">{a.name}</span>
                          {idx === 0 && sortBy === 'closeRate' && (
                            <Award size={13} className="text-amber-500" aria-label="Mejor % cierre" />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className="text-gray-900 font-medium">{a.assignedCompanies}</span>
                      </td>
                      <td className="px-3 py-3 text-right text-gray-700">{a.companiesWithResponse}</td>
                      <td className="px-3 py-3 text-right text-gray-500">{a.pendingCompanies}</td>
                      <td
                        className="px-3 py-3 text-right cursor-pointer hover:bg-blue-50 rounded transition-colors group"
                        onClick={(e) => { e.stopPropagation(); drill(a.id, a.name, 'contactRate') }}
                        title="Ver detalle de empresas contactadas"
                      >
                        <span className={`text-sm font-semibold group-hover:underline ${a.companyContactRate >= 70 ? 'text-green-700' : a.companyContactRate >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                          {a.companyContactRate}%
                        </span>
                        <Bar pct={a.companyContactRate} color={a.companyContactRate >= 70 ? 'bg-green-500' : a.companyContactRate >= 40 ? 'bg-amber-400' : 'bg-red-400'} />
                      </td>
                      <td className="px-3 py-3 text-right text-green-700 font-medium">{a.companiesInFunnel}</td>
                      <td className="px-3 py-3 text-right text-gray-700">{a.totalCalls}</td>
                      <td
                        className="px-3 py-3 text-right cursor-pointer hover:bg-emerald-50 rounded transition-colors group"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(buildPipelineClientsUrl('VENTA_CERRADA', { agentId: a.id, from: 'reports' }))
                        }}
                        title="Ver empresas con venta cerrada"
                      >
                        <span className="text-emerald-700 font-semibold group-hover:underline">{a.ventaCerrada}</span>
                      </td>
                      <td
                        className="px-3 py-3 text-right cursor-pointer hover:bg-emerald-50 rounded transition-colors group"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(buildPipelineClientsUrl('VENTA_CERRADA', { agentId: a.id, from: 'reports' }))
                        }}
                        title="Ver empresas con venta cerrada"
                      >
                        <span className={`text-sm font-semibold group-hover:underline ${a.closeRate >= 20 ? 'text-green-700' : a.closeRate >= 10 ? 'text-amber-600' : 'text-red-500'}`}>
                          {a.closeRate}%
                        </span>
                        <Bar pct={a.closeRate * 3} color={a.closeRate >= 20 ? 'bg-green-500' : a.closeRate >= 10 ? 'bg-amber-400' : 'bg-red-400'} />
                      </td>
                      <td
                        className="px-3 py-3 text-right cursor-pointer hover:bg-blue-50 rounded transition-colors"
                        onClick={(e) => { e.stopPropagation(); drill(a.id, a.name, 'overdueCallbacks') }}
                        title="Ver callbacks vencidos"
                      >
                        {a.overdueCallbacks > 0
                          ? <span className="text-red-600 font-semibold flex items-center justify-end gap-1 hover:underline"><AlertCircle size={13} />{a.overdueCallbacks}</span>
                          : <span className="text-gray-400">0</span>}
                      </td>
                    </tr>
                    {isExpanded && (
                      <AgentExpandedRuns agentId={a.id} expanded={isExpanded} />
                    )}
                  </Fragment>
                )
              })}
              {sortedAgents.length === 0 && (
                <tr><td colSpan={11} className="px-4 py-8 text-center text-gray-400 text-sm">Sin datos de agentes</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {drillDown && <DrillDownDrawer drill={drillDown} onClose={() => setDrillDown(null)} />}
      </>
      ) : null}

      {batchesLoading && !batchesData ? (
        <ReportsBatchSkeleton />
      ) : batchesData ? (
      <>
      {/* ── Batch progress ── */}
      <section>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">
            <span className="flex items-center gap-2 flex-wrap">
              <Package size={14} />
              Lotes y actividad
              {filterAgentId && (
                <span className="font-normal normal-case text-gray-500">
                  — {filteredAgentName ?? 'agente filtrado'}
                </span>
              )}
            </span>
          </h2>
          <Link
            to={filterAgentId ? `/reports/lotes?agentId=${filterAgentId}` : '/reports/lotes'}
            title="Ver lotes y actividad"
            className="text-gray-400 hover:text-blue-600 transition-colors p-1"
          >
            <ChevronRight size={18} />
          </Link>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-8" />
                <th className="text-left px-4 py-3 font-medium text-gray-600">Archivo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">Asignadas / Total</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">Llamadas</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">Contactadas</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">En embudo</th>
                <th className="text-right px-3 py-3 font-medium text-gray-600">Venta cerrada</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[160px]">Progreso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {batchProgress.map((b) => {
                const assigned = filterAgentId
                  ? (b.assignedToAgentCompanies ?? 0)
                  : b.assignedCompanies
                const isExpandable = filterAgentId
                  ? assigned > 0
                  : b.assignedCompanies > 0
                const isExpanded = expandedBatches[b.id] ?? false

                return (
                  <Fragment key={b.id}>
                    <tr
                      className={`hover:bg-gray-50 ${isExpandable ? 'cursor-pointer' : ''}`}
                      onClick={isExpandable ? () => toggleBatchExpand(b.id) : undefined}
                    >
                      <td className="px-4 py-3 text-gray-400 w-8">
                        {isExpandable && (
                          <ChevronRight
                            size={14}
                            className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate" title={b.filename}>
                        {b.filename}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {format(new Date(b.createdAt), 'd MMM yyyy', { locale: es })}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className="font-bold text-gray-900">{assigned}</span>
                        <span className="text-gray-400 font-normal"> de </span>
                        <span className="text-gray-500">{b.batchTotalCompanies}</span>
                        {!filterAgentId && b.unassignedCompanies > 0 && (
                          <span className="text-gray-400 text-xs block leading-tight mt-0.5">
                            {b.unassignedCompanies} sin asignar
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className="text-gray-700 font-medium">{b.callCount}</span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span className="text-blue-700 font-medium">{b.contactedCompanies}</span>
                        <span className="text-gray-400 text-xs ml-1">({b.contactedPct}%)</span>
                      </td>
                      <td className="px-3 py-3 text-right text-green-700 font-medium">{b.inFunnel}</td>
                      <td className="px-3 py-3 text-right text-emerald-700 font-medium">{b.ventaCerrada}</td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-gray-400">
                            <span>Empresas</span><span>{b.contactedPct}%</span>
                          </div>
                          <Bar pct={b.contactedPct} color={b.contactedPct >= 70 ? 'bg-green-500' : b.contactedPct >= 40 ? 'bg-amber-400' : 'bg-blue-400'} />
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <BatchExpandedRows
                        batch={b}
                        filterAgentId={filterAgentId}
                        expandedRuns={expandedRuns}
                        expandedBatchAgents={expandedBatchAgents}
                        toggleRunExpand={toggleRunExpand}
                        toggleBatchAgentExpand={toggleBatchAgentExpand}
                      />
                    )}
                  </Fragment>
                )
              })}
              {batchProgress.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">Sin lotes importados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      </>
      ) : null}
    </div>
  )
}
