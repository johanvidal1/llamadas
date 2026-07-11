import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueries, keepPreviousData } from '@tanstack/react-query'
import { getClients, getClientsPipelineSummary, getClientsDaySummary, getUsers, getImports, type AppUser, type ClientsListResponse, type ClientListItem } from '../api/client'
import { DispositionBadge } from '../components/StatusBadge'
import {
  AGENT_PIPELINE_FUNNEL,
  PIPELINE_FILTER_OPERATIONAL,
  VALID_PIPELINE_FILTERS,
  getClientsFilterTitle,
  getPipelineFilterLabel,
  sumFunnelStages,
  type ClientsOperationalFilter,
} from '../config/companyPipeline'
import { buildReportsUrlFromClientsContext } from '../config/reportsNavigation'
import { FilterDropdown } from '../components/FilterDropdown'
import { getResponseOption } from '../config/responseOptions'
import ClientRecordModal from '../components/ClientRecordModal'
import { Search, Phone, User, CalendarClock, ArrowLeft, Eye, Calendar, X, ChevronDown, ChevronRight, SlidersHorizontal, Loader2, LayoutList } from 'lucide-react'
import { format, isPast, isToday, isYesterday, startOfMonth, startOfWeek, endOfWeek, addDays, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
function hasRecord(c: { lastDisposition?: string | null; _count: { callLogs: number } }): boolean {
  return !!(c.lastDisposition || c._count.callLogs > 0)
}

function pipelineFilterToParams(filter: string): Record<string, string | undefined> {
  if (!filter) return {}
  if (filter === 'PENDING') return { status: 'PENDING' }
  return { disposition: filter }
}

function todayLocal(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function weekStartLocal(): string {
  return format(startOfWeek(new Date(), { locale: es }), 'yyyy-MM-dd')
}

function monthStartLocal(): string {
  return format(startOfMonth(new Date()), 'yyyy-MM-dd')
}

function isTodayPreset(from: string, to: string): boolean {
  const today = todayLocal()
  return from === today && to === today
}

function isWeekPreset(from: string, to: string): boolean {
  return from === weekStartLocal() && to === todayLocal()
}

function isMonthPreset(from: string, to: string): boolean {
  return from === monthStartLocal() && to === todayLocal()
}

type DatePreset = 'today' | 'week' | 'month' | 'custom'

function activeDatePreset(from: string, to: string): DatePreset | null {
  if (!from && !to) return null
  if (isTodayPreset(from, to)) return 'today'
  if (isWeekPreset(from, to)) return 'week'
  if (isMonthPreset(from, to)) return 'month'
  return 'custom'
}

type GroupMode = '' | 'agent' | 'status' | 'day' | 'week' | 'month'
type DateGroupMode = '' | 'day' | 'week' | 'month'

function isFunnelChipFilter(filter: string): boolean {
  return AGENT_PIPELINE_FUNNEL.some((f) => f.key === filter)
}

const UNASSIGNED_AGENT_KEY = '__unassigned__'

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500] as const
const CLIENTS_PAGE_SIZE_KEY = 'clients-page-size'
const CLIENTS_COLUMN_VISIBILITY_KEY = 'clients-column-visibility'

type ColumnKey =
  | 'razonSocial'
  | 'contactos'
  | 'agente'
  | 'lote'
  | 'agendado'
  | 'registrado'
  | 'respuesta'
  | 'avance'

const CONFIGURABLE_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: 'razonSocial', label: 'Razón Social' },
  { key: 'contactos', label: 'Contactos' },
  { key: 'agente', label: 'Agente' },
  { key: 'lote', label: 'Lote' },
  { key: 'agendado', label: 'Agendado' },
  { key: 'registrado', label: 'Registrado' },
  { key: 'respuesta', label: 'Respuesta' },
  { key: 'avance', label: 'Avance' },
]

function defaultVisibleColumns(): Record<ColumnKey, boolean> {
  return {
    razonSocial: true,
    contactos: true,
    agente: true,
    lote: true,
    agendado: true,
    registrado: true,
    respuesta: true,
    avance: false,
  }
}

function readStoredColumnVisibility(): Record<ColumnKey, boolean> {
  const defaults = defaultVisibleColumns()
  try {
    const raw = localStorage.getItem(CLIENTS_COLUMN_VISIBILITY_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<ColumnKey, boolean>>
      const result = { ...defaults }
      for (const key of Object.keys(defaults) as ColumnKey[]) {
        if (typeof parsed[key] === 'boolean') result[key] = parsed[key]
      }
      return result
    }
  } catch {
    /* ignore */
  }
  return defaults
}

function defaultPageSize(): number {
  return import.meta.env.DEV ? 500 : 50
}

function readStoredPageSize(): number {
  try {
    const raw = localStorage.getItem(CLIENTS_PAGE_SIZE_KEY)
    if (raw) {
      const n = parseInt(raw, 10)
      if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(n)) return n
    }
  } catch {
    /* ignore */
  }
  return defaultPageSize()
}

function ClientsPaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  return (
    <div className="flex items-center justify-between text-sm text-gray-500">
      <div className="flex flex-wrap items-center gap-3">
        <p>
          Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}
        </p>
        <label className="inline-flex items-center gap-1.5">
          <span>Por página</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1 text-sm bg-white"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="btn-secondary py-1.5"
        >
          Anterior
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page * pageSize >= total}
          className="btn-secondary py-1.5"
        >
          Siguiente
        </button>
      </div>
    </div>
  )
}

function lastCalledAtMs(client: ClientListItem): number | null {
  return client.lastCalledAt ? new Date(client.lastCalledAt).getTime() : null
}

function isPending(client: ClientListItem): boolean {
  return !client.lastDisposition && !hasRecord(client)
}

function sortClientsForAdminQueue(clients: ClientListItem[]): ClientListItem[] {
  return [...clients].sort((a, b) => {
    const aPending = isPending(a)
    const bPending = isPending(b)
    if (aPending !== bPending) return aPending ? 1 : -1

    if (!aPending) {
      const aMs = lastCalledAtMs(a)
      const bMs = lastCalledAtMs(b)
      if (aMs === null && bMs === null) return a.ruc.localeCompare(b.ruc, 'es')
      if (aMs === null) return 1
      if (bMs === null) return -1
      const byDate = bMs - aMs
      if (byDate !== 0) return byDate
      return a.ruc.localeCompare(b.ruc, 'es')
    }

    return a.ruc.localeCompare(b.ruc, 'es')
  })
}

function maxLastCalledAt(clients: ClientListItem[]): number | null {
  let max: number | null = null
  for (const c of clients) {
    const ms = lastCalledAtMs(c)
    if (ms !== null && (max === null || ms > max)) max = ms
  }
  return max
}

function resolvePrimaryAgentId(client: ClientListItem): string {
  const assignedContacts = client.contacts.filter((ct) => ct.assignment?.agent?.id)
  const agentIds = [
    ...new Set(assignedContacts.map((ct) => ct.assignment!.agent!.id!)),
  ]

  if (agentIds.length === 0) return UNASSIGNED_AGENT_KEY
  if (agentIds.length === 1) return agentIds[0]

  if (client.lastCallContactId) {
    const lastContact = client.contacts.find((ct) => ct.id === client.lastCallContactId)
    const agentId = lastContact?.assignment?.agent?.id
    if (agentId) return agentId
  }

  return assignedContacts[0].assignment!.agent!.id!
}

type DisplayGroup = {
  key: string
  title: string
  borderClass: string
  clients: ClientListItem[]
}

const STATUS_GROUP_PENDING = 'PENDING'
const STATUS_GROUP_REGISTERED = 'REGISTERED'

function groupClientsByStatus(clients: ClientListItem[]): DisplayGroup[] {
  const pending: ClientListItem[] = []
  const registered: ClientListItem[] = []
  for (const client of clients) {
    if (client.lastDisposition == null) pending.push(client)
    else registered.push(client)
  }

  return [
    {
      key: STATUS_GROUP_PENDING,
      title: 'Pendientes',
      borderClass: 'border-amber-400',
      clients: sortClientsForAdminQueue(pending),
    },
    {
      key: STATUS_GROUP_REGISTERED,
      title: 'Registradas',
      borderClass: 'border-emerald-400',
      clients: sortClientsForAdminQueue(registered),
    },
  ]
}

function groupClientsByAgent(
  clients: ClientListItem[],
  agents: { id: string; name: string }[]
): DisplayGroup[] {
  const byAgent = new Map<string, ClientListItem[]>()
  for (const client of clients) {
    const key = resolvePrimaryAgentId(client)
    const list = byAgent.get(key) ?? []
    list.push(client)
    byAgent.set(key, list)
  }

  const agentNameById = new Map(agents.map((a) => [a.id, a.name]))

  const groups = [...byAgent.entries()].map(([key, groupClients]) => ({
    key,
    title:
      key === UNASSIGNED_AGENT_KEY
        ? 'Sin asignar'
        : (agentNameById.get(key) ?? 'Agente desconocido'),
    borderClass: 'border-emerald-400',
    clients: groupClients,
  }))

  for (const group of groups) {
    group.clients = sortClientsForAdminQueue(group.clients)
  }

  groups.sort((a, b) => {
    if (a.key === UNASSIGNED_AGENT_KEY) return 1
    if (b.key === UNASSIGNED_AGENT_KEY) return -1
    const aMax = maxLastCalledAt(a.clients)
    const bMax = maxLastCalledAt(b.clients)
    if (aMax === null && bMax === null) return a.title.localeCompare(b.title, 'es')
    if (aMax === null) return 1
    if (bMax === null) return -1
    const byActivity = bMax - aMax
    if (byActivity !== 0) return byActivity
    return a.title.localeCompare(b.title, 'es')
  })

  return groups
}

function firstRegisteredAtMs(client: ClientListItem): number | null {
  return client.firstRegisteredAt ? new Date(client.firstRegisteredAt).getTime() : null
}

function formatWeekGroupLabel(weekStartKey: string): string {
  const start = new Date(weekStartKey + 'T12:00:00')
  const end = endOfWeek(start, { locale: es })
  const startDay = format(start, 'd', { locale: es })
  const endDay = format(end, 'd', { locale: es })
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `Semana ${startDay}–${endDay} ${format(end, 'MMM yyyy', { locale: es })}`
  }
  return `Semana ${format(start, 'd MMM', { locale: es })} – ${format(end, 'd MMM yyyy', { locale: es })}`
}

function formatMonthGroupLabel(monthStartKey: string): string {
  const label = format(new Date(monthStartKey + 'T12:00:00'), 'MMMM yyyy', { locale: es })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function groupClientsByWeek(clients: ClientListItem[]): DisplayGroup[] {
  const byWeek = new Map<string, ClientListItem[]>()
  for (const client of clients) {
    const ms = firstRegisteredAtMs(client)
    if (ms === null) continue
    const weekStart = format(startOfWeek(new Date(ms), { locale: es }), 'yyyy-MM-dd')
    const list = byWeek.get(weekStart) ?? []
    list.push(client)
    byWeek.set(weekStart, list)
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, groupClients]) => ({
      key,
      title: formatWeekGroupLabel(key),
      borderClass: 'border-emerald-400',
      clients: sortClientsForAdminQueue(groupClients),
    }))
}

function groupClientsByMonth(clients: ClientListItem[]): DisplayGroup[] {
  const byMonth = new Map<string, ClientListItem[]>()
  for (const client of clients) {
    const ms = firstRegisteredAtMs(client)
    if (ms === null) continue
    const monthStart = format(startOfMonth(new Date(ms)), 'yyyy-MM-dd')
    const list = byMonth.get(monthStart) ?? []
    list.push(client)
    byMonth.set(monthStart, list)
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, groupClients]) => ({
      key,
      title: formatMonthGroupLabel(key),
      borderClass: 'border-emerald-400',
      clients: sortClientsForAdminQueue(groupClients),
    }))
}

function formatDayGroupLabel(dayKey: string): string {
  const date = new Date(dayKey + 'T12:00:00')
  if (isToday(date)) return 'Hoy'
  if (isYesterday(date)) return 'Ayer'
  return format(date, 'd MMM yyyy', { locale: es })
}

function dayBorderClass(dayKey: string): string {
  const date = new Date(dayKey + 'T12:00:00')
  const today = startOfDay(new Date())
  const day = startOfDay(date)
  if (isToday(date)) return 'border-amber-400'
  if (day < today) return 'border-gray-300'
  return 'border-blue-300'
}

function generateCalendarDays(from: string, to: string): string[] {
  if (!from && !to) return []
  const start = from || to
  const end = to || from
  const days: string[] = []
  let current = new Date(start + 'T12:00:00')
  const endDate = new Date(end + 'T12:00:00')
  while (current <= endDate) {
    days.push(format(current, 'yyyy-MM-dd'))
    current = addDays(current, 1)
  }
  return days.sort((a, b) => b.localeCompare(a))
}

function bucketClientsByDay(clients: ClientListItem[]): Map<string, ClientListItem[]> {
  const byDay = new Map<string, ClientListItem[]>()
  for (const client of clients) {
    const ms = lastCalledAtMs(client)
    if (ms === null) continue
    const dayKey = format(new Date(ms), 'yyyy-MM-dd')
    const list = byDay.get(dayKey) ?? []
    list.push(client)
    byDay.set(dayKey, list)
  }
  return byDay
}

function buildDayDisplayGroups(
  clients: ClientListItem[],
  registeredFrom: string,
  registeredTo: string
): DisplayGroup[] {
  const bucketed = bucketClientsByDay(clients)
  const dayKeys =
    registeredFrom || registeredTo
      ? generateCalendarDays(registeredFrom, registeredTo)
      : [...bucketed.keys()].sort((a, b) => b.localeCompare(a))

  return dayKeys.map((key) => ({
    key,
    title: formatDayGroupLabel(key),
    borderClass: dayBorderClass(key),
    clients: sortClientsForAdminQueue(bucketed.get(key) ?? []),
  }))
}

function viewModeButtonLabel(mode: GroupMode): string {
  switch (mode) {
    case 'agent':
      return 'Agrupar lista: Por agente'
    case 'status':
      return 'Agrupar lista: Por pendientes / registradas'
    default:
      return 'Agrupar lista: Sin agrupar'
  }
}

function resolveDatePresetDisplay(
  from: string,
  to: string,
  intent: DatePreset | 'custom' | null
): DatePreset | 'custom' | null {
  if (intent !== null) return intent
  return activeDatePreset(from, to)
}

function dateFilterButtonLabel(
  from: string,
  to: string,
  intent: DatePreset | 'custom' | null = null
): string {
  const preset = resolveDatePresetDisplay(from, to, intent)
  if (preset === null) return 'Período'
  if (preset === 'today') return 'Hoy'
  if (preset === 'week') return 'Esta semana'
  if (preset === 'month') return formatMonthGroupLabel(from || monthStartLocal())
  if (from && to) return formatDateChip(from, to)
  if (from) return `desde ${format(new Date(from + 'T12:00:00'), 'd MMM yy', { locale: es })}`
  return `hasta ${format(new Date(to + 'T12:00:00'), 'd MMM yy', { locale: es })}`
}

function funnelPeriodLabel(
  from: string,
  to: string,
  intent: DatePreset | 'custom' | null = null
): string {
  const preset = resolveDatePresetDisplay(from, to, intent)
  if (preset === null) return 'Sin filtro de actividad (estado actual)'
  if (preset === 'today') {
    const day = from || todayLocal()
    return `Hoy (${format(new Date(day + 'T12:00:00'), 'd MMM yyyy', { locale: es })})`
  }
  if (preset === 'week') {
    const weekFrom = from || weekStartLocal()
    const weekTo = to || todayLocal()
    return `Esta semana (${formatDateChip(weekFrom, weekTo)})`
  }
  if (preset === 'month') {
    const monthFrom = from || monthStartLocal()
    const monthTo = to || todayLocal()
    return `Este mes (${formatDateChip(monthFrom, monthTo)})`
  }
  return formatDateChip(from, to)
}

function periodCallBadgeLabel(
  count: number,
  from: string,
  to: string,
  intent: DatePreset | 'custom' | null
): string {
  const preset = resolveDatePresetDisplay(from, to, intent)
  if (preset === 'today') return `${count}× hoy`
  return `${count}×`
}

function periodCallBadgeTooltip(
  count: number,
  from: string,
  to: string,
  intent: DatePreset | 'custom' | null
): string {
  const preset = resolveDatePresetDisplay(from, to, intent)
  if (preset === 'today') return `${count} llamadas hoy`
  return `${count} llamadas en el período`
}

function activityFilterChipLabel(
  from: string,
  to: string,
  intent: DatePreset | 'custom' | null = null
): string {
  const preset = resolveDatePresetDisplay(from, to, intent)
  if (preset === 'today') return 'Hoy'
  if (preset === 'week') return `Esta semana (${formatDateChip(from || weekStartLocal(), to || todayLocal())})`
  if (preset === 'month') {
    return `Este mes (${formatDateChip(from || monthStartLocal(), to || todayLocal())})`
  }
  return formatDateChip(from, to)
}

function DateFilterPicker({
  registeredFrom,
  registeredTo,
  groupMode,
  datePresetIntent,
  onApply,
  onClear,
}: {
  registeredFrom: string
  registeredTo: string
  groupMode: GroupMode
  datePresetIntent: DatePreset | 'custom' | null
  onApply: (from: string, to: string, mode: GroupMode, intent: DatePreset | 'custom') => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState(registeredFrom)
  const [draftTo, setDraftTo] = useState(registeredTo)
  const [draftGroupMode, setDraftGroupMode] = useState<DateGroupMode>(
    groupMode === 'day' || groupMode === 'week' || groupMode === 'month' ? groupMode : ''
  )
  const rootRef = useRef<HTMLDivElement>(null)

  const hasDateFilter = !!(registeredFrom || registeredTo)
  const buttonLabel = dateFilterButtonLabel(registeredFrom, registeredTo, datePresetIntent)
  const weekSameAsToday = weekStartLocal() === todayLocal()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (!open) setCustomOpen(false)
  }, [open])

  const applyPreset = (
    from: string,
    to: string,
    mode: GroupMode,
    intent: DatePreset
  ) => {
    onApply(from, to, mode, intent)
    setOpen(false)
  }

  const openCustom = () => {
    setDraftFrom(registeredFrom)
    setDraftTo(registeredTo)
    setDraftGroupMode(
      groupMode === 'day' || groupMode === 'week' || groupMode === 'month' ? groupMode : ''
    )
    setCustomOpen(true)
  }

  const applyCustom = () => {
    if (!draftFrom && !draftTo) return
    onApply(draftFrom, draftTo, draftGroupMode, 'custom')
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
          open || hasDateFilter
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        <Calendar size={15} />
        {buttonLabel}
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          {!customOpen ? (
            <div className="space-y-0.5">
              <p className="px-3 pt-1 pb-2 text-xs font-medium text-gray-500">Período de actividad</p>
              <button
                type="button"
                onClick={() => applyPreset(todayLocal(), todayLocal(), 'day', 'today')}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  datePresetIntent === 'today'
                    ? 'bg-emerald-50 text-emerald-800 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                Hoy
              </button>
              <button
                type="button"
                onClick={() => applyPreset(weekStartLocal(), todayLocal(), 'day', 'week')}
                title={
                  weekSameAsToday
                    ? 'Hoy es el inicio de la semana; mismo rango que Hoy'
                    : undefined
                }
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  datePresetIntent === 'week'
                    ? 'bg-emerald-50 text-emerald-800 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                Esta semana
              </button>
              <button
                type="button"
                onClick={() => applyPreset(monthStartLocal(), todayLocal(), 'day', 'month')}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  datePresetIntent === 'month'
                    ? 'bg-emerald-50 text-emerald-800 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                Este mes
              </button>
              <button
                type="button"
                onClick={openCustom}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  datePresetIntent === 'custom'
                    ? 'bg-emerald-50 text-emerald-800 font-medium'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                Fecha personalizada
              </button>
              {hasDateFilter && (
                <>
                  <div className="my-1 border-t border-gray-100" />
                  <button
                    type="button"
                    onClick={() => {
                      onClear()
                      setOpen(false)
                    }}
                    className="w-full text-left px-3 py-2 rounded-md text-sm text-gray-500 hover:bg-gray-50"
                  >
                    Quitar filtro
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3 p-1">
              <p className="text-xs font-medium text-gray-500">Rango personalizado</p>
              <label className="block space-y-1">
                <span className="text-xs text-gray-500">Desde</span>
                <input
                  type="date"
                  value={draftFrom}
                  onChange={(e) => setDraftFrom(e.target.value)}
                  className="input w-full py-1.5 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-gray-500">Hasta</span>
                <input
                  type="date"
                  value={draftTo}
                  onChange={(e) => setDraftTo(e.target.value)}
                  className="input w-full py-1.5 text-sm"
                />
              </label>
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Agrupar por</p>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { value: '' as const, label: 'Sin agrupar' },
                      { value: 'day' as const, label: 'Por día' },
                      { value: 'week' as const, label: 'Por semana' },
                      { value: 'month' as const, label: 'Por mes' },
                    ] as const
                  ).map(({ value, label }) => (
                    <button
                      key={value || 'flat'}
                      type="button"
                      onClick={() => setDraftGroupMode(value)}
                      className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                        draftGroupMode === value
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCustomOpen(false)}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Volver
                </button>
                <button
                  type="button"
                  onClick={applyCustom}
                  disabled={!draftFrom && !draftTo}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Aplicar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DayGroupHeader({
  group,
  loadedClients,
  isPartial,
  summary,
}: {
  group: DisplayGroup
  loadedClients?: ClientListItem[]
  isPartial?: boolean
  summary?: { count: number; registered: number; pending: number }
}) {
  const clients = loadedClients ?? group.clients
  const count = summary?.count ?? clients.length
  const pending = summary?.pending ?? clients.filter((c) => isPending(c)).length
  const registered = summary?.registered ?? count - pending

  return (
    <div className="flex-1 min-w-0 text-left">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-medium text-gray-900">{group.title}</span>
        <span className="text-sm text-gray-500">
          {count > 0 ? (
            <>
              {count} empresa{count === 1 ? '' : 's'}
              {' · '}
              <span className="text-emerald-700">{registered} registradas</span>
              {' · '}
              <span className="text-amber-700">{pending} pendientes</span>
            </>
          ) : isPartial ? (
            <span className="text-gray-400">Sin datos cargados · expandir para ver</span>
          ) : (
            <>0 empresas</>
          )}
        </span>
      </div>
    </div>
  )
}

function ViewModePicker({
  groupMode,
  agentId,
  onChange,
}: {
  groupMode: GroupMode
  agentId: string
  onChange: (mode: GroupMode) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const isGrouped = groupMode === 'agent' || groupMode === 'status'

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const selectMode = (mode: GroupMode) => {
    onChange(mode)
    setOpen(false)
  }

  const optionClass = (active: boolean) =>
    `w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
      active ? 'bg-violet-50 text-violet-800 font-medium' : 'text-gray-700 hover:bg-gray-50'
    }`

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
          open || isGrouped
            ? 'border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100'
            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        <LayoutList size={15} />
        {viewModeButtonLabel(groupMode)}
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-72 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          <p className="px-3 pt-1 pb-2 text-xs font-medium text-gray-500">Agrupar vista</p>
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => selectMode('')}
              className={optionClass(groupMode === '')}
            >
              Sin agrupar
            </button>
            {!agentId && (
              <button
                type="button"
                onClick={() => selectMode('agent')}
                className={optionClass(groupMode === 'agent')}
              >
                Por agente
              </button>
            )}
            {agentId && (
              <button
                type="button"
                onClick={() => selectMode('status')}
                className={optionClass(groupMode === 'status')}
              >
                Por pendientes / registradas
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ColumnVisibilityPicker({
  visibleColumns,
  onChange,
}: {
  visibleColumns: Record<ColumnKey, boolean>
  onChange: (columns: Record<ColumnKey, boolean>) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const persist = (next: Record<ColumnKey, boolean>) => {
    onChange(next)
    try {
      localStorage.setItem(CLIENTS_COLUMN_VISIBILITY_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }

  const toggleColumn = (key: ColumnKey) => {
    persist({ ...visibleColumns, [key]: !visibleColumns[key] })
  }

  const restoreDefaults = () => {
    persist(defaultVisibleColumns())
  }

  const hiddenCount = CONFIGURABLE_COLUMNS.filter((c) => !visibleColumns[c.key]).length

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
          open || hiddenCount > 0
            ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        <SlidersHorizontal size={15} />
        Columnas
        {hiddenCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold">
            {hiddenCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-52 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <p className="text-xs font-medium text-gray-500 mb-2">Columnas visibles</p>
          <div className="space-y-1.5">
            {CONFIGURABLE_COLUMNS.map(({ key, label }) => (
              <label
                key={key}
                className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900"
              >
                <input
                  type="checkbox"
                  checked={visibleColumns[key]}
                  onChange={() => toggleColumn(key)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                {label}
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={restoreDefaults}
            className="mt-3 w-full text-left text-xs font-medium text-blue-600 hover:text-blue-800"
          >
            Restaurar predeterminado
          </button>
        </div>
      )}
    </div>
  )
}

function ClientsTableHead({
  showAgentColumn,
  showBatchColumn,
  visibleColumns,
}: {
  showAgentColumn: boolean
  showBatchColumn: boolean
  visibleColumns: Record<ColumnKey, boolean>
}) {
  const showAgent = showAgentColumn && visibleColumns.agente
  const showBatch = showBatchColumn && visibleColumns.lote

  return (
    <thead className="bg-gray-50 border-b border-gray-200">
      <tr>
        <th className="sticky left-0 z-20 bg-gray-50 text-left px-3 py-2 font-medium text-gray-600 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
          RUC
        </th>
        {visibleColumns.razonSocial && (
          <th className="text-left px-3 py-2 font-medium text-gray-600">Razón Social</th>
        )}
        {visibleColumns.contactos && (
          <th className="text-left px-3 py-2 font-medium text-gray-600">Contactos</th>
        )}
        {showAgent && (
          <th className="text-left px-3 py-2 font-medium text-gray-600">Agente</th>
        )}
        {showBatch && (
          <th className="text-left px-3 py-2 font-medium text-gray-600">Lote</th>
        )}
        {visibleColumns.agendado && (
          <th className="text-left px-3 py-2 font-medium text-gray-600">Agendado</th>
        )}
        {visibleColumns.registrado && (
          <th className="text-left px-3 py-2 font-medium text-gray-600">Registrado</th>
        )}
        {visibleColumns.respuesta && (
          <th className="text-left px-3 py-2 font-medium text-gray-600">Respuesta</th>
        )}
        {visibleColumns.avance && (
          <th className="text-left px-3 py-2 font-medium text-gray-600 w-16">Avance</th>
        )}
        <th
          className="sticky right-0 z-20 bg-gray-50 shrink-0 w-12 shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.08)]"
          aria-label="Acciones"
        />
      </tr>
    </thead>
  )
}

function ClientTableRow({
  client: c,
  showAgentColumn,
  showBatchColumn,
  visibleColumns,
  onOpenRecord,
  hasDateFilter = false,
  registeredFrom = '',
  registeredTo = '',
  datePresetIntent = null,
}: {
  client: ClientListItem
  showAgentColumn: boolean
  showBatchColumn: boolean
  visibleColumns: Record<ColumnKey, boolean>
  onOpenRecord: (clientId: string, initialFocus?: 'summary' | 'history') => void
  hasDateFilter?: boolean
  registeredFrom?: string
  registeredTo?: string
  datePresetIntent?: DatePreset | 'custom' | null
}) {
  const showAgent = showAgentColumn && visibleColumns.agente
  const showBatch = showBatchColumn && visibleColumns.lote
  const nextCb = c.callbacks?.[0]
  const cbDate = nextCb ? new Date(nextCb.scheduledAt) : null
  const cbStyle = cbDate
    ? isPast(cbDate)
      ? 'text-red-600 bg-red-50 border border-red-200'
      : isToday(cbDate)
      ? 'text-amber-700 bg-amber-50 border border-amber-200'
      : 'text-blue-700 bg-blue-50 border border-blue-200'
    : ''
  const primaryContact = c.contacts?.[0]
  const agentNames = [
    ...new Set(
      c.contacts
        .filter((ct) => ct.assignment?.agent?.name)
        .map((ct) => ct.assignment!.agent!.name)
    ),
  ]
  if (c.lastCallAgent?.name && !agentNames.includes(c.lastCallAgent.name)) {
    agentNames.push(c.lastCallAgent.name)
  }
  const aclaracion =
    c.lastAclaracion ??
    (c.lastDisposition ? getResponseOption(c.lastDisposition)?.aclaracion : undefined)
  const recordable = hasRecord(c)
  const rowHover = recordable ? 'group hover:bg-blue-50 cursor-pointer' : 'group hover:bg-gray-50'
  const stickyBg = recordable ? 'bg-white group-hover:bg-blue-50' : 'bg-white group-hover:bg-gray-50'
  const periodCount = c.periodCallCount ?? 0
  const showPeriodBadge = hasDateFilter && periodCount >= 2
  const showHistoryBadge =
    !showPeriodBadge && (c.callLogCount ?? 0) > 1 && (!hasDateFilter || periodCount <= 1)

  return (
    <tr className={rowHover} onClick={recordable ? () => onOpenRecord(c.id) : undefined}>
      <td
        className={`sticky left-0 z-10 ${stickyBg} px-3 py-2 font-mono text-xs text-gray-700 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}
      >
        {c.ruc}
      </td>
      {visibleColumns.razonSocial && (
        <td className="px-3 py-2 font-medium text-gray-900 max-w-[200px]">
          {c.razonSocial ? (
            <span
              className={`truncate block ${recordable ? 'text-blue-700 hover:underline' : ''}`}
              title={c.razonSocial}
            >
              {c.razonSocial}
            </span>
          ) : (
            <span
              className={
                recordable
                  ? 'text-blue-600 hover:underline text-sm'
                  : 'text-gray-400 italic text-sm'
              }
            >
              Sin razón social
            </span>
          )}
        </td>
      )}
      {visibleColumns.contactos && (
        <td className="px-3 py-2 text-gray-600 max-w-[200px]">
          {primaryContact ? (
            <div className="leading-tight">
              <p className="text-sm truncate">
                <span className="font-medium text-gray-800">{primaryContact.nombre}</span>
                {primaryContact.telefono && (
                  <span className="text-gray-400 font-normal">
                    {' · '}
                    <Phone size={10} className="inline -mt-px" />
                    {primaryContact.telefono}
                  </span>
                )}
              </p>
              {c.contacts.length > 1 && (
                <p className="text-[11px] text-blue-500 mt-0.5">+{c.contacts.length - 1} más</p>
              )}
            </div>
          ) : (
            <span className="text-gray-300 text-xs">Sin contactos</span>
          )}
        </td>
      )}
      {showAgent && (
        <td className="px-3 py-2 text-gray-600 text-sm">
          {agentNames.length > 0 ? (
            <span className="truncate block max-w-[120px]" title={agentNames.join(', ')}>
              {agentNames.join(', ')}
            </span>
          ) : (
            <span className="text-gray-300">Sin asignar</span>
          )}
        </td>
      )}
      {showBatch && (
        <td className="px-3 py-2 text-xs text-gray-500 max-w-[130px]">
          {c.importBatch ? (
            <span title={c.importBatch.filename} className="truncate block">
              {c.importBatch.filename.replace(/\.[^.]+$/, '').slice(0, 16)}
              <span className="text-gray-400 ml-1">
                {format(new Date(c.importBatch.createdAt), 'd MMM', { locale: es })}
              </span>
            </span>
          ) : (
            '—'
          )}
        </td>
      )}
      {visibleColumns.agendado && (
        <td className="px-3 py-2">
          {cbDate ? (
            <span
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${cbStyle}`}
              title={nextCb?.notes ?? ''}
            >
              <CalendarClock size={11} />
              {format(cbDate, 'dd/MM HH:mm', { locale: es })}
            </span>
          ) : (
            <span className="text-gray-300 text-xs">—</span>
          )}
        </td>
      )}
      {visibleColumns.registrado && (
        <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
          {c.lastCalledAt ? (
            <span className="inline-flex items-center gap-1">
              <span>{format(new Date(c.lastCalledAt), 'dd/MM/yy HH:mm', { locale: es })}</span>
              {showPeriodBadge && (
                <span
                  className="text-[9px] text-violet-700 font-bold uppercase tracking-wide"
                  title={periodCallBadgeTooltip(periodCount, registeredFrom, registeredTo, datePresetIntent)}
                >
                  {periodCallBadgeLabel(periodCount, registeredFrom, registeredTo, datePresetIntent)}
                </span>
              )}
              {showHistoryBadge && (
                <span
                  className="text-[9px] text-amber-600 font-semibold uppercase tracking-wide"
                  title={`${c.callLogCount} registros en historial · último: ${format(new Date(c.lastCalledAt), 'dd/MM/yy HH:mm', { locale: es })}`}
                >
                  Actualizado
                </span>
              )}
            </span>
          ) : (
            <span className="text-gray-300">—</span>
          )}
        </td>
      )}
      {visibleColumns.respuesta && (
        <td className="px-3 py-2">
          {c.lastDisposition ? (
            <DispositionBadge disposition={c.lastDisposition} />
          ) : (
            <span className="text-gray-300 text-xs">Pendiente</span>
          )}
        </td>
      )}
      {visibleColumns.avance && (
        <td className="px-3 py-2 text-sm text-gray-600 tabular-nums">
          {aclaracion ? aclaracion : <span className="text-gray-300">—</span>}
        </td>
      )}
      <td
        className={`sticky right-0 z-10 ${stickyBg} shrink-0 w-12 text-center shadow-[-2px_0_4px_-2px_rgba(0,0,0,0.08)]`}
      >
        {recordable ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-blue-600 hover:bg-blue-100 transition-colors"
            title="Ver registro"
            aria-label="Ver registro"
            onClick={(e) => {
              e.stopPropagation()
              onOpenRecord(c.id)
            }}
          >
            <Eye size={14} />
          </button>
        ) : (
          <span className="text-gray-400 text-xs tabular-nums">
            {c._count.callLogs > 0 ? c._count.callLogs : '—'}
          </span>
        )}
      </td>
    </tr>
  )
}

function formatDateChip(from: string, to: string): string {
  const fmt = (d: string) => format(new Date(d + 'T12:00:00'), 'd MMM yy', { locale: es })
  if (from && to) return `${fmt(from)} – ${fmt(to)}`
  if (from) return `desde ${fmt(from)}`
  return `hasta ${fmt(to)}`
}

type AgentStats = { total: number; registered: number; pending: number }

function AgentGroupHeader({
  group,
  stats,
}: {
  group: DisplayGroup
  stats?: AgentStats
}) {
  const isUnassigned = group.key === UNASSIGNED_AGENT_KEY
  const loadedCount = group.clients.length
  const total = isUnassigned ? loadedCount : (stats?.total ?? loadedCount)
  const pending = isUnassigned
    ? group.clients.filter((c) => isPending(c)).length
    : (stats?.pending ?? 0)
  const registered = isUnassigned
    ? loadedCount - pending
    : (stats?.registered ?? Math.max(0, total - pending))
  const registeredPct = total > 0 ? (registered / total) * 100 : 0
  const pendingPct = total > 0 ? (pending / total) * 100 : 0

  return (
    <div className="flex-1 min-w-0 text-left">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-medium text-gray-900">{group.title}</span>
        {isUnassigned ? (
          <span className="text-sm text-gray-500">
            {loadedCount} empresa{loadedCount === 1 ? '' : 's'}
          </span>
        ) : (
          <span className="text-sm text-gray-500">
            {total} empresa{total === 1 ? '' : 's'}
            {' · '}
            <span className="text-emerald-700">{registered} registradas</span>
            {' · '}
            <span className="text-amber-700">{pending} pendientes</span>
          </span>
        )}
      </div>
      {!isUnassigned && total > 0 && (
        <div className="mt-1.5 max-w-xs">
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden flex w-full">
            <div className="h-full bg-emerald-500" style={{ width: `${registeredPct}%` }} />
            <div className="h-full bg-amber-400" style={{ width: `${pendingPct}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}

function ClientsFunnelSkeleton() {
  return (
    <div className="flex flex-wrap gap-2 overflow-x-auto animate-pulse">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-[4.5rem] min-w-[5.5rem] bg-gray-100 rounded-lg border border-gray-200" />
      ))}
    </div>
  )
}

function ClientsTableSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-11 bg-gray-50 border-b border-gray-200" />
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-12 border-b border-gray-100 bg-gray-50/50" />
      ))}
    </div>
  )
}

export default function Clients() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialFilter = searchParams.get('filter') ?? ''
  const initialAgentId = searchParams.get('agentId') ?? ''
  const fromParam = searchParams.get('from')
  const returnToReports = fromParam === 'reports'
  const returnToDashboard = fromParam === 'dashboard'
  const deepLinkFilter = VALID_PIPELINE_FILTERS.has(initialFilter) ? initialFilter : ''
  const initialRegisteredFrom = searchParams.get('registeredFrom') ?? ''
  const initialRegisteredTo = searchParams.get('registeredTo') ?? ''
  const hasUrlDateParams = !!(initialRegisteredFrom || initialRegisteredTo)
  const useDayDefault = !hasUrlDateParams && !initialAgentId && !deepLinkFilter
  const defaultRegisteredFrom = hasUrlDateParams
    ? initialRegisteredFrom
    : useDayDefault
      ? todayLocal()
      : ''
  const defaultRegisteredTo = hasUrlDateParams
    ? initialRegisteredTo
    : useDayDefault
      ? todayLocal()
      : ''
  const defaultGroupMode: GroupMode = useDayDefault ? 'day' : ''
  const defaultDatePresetIntent: DatePreset | 'custom' | null = hasUrlDateParams
    ? activeDatePreset(defaultRegisteredFrom, defaultRegisteredTo)
    : useDayDefault
      ? 'today'
      : null

  const [search, setSearch] = useState('')
  const [pipelineFilter, setPipelineFilter] = useState(deepLinkFilter)
  const [agentId, setAgentId] = useState(initialAgentId)
  const [batchId, setBatchId] = useState('')
  const [registeredFrom, setRegisteredFrom] = useState(defaultRegisteredFrom)
  const [registeredTo, setRegisteredTo] = useState(defaultRegisteredTo)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(readStoredPageSize)
  const [visibleColumns, setVisibleColumns] = useState(readStoredColumnVisibility)
  const [groupMode, setGroupMode] = useState<GroupMode>(defaultGroupMode)
  const [datePresetIntent, setDatePresetIntent] = useState<DatePreset | 'custom' | null>(
    defaultDatePresetIntent
  )
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [recordModal, setRecordModal] = useState<{
    clientId: string
    initialFocus?: 'summary' | 'history'
  } | null>(null)

  const openRecord = (clientId: string, initialFocus: 'summary' | 'history' = 'summary') => {
    setRecordModal({ clientId, initialFocus })
  }

  const handlePageSizeChange = (size: number) => {
    setPageSize(size)
    setPage(1)
    try {
      localStorage.setItem(CLIENTS_PAGE_SIZE_KEY, String(size))
    } catch {
      /* ignore */
    }
  }

  const { data: usersData = [] } = useQuery({ queryKey: ['users'], queryFn: getUsers })
  const agents = useMemo(
    () =>
      (usersData as AppUser[])
        .filter((u) => u.role === 'AGENT' && u.active)
        .map((u) => ({
          id: u.id,
          name: u.name,
          assignedCompanies: u.assignedCompanies ?? 0,
          pendingCompanies: u.pendingCompanies ?? 0,
        })),
    [usersData]
  )

  const agentStatsById = useMemo(() => {
    const map = new Map<string, AgentStats>()
    for (const a of agents) {
      const total = a.assignedCompanies
      const pending = a.pendingCompanies
      map.set(a.id, {
        total,
        pending,
        registered: Math.max(0, total - pending),
      })
    }
    return map
  }, [agents])

  const { data: imports = [] } = useQuery({ queryKey: ['imports'], queryFn: getImports })
  const batches = imports as { id: string; filename: string; createdAt: string; totalRecords: number }[]

  const effectiveGroupBy =
    groupMode === 'agent' ||
    groupMode === 'status' ||
    groupMode === 'day' ||
    groupMode === 'week' ||
    groupMode === 'month'

  const effectiveLimit = Math.min(pageSize, 500)

  const clientsFilterParams = {
    search: search || undefined,
    agentId: agentId || undefined,
    batchId: batchId || undefined,
    registeredFrom: registeredFrom || undefined,
    registeredTo: registeredTo || undefined,
    ...pipelineFilterToParams(pipelineFilter),
  }

  const applyDateFilter = (
    from: string,
    to: string,
    mode: GroupMode,
    intent: DatePreset | 'custom'
  ) => {
    setRegisteredFrom(from)
    setRegisteredTo(to)
    setGroupMode(mode)
    setDatePresetIntent(intent)
    setExpandedGroups(new Set())
    setPage(1)
  }

  const clearDateFilter = () => {
    setRegisteredFrom('')
    setRegisteredTo('')
    setDatePresetIntent(null)
    setGroupMode('')
    setExpandedGroups(new Set())
    setPage(1)
  }

  const { data, isLoading } = useQuery<ClientsListResponse>({
    queryKey: [
      'clients',
      {
        search,
        pipelineFilter,
        agentId,
        batchId,
        registeredFrom,
        registeredTo,
        page: effectiveGroupBy ? 1 : page,
        pageSize: effectiveLimit,
        grouped: effectiveGroupBy,
        groupMode,
        sortBy: 'activity',
        includePipeline: false,
      },
    ],
    queryFn: () =>
      getClients({
        ...clientsFilterParams,
        page: effectiveGroupBy ? 1 : page,
        limit: effectiveLimit,
        sortBy: 'activity',
        includePipeline: false,
      }),
    placeholderData: keepPreviousData,
  })

  const { data: pipelineData, isLoading: pipelineLoading } = useQuery({
    queryKey: ['clients', 'pipeline-summary', clientsFilterParams],
    queryFn: () => getClientsPipelineSummary(clientsFilterParams),
    placeholderData: keepPreviousData,
  })

  const useDaySummary = groupMode === 'day' && !registeredFrom && !registeredTo
  const { data: daySummaryData } = useQuery({
    queryKey: ['clients', 'day-summary', clientsFilterParams],
    queryFn: () => getClientsDaySummary(clientsFilterParams),
    enabled: useDaySummary,
    placeholderData: keepPreviousData,
  })

  const clients = data?.clients ?? []
  const total = useDaySummary
    ? (daySummaryData?.total ?? data?.total ?? 0)
    : (data?.total ?? 0)
  const showFlatPagination = !effectiveGroupBy && total > pageSize
  const pipelineCounts = pipelineData?.pipelineCounts
  const assignmentSummary = pipelineData?.assignmentSummary ?? data?.assignmentSummary
  const funnelTotal = pipelineCounts ? sumFunnelStages(pipelineCounts) : null
  const hasDateFilter = !!(registeredFrom || registeredTo)
  const selectedBatch = batchId ? batches.find((b) => b.id === batchId) : null
  const selectedAgent = agentId ? agents.find((a) => a.id === agentId) : null
  const hasActiveFilters = !!(search || pipelineFilter || agentId || batchId || hasDateFilter)
  const showAgentColumn = !agentId
  const showBatchColumn = !batchId
  const displayGroups = useMemo((): DisplayGroup[] => {
    if (groupMode === 'agent') return groupClientsByAgent(clients, agents)
    if (groupMode === 'status') return groupClientsByStatus(clients)
    if (groupMode === 'day') {
      if (useDaySummary && daySummaryData?.days) {
        return daySummaryData.days.map((day) => ({
          key: day.dayKey,
          title: formatDayGroupLabel(day.dayKey),
          borderClass: dayBorderClass(day.dayKey),
          clients: bucketClientsByDay(clients).get(day.dayKey) ?? [],
        }))
      }
      return buildDayDisplayGroups(clients, registeredFrom, registeredTo)
    }
    if (groupMode === 'week') return groupClientsByWeek(clients)
    if (groupMode === 'month') return groupClientsByMonth(clients)
    return []
  }, [groupMode, clients, agents, registeredFrom, registeredTo, useDaySummary, daySummaryData?.days])

  const daySummaryByKey = useMemo(() => {
    const map = new Map<string, { count: number; registered: number; pending: number }>()
    if (daySummaryData?.days) {
      for (const day of daySummaryData.days) {
        map.set(day.dayKey, { count: day.count, registered: day.registered, pending: day.pending })
      }
    }
    return map
  }, [daySummaryData?.days])

  const lazyAgentIds = useMemo(() => {
    if (groupMode !== 'agent' || agentId) return []
    return [...expandedGroups].filter((k) => k !== UNASSIGNED_AGENT_KEY)
  }, [groupMode, agentId, expandedGroups])

  const lazyDayKeys = useMemo(() => {
    if (groupMode !== 'day') return []
    const singleDayFilter =
      hasDateFilter && !!registeredFrom && registeredFrom === registeredTo
    return [...expandedGroups].filter((dayKey) => {
      if (singleDayFilter && dayKey === registeredFrom) return false
      const group = displayGroups.find((g) => g.key === dayKey)
      if (!group) return true
      if (group.clients.length > 0) return false
      return true
    })
  }, [groupMode, expandedGroups, displayGroups, hasDateFilter, registeredFrom, registeredTo])

  const lazyAgentQueries = useQueries({
    queries: lazyAgentIds.map((id) => ({
      queryKey: [
        'clients',
        'agent-group',
        id,
        { search, batchId, registeredFrom, registeredTo, effectiveLimit, pipelineFilter },
      ],
      queryFn: () =>
        getClients({
          ...clientsFilterParams,
          agentId: id,
          page: 1,
          limit: effectiveLimit,
          sortBy: 'activity',
          includePipeline: false,
        }),
      staleTime: 30_000,
    })),
  })

  const lazyDayQueries = useQueries({
    queries: lazyDayKeys.map((dayKey) => ({
      queryKey: [
        'clients',
        'day-group',
        dayKey,
        { search, agentId, batchId, effectiveLimit, pipelineFilter },
      ],
      queryFn: () =>
        getClients({
          ...clientsFilterParams,
          registeredFrom: dayKey,
          registeredTo: dayKey,
          page: 1,
          limit: effectiveLimit,
          sortBy: 'activity',
          includePipeline: false,
        }),
      staleTime: 30_000,
    })),
  })

  const lazyClientsByAgentId = useMemo(() => {
    const map = new Map<string, { clients: ClientListItem[]; isLoading: boolean }>()
    lazyAgentIds.forEach((id, i) => {
      const q = lazyAgentQueries[i]
      map.set(id, {
        clients: q.data?.clients ?? [],
        isLoading: q.isLoading,
      })
    })
    return map
  }, [lazyAgentIds, lazyAgentQueries])

  const lazyClientsByDayKey = useMemo(() => {
    const map = new Map<string, { clients: ClientListItem[]; isLoading: boolean }>()
    lazyDayKeys.forEach((dayKey, i) => {
      const q = lazyDayQueries[i]
      map.set(dayKey, {
        clients: q.data?.clients ?? [],
        isLoading: q.isLoading,
      })
    })
    return map
  }, [lazyDayKeys, lazyDayQueries])

  const dayGroupsPartial = groupMode === 'day' && !useDaySummary && total > effectiveLimit

  const expandStatusGroups = (groupKeys: string[]) => {
    setPipelineFilter('')
    setGroupMode('status')
    setExpandedGroups(new Set(groupKeys))
    setPage(1)
  }

  const statusChipRegisteredActive =
    groupMode === 'status' &&
    expandedGroups.has(STATUS_GROUP_REGISTERED) &&
    !expandedGroups.has(STATUS_GROUP_PENDING)
  const statusChipPendingActive =
    groupMode === 'status' &&
    expandedGroups.has(STATUS_GROUP_PENDING) &&
    !expandedGroups.has(STATUS_GROUP_REGISTERED)
  const statusChipAssignedActive =
    groupMode === 'status' &&
    expandedGroups.has(STATUS_GROUP_PENDING) &&
    expandedGroups.has(STATUS_GROUP_REGISTERED)

  useEffect(() => {
    if (agentId && groupMode === 'agent') setGroupMode('')
    if (!agentId && groupMode === 'status') setGroupMode('')
  }, [agentId, groupMode])

  useEffect(() => {
    if (!effectiveGroupBy) {
      setExpandedGroups(new Set())
      return
    }
    if (groupMode === 'status') {
      setExpandedGroups((prev) => {
        if (prev.size > 0) {
          const validKeys = new Set(displayGroups.map((g) => g.key))
          return new Set([...prev].filter((k) => validKeys.has(k)))
        }
        return new Set([STATUS_GROUP_PENDING])
      })
      return
    }
    if (groupMode === 'week' || groupMode === 'month') {
      setExpandedGroups((prev) => {
        if (prev.size > 0) {
          const validKeys = new Set(displayGroups.map((g) => g.key))
          return new Set([...prev].filter((k) => validKeys.has(k)))
        }
        return displayGroups.length > 0 ? new Set([displayGroups[0].key]) : new Set()
      })
      return
    }
    if (groupMode === 'day') {
      setExpandedGroups((prev) => {
        const validKeys = new Set(displayGroups.map((g) => g.key))
        return new Set([...prev].filter((k) => validKeys.has(k)))
      })
      return
    }
    setExpandedGroups((prev) => {
      const validKeys = new Set(displayGroups.map((g) => g.key))
      return new Set([...prev].filter((k) => validKeys.has(k)))
    })
  }, [effectiveGroupBy, groupMode, displayGroups, registeredFrom, registeredTo, datePresetIntent])

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const expandAllGroups = () => {
    setExpandedGroups(new Set(displayGroups.map((g) => g.key)))
  }

  const collapseAllGroups = () => {
    setExpandedGroups(new Set())
  }

  const activeFilterChips: { key: string; label: string; onClear: () => void }[] = []
  if (search) {
    activeFilterChips.push({
      key: 'search',
      label: `Búsqueda: "${search}"`,
      onClear: () => { setSearch(''); setPage(1) },
    })
  }
  if (agentId && selectedAgent) {
    activeFilterChips.push({
      key: 'agent',
      label: `Agente: ${selectedAgent.name}`,
      onClear: () => { setAgentId(''); setPage(1) },
    })
  }
  if (batchId && selectedBatch) {
    activeFilterChips.push({
      key: 'batch',
      label: `Lote: ${selectedBatch.filename.replace(/\.[^.]+$/, '')}`,
      onClear: () => { setBatchId(''); setPage(1) },
    })
  }
  if (pipelineFilter) {
    const pipelineLabel = getPipelineFilterLabel(pipelineFilter) ?? pipelineFilter
    activeFilterChips.push({
      key: 'pipeline',
      label: isFunnelChipFilter(pipelineFilter)
        ? `Embudo: ${pipelineLabel}`
        : `Estado: ${pipelineLabel}`,
      onClear: () => {
        setPipelineFilter('')
        setPage(1)
      },
    })
  }
  if (hasDateFilter) {
    activeFilterChips.push({
      key: 'dates',
      label: `Actividad: ${activityFilterChipLabel(registeredFrom, registeredTo, datePresetIntent)}`,
      onClear: clearDateFilter,
    })
  }

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 text-sm mt-1">
            {hasDateFilter ? (
              <>
                <span className="font-semibold text-gray-700">{total}</span>
                {' empresa'}
                {total === 1 ? '' : 's'}
                {' con última actividad en el período'}
                {hasActiveFilters && ' · filtrados'}
              </>
            ) : selectedBatch ? (
              <>
                <span className="font-semibold text-gray-700">{total}</span>
                {' de '}
                <span className="font-semibold text-gray-700">{selectedBatch.totalRecords}</span>
                {' clientes en '}
                <span className="text-gray-600 italic">{selectedBatch.filename}</span>
                {hasActiveFilters && ` · filtrados`}
              </>
            ) : (
              <>{total} clientes en total{hasActiveFilters && ' · filtrados'}</>
            )}
          </p>
          {activeFilterChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {activeFilterChips.map((chip) => (
                <span
                  key={chip.key}
                  className={`inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-full text-xs font-medium border ${
                    chip.key === 'dates'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-blue-50 text-blue-800 border-blue-200'
                  }`}
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={chip.onClear}
                    className={`p-0.5 rounded-full transition-colors ${
                      chip.key === 'dates'
                        ? 'hover:bg-emerald-100 text-emerald-600'
                        : 'hover:bg-blue-100 text-blue-600'
                    }`}
                    aria-label={`Quitar filtro ${chip.label}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        {returnToReports && (
          <button
            type="button"
            onClick={() =>
              navigate(
                buildReportsUrlFromClientsContext({
                  agentId: agentId || undefined,
                  registeredFrom: registeredFrom || undefined,
                  registeredTo: registeredTo || undefined,
                })
              )
            }
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors shrink-0"
          >
            <ArrowLeft size={15} />
            Volver a reportes
            {pipelineFilter ? (
              <span className="text-gray-400 font-normal">
                ({getPipelineFilterLabel(pipelineFilter)})
              </span>
            ) : null}
          </button>
        )}
        {returnToDashboard && (
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors shrink-0"
          >
            <ArrowLeft size={15} />
            Volver al inicio
            {pipelineFilter ? (
              <span className="text-gray-400 font-normal">
                ({getPipelineFilterLabel(pipelineFilter)})
              </span>
            ) : null}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm space-y-3">
          <div className="relative w-full">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="input pl-9 py-2 w-full"
              placeholder="Buscar por RUC, razón social, contacto..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {agents.length > 0 && (
              <select
                className="input w-auto min-w-[150px] py-2"
                value={agentId}
                onChange={(e) => {
                  const newAgentId = e.target.value
                  setAgentId(newAgentId)
                  setGroupMode((prev) => {
                    if (newAgentId && prev === 'agent') return ''
                    if (!newAgentId && prev === 'status') return ''
                    return prev
                  })
                  setPage(1)
                }}
              >
                <option value="">Todos los agentes</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}

            {batches.length > 0 && (
              <select
                className="input w-auto min-w-[170px] py-2"
                value={batchId}
                onChange={(e) => { setBatchId(e.target.value); setPage(1) }}
              >
                <option value="">Todos los lotes</option>
                {batches.map((b, i) => (
                  <option key={b.id} value={b.id}>
                    {i === 0 ? '★ ' : ''}{b.filename.replace(/\.[^.]+$/, '')} · {format(new Date(b.createdAt), 'd MMM yy', { locale: es })}
                  </option>
                ))}
              </select>
            )}

            <div className="w-auto min-w-[170px]">
              <FilterDropdown<ClientsOperationalFilter>
                value={
                  PIPELINE_FILTER_OPERATIONAL.some((f) => f.value === pipelineFilter)
                    ? (pipelineFilter as ClientsOperationalFilter)
                    : ''
                }
                onChange={(v) => {
                  setPipelineFilter(v)
                  setPage(1)
                }}
                options={PIPELINE_FILTER_OPERATIONAL}
                getDescription={getClientsFilterTitle}
              />
            </div>

            <ViewModePicker
              groupMode={groupMode}
              agentId={agentId}
              onChange={(mode) => {
                setGroupMode(mode)
                setExpandedGroups(new Set())
                setPage(1)
              }}
            />

            <DateFilterPicker
              registeredFrom={registeredFrom}
              registeredTo={registeredTo}
              groupMode={groupMode}
              datePresetIntent={datePresetIntent}
              onApply={applyDateFilter}
              onClear={clearDateFilter}
            />

            <ColumnVisibilityPicker
              visibleColumns={visibleColumns}
              onChange={setVisibleColumns}
            />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-500">Embudo comercial</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Empresas con última actividad en el período · estado actual del embudo
                  </p>
                  <p
                    className={`text-[11px] mt-0.5 font-medium ${
                      hasDateFilter ? 'text-gray-500' : 'text-amber-600'
                    }`}
                  >
                    {funnelPeriodLabel(registeredFrom, registeredTo, datePresetIntent)}
                  </p>
                </div>
                {funnelTotal != null && (
                  <p className="text-xs text-gray-500 shrink-0">
                    <span className="font-semibold text-gray-700">{funnelTotal}</span> en embudo
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 overflow-x-auto">
                {pipelineLoading && !pipelineCounts ? (
                  <ClientsFunnelSkeleton />
                ) : (
                AGENT_PIPELINE_FUNNEL.map((f) => {
                  const isActive = pipelineFilter === f.key
                  const count = pipelineCounts?.[f.key] ?? 0
                  return (
                    <button
                      key={f.key}
                      type="button"
                      title={`${f.label} (${f.aclaracion})`}
                      onClick={() => {
                        setPipelineFilter(isActive ? '' : f.key)
                        setPage(1)
                      }}
                      className={`flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-[5.5rem] text-center rounded-lg text-xs font-medium transition-colors border shrink-0 ${
                        isActive
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800 ring-2 ring-offset-1 ring-emerald-400'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-xs leading-tight max-w-[8rem] text-balance">
                        {f.shortLabel ?? f.label}
                      </span>
                      <span className="text-[10px] font-semibold opacity-80">
                        {f.aclaracion}
                      </span>
                      <span className={`text-sm font-bold tabular-nums ${count === 0 ? 'text-gray-400' : ''}`}>
                        {count}
                      </span>
                    </button>
                  )
                })
                )}
              </div>
            </div>

            {agentId && assignmentSummary && (
              <div className="flex flex-wrap gap-2 shrink-0 lg:pt-5">
                <button
                  type="button"
                  onClick={() =>
                    expandStatusGroups([STATUS_GROUP_PENDING, STATUS_GROUP_REGISTERED])
                  }
                  className={`flex flex-col items-center gap-0.5 px-4 py-2 min-w-[5.5rem] rounded-lg border text-center transition-colors ${
                    statusChipAssignedActive
                      ? 'border-slate-400 bg-slate-100 text-slate-900 ring-2 ring-offset-1 ring-slate-400'
                      : 'border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Asignadas</span>
                  <span className="text-lg font-bold tabular-nums text-slate-800">
                    {assignmentSummary.assignedCompanies}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => expandStatusGroups([STATUS_GROUP_REGISTERED])}
                  className={`flex flex-col items-center gap-0.5 px-4 py-2 min-w-[5.5rem] rounded-lg border text-center transition-colors ${
                    statusChipRegisteredActive
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800 ring-2 ring-offset-1 ring-emerald-400'
                      : 'border-emerald-200 bg-emerald-50/50 text-emerald-800 hover:bg-emerald-50'
                  }`}
                >
                  <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">Registradas</span>
                  <span className="text-lg font-bold tabular-nums">
                    {assignmentSummary.registeredCompanies}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => expandStatusGroups([STATUS_GROUP_PENDING])}
                  className={`flex flex-col items-center gap-0.5 px-4 py-2 min-w-[5.5rem] rounded-lg border text-center transition-colors ${
                    statusChipPendingActive
                      ? 'bg-amber-50 border-amber-300 text-amber-800 ring-2 ring-offset-1 ring-amber-400'
                      : 'border-amber-200 bg-amber-50/50 text-amber-800 hover:bg-amber-50'
                  }`}
                >
                  <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">Pendientes</span>
                  <span className="text-lg font-bold tabular-nums">
                    {assignmentSummary.pendingCompanies}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        {isLoading && !data ? (
          <ClientsTableSkeleton />
        ) : clients.length === 0 && !effectiveGroupBy ? (
          <div className="p-12 text-center text-gray-400">
            <User size={40} className="mx-auto mb-2" />
            {hasDateFilter ? (
              <p>Ningún registro en este período. Prueba &apos;Este mes&apos; o quita el filtro de fecha.</p>
            ) : (
              <p>No se encontraron clientes</p>
            )}
          </div>
        ) : effectiveGroupBy ? (
          <div className="p-3 space-y-3">
            {total > effectiveLimit && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {groupMode === 'agent' ? (
                  <>
                    Los totales por agente son completos. Al expandir, la tabla muestra hasta {effectiveLimit}{' '}
                    empresas del listado cargado. Filtra por agente para ver el listado completo.
                  </>
                ) : groupMode === 'day' ? (
                  <>
                    {useDaySummary
                      ? 'Expande un día para cargar hasta '
                      : 'Los conteos en cada día pueden ser parciales. Expande un día para cargar hasta '}
                    {effectiveLimit} empresas de ese día con los filtros actuales.
                  </>
                ) : (
                  <>
                    Mostrando las primeras {effectiveLimit} empresas del filtro actual. Refina los filtros para
                    ver grupos completos.
                  </>
                )}
              </p>
            )}
            {displayGroups.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                <User size={40} className="mx-auto mb-2" />
                {hasDateFilter ? (
                  <p>Ningún registro en este período. Prueba otro rango o quita el filtro de fecha.</p>
                ) : (
                  <p>No hay grupos para mostrar</p>
                )}
              </div>
            ) : (
              <>
            <div className="flex justify-end gap-3 text-sm">
              <button
                type="button"
                onClick={expandAllGroups}
                className="text-emerald-700 hover:text-emerald-900 font-medium"
              >
                Expandir todos
              </button>
              <button
                type="button"
                onClick={collapseAllGroups}
                className="text-gray-500 hover:text-gray-700 font-medium"
              >
                Colapsar todos
              </button>
            </div>
            <div className="space-y-2">
              {displayGroups.map((group) => {
                const expanded = expandedGroups.has(group.key)
                const lazyAgentEntry =
                  groupMode === 'agent' && !agentId && group.key !== UNASSIGNED_AGENT_KEY
                    ? lazyClientsByAgentId.get(group.key)
                    : undefined
                const lazyDayEntry =
                  groupMode === 'day' ? lazyClientsByDayKey.get(group.key) : undefined
                const lazyEntry = lazyDayEntry ?? lazyAgentEntry
                const lazyClients = lazyEntry?.clients ?? []
                const groupClients =
                  lazyEntry && lazyClients.length > 0 && !lazyEntry.isLoading
                    ? lazyClients
                    : group.clients
                const groupRefreshing = expanded && !!lazyEntry?.isLoading && groupClients.length > 0
                const groupLoading = expanded && !!lazyEntry?.isLoading && groupClients.length === 0
                const headerClients =
                  lazyEntry && lazyClients.length > 0 && !lazyEntry.isLoading
                    ? lazyClients
                    : group.clients
                return (
                  <div key={group.key} className="rounded-lg border border-gray-200 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      className={`w-full flex items-center gap-2 px-4 py-3 border-l-4 ${group.borderClass} bg-slate-50 text-left hover:bg-slate-100 transition-colors`}
                    >
                      {expanded ? (
                        <ChevronDown size={18} className="text-gray-500 shrink-0" />
                      ) : (
                        <ChevronRight size={18} className="text-gray-500 shrink-0" />
                      )}
                      {groupMode === 'agent' ? (
                        <AgentGroupHeader
                          group={group}
                          stats={agentStatsById.get(group.key)}
                        />
                      ) : groupMode === 'day' ? (
                        <DayGroupHeader
                          group={group}
                          loadedClients={headerClients}
                          isPartial={dayGroupsPartial}
                          summary={useDaySummary ? daySummaryByKey.get(group.key) : undefined}
                        />
                      ) : (
                        <>
                          <span className="font-medium text-gray-900">{group.title}</span>
                          <span className="text-sm text-gray-500">
                            {group.clients.length} empresa{group.clients.length === 1 ? '' : 's'}
                          </span>
                        </>
                      )}
                    </button>
                    {expanded && (
                      <div className="overflow-x-auto border-t border-gray-100">
                        {groupLoading ? (
                          <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
                            <Loader2 size={20} className="animate-spin" />
                            <span className="text-sm">Cargando empresas…</span>
                          </div>
                        ) : (
                          <>
                            {groupRefreshing && (
                              <div className="flex items-center gap-2 px-4 py-2 text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
                                <Loader2 size={14} className="animate-spin" />
                                Actualizando…
                              </div>
                            )}
                          <table className="w-full min-w-[1000px] text-sm">
                            <ClientsTableHead
                              showAgentColumn={showAgentColumn}
                              showBatchColumn={showBatchColumn}
                              visibleColumns={visibleColumns}
                            />
                            <tbody className="divide-y divide-gray-100">
                              {groupClients.map((c) => (
                                <ClientTableRow
                                  key={c.id}
                                  client={c}
                                  showAgentColumn={showAgentColumn}
                                  showBatchColumn={showBatchColumn}
                                  visibleColumns={visibleColumns}
                                  onOpenRecord={openRecord}
                                  hasDateFilter={hasDateFilter}
                                  registeredFrom={registeredFrom}
                                  registeredTo={registeredTo}
                                  datePresetIntent={datePresetIntent}
                                />
                              ))}
                            </tbody>
                          </table>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
              </>
            )}
          </div>
        ) : (
          <>
            {showFlatPagination && (
              <div className="px-3 py-2 border-b border-gray-100">
                <ClientsPaginationBar
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setPage}
                  onPageSizeChange={handlePageSizeChange}
                />
              </div>
            )}
            <table className="w-full min-w-[1000px] text-sm">
              <ClientsTableHead
                showAgentColumn={showAgentColumn}
                showBatchColumn={showBatchColumn}
                visibleColumns={visibleColumns}
              />
              <tbody className="divide-y divide-gray-100">
                {clients.map((c) => (
                  <ClientTableRow
                    key={c.id}
                    client={c}
                    showAgentColumn={showAgentColumn}
                    showBatchColumn={showBatchColumn}
                    visibleColumns={visibleColumns}
                    onOpenRecord={openRecord}
                    hasDateFilter={hasDateFilter}
                    registeredFrom={registeredFrom}
                    registeredTo={registeredTo}
                    datePresetIntent={datePresetIntent}
                  />
                ))}
              </tbody>
            </table>
            {showFlatPagination && (
              <div className="px-3 py-2 border-t border-gray-100">
                <ClientsPaginationBar
                  page={page}
                  pageSize={pageSize}
                  total={total}
                  onPageChange={setPage}
                  onPageSizeChange={handlePageSizeChange}
                />
              </div>
            )}
          </>
        )}
      </div>

      {recordModal && (
        <ClientRecordModal
          clientId={recordModal.clientId}
          agentFilterId={agentId || undefined}
          initialFocus={recordModal.initialFocus}
          onClose={() => setRecordModal(null)}
        />
      )}
    </div>
  )
}
