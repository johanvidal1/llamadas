import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCallbacks, getUsers, updateCallback } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { ArrowLeft, CalendarClock, CheckCircle2, ChevronDown, ChevronUp, Phone } from 'lucide-react'
import { format, isToday, isPast, endOfToday, isAfter } from 'date-fns'
import { es } from 'date-fns/locale'
import CompleteCallbackModal, { type CompleteConfirm } from '../components/CompleteCallbackModal'
import ClientRecordModal from '../components/ClientRecordModal'
import { CallbackScheduleBadge } from '../components/CallbackScheduleBadge'

interface Callback {
  id: string
  scheduledAt: string
  notes?: string
  completed: boolean
  completedAt?: string
  company: {
    id: string
    ruc: string
    razonSocial?: string
    status: string
    contacts: { nombre: string; tipoContacto?: string; telefono?: string }[]
  }
  agent: { id: string; name: string }
}

type FilterKey = 'all' | 'overdue' | 'today' | 'upcoming' | 'completed'
type GroupKey = 'overdue' | 'today' | 'upcoming'

const FILTER_OPTIONS: {
  key: FilterKey
  label: string
  emptyMessage: string
  activeClasses: string
  ring: string
}[] = [
  {
    key: 'all',
    label: 'Todos',
    emptyMessage: 'No hay callbacks pendientes',
    activeClasses: 'bg-gray-50 border-gray-300 text-gray-800',
    ring: 'ring-gray-400',
  },
  {
    key: 'overdue',
    label: 'Vencidos',
    emptyMessage: 'No hay callbacks vencidos',
    activeClasses: 'bg-red-50 border-red-300 text-red-800',
    ring: 'ring-red-400',
  },
  {
    key: 'today',
    label: 'Hoy',
    emptyMessage: 'No hay callbacks para hoy',
    activeClasses: 'bg-amber-50 border-amber-300 text-amber-800',
    ring: 'ring-amber-400',
  },
  {
    key: 'upcoming',
    label: 'Próximos',
    emptyMessage: 'No hay callbacks próximos',
    activeClasses: 'bg-blue-50 border-blue-300 text-blue-800',
    ring: 'ring-blue-400',
  },
  {
    key: 'completed',
    label: 'Completados',
    emptyMessage: 'No hay callbacks completados',
    activeClasses: 'bg-green-50 border-green-300 text-green-800',
    ring: 'ring-green-400',
  },
]

const GROUP_CONFIG: Record<
  GroupKey,
  { label: string; headerClasses: string; borderAccent: string }
> = {
  overdue: {
    label: 'Vencidos',
    headerClasses: 'text-red-700 bg-red-50 border-red-200',
    borderAccent: 'border-red-200',
  },
  today: {
    label: 'Hoy',
    headerClasses: 'text-amber-700 bg-amber-50 border-amber-200',
    borderAccent: 'border-amber-200',
  },
  upcoming: {
    label: 'Próximos',
    headerClasses: 'text-blue-700 bg-blue-50 border-blue-200',
    borderAccent: 'border-blue-200',
  },
}

function isUpcoming(scheduledAt: string): boolean {
  return isAfter(new Date(scheduledAt), endOfToday())
}

function matchesFilter(cb: Callback, filter: FilterKey): boolean {
  const d = new Date(cb.scheduledAt)
  switch (filter) {
    case 'completed':
      return cb.completed
    case 'all':
      return !cb.completed
    case 'overdue':
      return !cb.completed && isPast(d)
    case 'today':
      return !cb.completed && isToday(d)
    case 'upcoming':
      return !cb.completed && isUpcoming(cb.scheduledAt)
    default:
      return true
  }
}

function groupKey(scheduledAt: string): GroupKey {
  const d = new Date(scheduledAt)
  if (isToday(d)) return 'today'
  if (isPast(d)) return 'overdue'
  return 'upcoming'
}

function countForFilter(items: Callback[], filter: FilterKey): number {
  return items.filter((cb) => matchesFilter(cb, filter)).length
}

function CallbackCard({
  cb,
  isAdmin,
  muted,
  onOpen,
  onComplete,
  completing,
}: {
  cb: Callback
  isAdmin: boolean
  muted?: boolean
  onOpen: () => void
  onComplete?: () => void
  completing: boolean
}) {
  const title = cb.company.razonSocial || cb.company.ruc
  const showRuc = !!cb.company.razonSocial
  const isPastDue = !cb.completed && isPast(new Date(cb.scheduledAt))

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className={`card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:border-blue-200 hover:shadow-sm transition-all ${
        muted ? 'opacity-60' : ''
      } ${isPastDue ? 'border-red-200 bg-red-50/30' : ''}`}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
          <Phone size={18} className="text-blue-600" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-gray-900">{title}</p>
          {showRuc && (
            <p className="text-xs text-gray-500 font-mono">{cb.company.ruc}</p>
          )}
          <p className="text-sm text-gray-500">
            {cb.company.contacts?.[0]?.nombre ?? '—'}
            {cb.company.contacts?.[0]?.telefono ? (
              <>
                {' '}
                ·{' '}
                <a
                  href={`tel:${cb.company.contacts[0].telefono}`}
                  className="hover:text-blue-600 font-mono"
                  onClick={(e) => e.stopPropagation()}
                >
                  {cb.company.contacts[0].telefono}
                </a>
              </>
            ) : null}
          </p>
          {cb.notes && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{cb.notes}</p>
          )}
          {isAdmin && (
            <p className="text-xs text-gray-400">Agente: {cb.agent.name}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
        <div className="text-right space-y-1">
          <CallbackScheduleBadge callback={cb} />
          {cb.completed && cb.completedAt && (
            <p className="text-xs text-gray-400">
              Completado: {format(new Date(cb.completedAt), "d MMM 'a las' HH:mm", { locale: es })}
            </p>
          )}
        </div>
        {!cb.completed && onComplete && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onComplete()
            }}
            disabled={completing}
            className="btn-success py-2 px-3 min-h-[44px]"
            title="Marcar como completado"
          >
            <CheckCircle2 size={15} />
            Completado
          </button>
        )}
      </div>
    </div>
  )
}

function CollapsibleGroup({
  group,
  items,
  collapsed,
  onToggle,
  isAdmin,
  completing,
  onOpen,
  onComplete,
}: {
  group: GroupKey
  items: Callback[]
  collapsed: boolean
  onToggle: () => void
  isAdmin: boolean
  completing: boolean
  onOpen: (cb: Callback) => void
  onComplete: (cb: Callback) => void
}) {
  if (items.length === 0) return null
  const cfg = GROUP_CONFIG[group]

  return (
    <div className={`border rounded-xl overflow-hidden ${cfg.borderAccent}`}>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold border-b ${cfg.headerClasses}`}
      >
        <span className="flex items-center gap-2">
          <CalendarClock size={15} />
          {cfg.label}
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/70 tabular-nums">
            {items.length}
          </span>
        </span>
        {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
      {!collapsed && (
        <div className="p-3 space-y-3 bg-white">
          {items.map((cb) => (
            <CallbackCard
              key={cb.id}
              cb={cb}
              isAdmin={isAdmin}
              onOpen={() => onOpen(cb)}
              onComplete={() => onComplete(cb)}
              completing={completing}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Callbacks() {
  const { isAdmin } = useAuth()
  const [searchParams] = useSearchParams()
  const returnToDashboard = searchParams.get('from') === 'dashboard'
  const [filter, setFilter] = useState<FilterKey>('all')
  const [agentId, setAgentId] = useState('')
  const [completeConfirm, setCompleteConfirm] = useState<CompleteConfirm | null>(null)
  const [recordModal, setRecordModal] = useState<{
    clientId: string
    agentFilterId?: string
    highlightCallbackId?: string
  } | null>(null)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<GroupKey, boolean>>({
    overdue: false,
    today: false,
    upcoming: true,
  })
  const qc = useQueryClient()

  const agentParams = isAdmin && agentId ? { agentId } : {}

  const { data: pendingCallbacks = [], isLoading: loadingPending } = useQuery({
    queryKey: ['callbacks', { completed: false, ...agentParams }],
    queryFn: () => getCallbacks({ completed: false, ...agentParams }),
    refetchInterval: 60000,
  })

  const { data: completedCallbacks = [], isLoading: loadingCompleted } = useQuery({
    queryKey: ['callbacks', { completed: true, ...agentParams }],
    queryFn: () => getCallbacks({ completed: true, ...agentParams }),
    refetchInterval: 60000,
  })

  const isLoading = filter === 'completed' ? loadingCompleted : loadingPending

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
    enabled: isAdmin,
  })

  const agents = users.filter((u) => u.role === 'AGENT' && u.active)

  const completeMutation = useMutation({
    mutationFn: (payload: { id: string; companyId: string }) =>
      updateCallback(payload.id, { completed: true }),
    onSuccess: (_data, variables) => {
      toast.success('Callback marcado como completado')
      qc.invalidateQueries({ queryKey: ['callbacks'] })
      qc.invalidateQueries({ queryKey: ['client-detail', variables.companyId] })
      setCompleteConfirm(null)
    },
    onError: () => {
      toast.error('No se pudo completar el callback')
    },
  })

  const pendingItems = pendingCallbacks as Callback[]

  const filtered = useMemo(() => {
    const source = filter === 'completed'
      ? (completedCallbacks as Callback[])
      : (pendingCallbacks as Callback[])
    return source.filter((cb) => matchesFilter(cb, filter))
  }, [pendingCallbacks, completedCallbacks, filter])

  const counts = useMemo(() => {
    const pending = pendingCallbacks as Callback[]
    const done = completedCallbacks as Callback[]
    const combined = [...pending, ...done]
    return Object.fromEntries(
      FILTER_OPTIONS.map((f) => [f.key, countForFilter(combined, f.key)]),
    ) as Record<FilterKey, number>
  }, [pendingCallbacks, completedCallbacks])

  useEffect(() => {
    if (pendingItems.length > 0 && pendingItems.length < 10) {
      setCollapsedGroups({ overdue: false, today: false, upcoming: false })
    }
  }, [pendingItems.length])

  const grouped = useMemo(() => {
    const groups: Record<GroupKey, Callback[]> = {
      overdue: [],
      today: [],
      upcoming: [],
    }
    for (const cb of filtered) {
      if (cb.completed) continue
      groups[groupKey(cb.scheduledAt)].push(cb)
    }
    const sortByTime = (a: Callback, b: Callback) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    groups.overdue.sort(sortByTime)
    groups.today.sort(sortByTime)
    groups.upcoming.sort(sortByTime)
    return groups
  }, [filtered])

  const activeFilterConfig = FILTER_OPTIONS.find((f) => f.key === filter)!

  const handleConfirmComplete = () => {
    if (!completeConfirm) return
    completeMutation.mutate({ id: completeConfirm.id, companyId: completeConfirm.companyId })
  }

  const openRecord = (cb: Callback) => {
    setRecordModal({
      clientId: cb.company.id,
      agentFilterId: isAdmin ? cb.agent.id : undefined,
      highlightCallbackId: cb.id,
    })
  }

  const requestComplete = (cb: Callback) => {
    setCompleteConfirm({
      id: cb.id,
      label: cb.company.razonSocial || cb.company.ruc,
      scheduledAt: cb.scheduledAt,
      companyId: cb.company.id,
    })
  }

  const showGrouped = filter !== 'completed' && filtered.some((cb) => !cb.completed)

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agenda de Callbacks</h1>
          <p className="text-gray-500 text-sm mt-1">Llamadas de seguimiento programadas</p>
        </div>
        {returnToDashboard && (
          <Link
            to="/"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors shrink-0"
          >
            <ArrowLeft size={15} />
            Volver al Dashboard
          </Link>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex flex-wrap gap-2 flex-1">
          {FILTER_OPTIONS.map((f) => {
            const isActive = filter === f.key
            const count = counts[f.key]
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  isActive
                    ? `${f.activeClasses} ring-2 ring-offset-1 ${f.ring}`
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {f.label}
                <span
                  className={`text-xs font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                    isActive ? 'bg-white/70' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {isAdmin && (
          <label className="space-y-1 shrink-0 sm:min-w-[180px]">
            <span className="text-xs font-medium text-gray-500">Agente</span>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="input w-full"
            >
              <option value="">Todos los agentes</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          {filter === 'all' ? (
            <>
              <CheckCircle2 size={40} className="mx-auto mb-2 text-green-400" />
              <p className="font-medium text-green-600">¡Todo al día!</p>
              <p className="text-sm mt-1">{activeFilterConfig.emptyMessage}</p>
            </>
          ) : (
            <>
              <CalendarClock size={40} className="mx-auto mb-2 opacity-30" />
              <p className="font-medium text-gray-500">{activeFilterConfig.emptyMessage}</p>
            </>
          )}
        </div>
      ) : showGrouped ? (
        <div className="space-y-4">
          {(['overdue', 'today', 'upcoming'] as GroupKey[]).map((group) => (
            <CollapsibleGroup
              key={group}
              group={group}
              items={grouped[group]}
              collapsed={collapsedGroups[group]}
              onToggle={() =>
                setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }))
              }
              isAdmin={isAdmin}
              completing={completeMutation.isPending}
              onOpen={openRecord}
              onComplete={requestComplete}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((cb) => (
            <CallbackCard
              key={cb.id}
              cb={cb}
              isAdmin={isAdmin}
              muted={cb.completed}
              onOpen={() => openRecord(cb)}
              onComplete={cb.completed ? undefined : () => requestComplete(cb)}
              completing={completeMutation.isPending}
            />
          ))}
        </div>
      )}

      <CompleteCallbackModal
        confirm={completeConfirm}
        onClose={() => setCompleteConfirm(null)}
        onConfirm={handleConfirmComplete}
        isPending={completeMutation.isPending}
      />

      {recordModal && (
        <ClientRecordModal
          clientId={recordModal.clientId}
          agentFilterId={recordModal.agentFilterId}
          highlightCallbackId={recordModal.highlightCallbackId}
          onClose={() => setRecordModal(null)}
        />
      )}
    </div>
  )
}
