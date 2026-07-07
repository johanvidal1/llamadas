import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getClients, getClient, logCall, updateCall, updateClient, updateContact, getCallbacks, updateCallback, downloadImportExport } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CalendarClock,
  Save,
  User,
  Clock,
  AlertCircle,
  Phone,
  Search,
  PhoneCall,
  History,
  LayoutGrid,
  List,
  AlignJustify,
  Copy,
  CheckCircle2,
  X,
} from 'lucide-react'
import { dedupeMobileLinesByNumber } from '../lib/mobileLine'
import CallModal from '../components/CallModal'
import CompleteCallbackModal, { type CompleteConfirm } from '../components/CompleteCallbackModal'
import DispositionSelector from '../components/DispositionSelector'
import { ColaFilterDropdown } from '../components/ColaFilterDropdown'
import { format, isPast, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { StatusBadge, DISPOSITION_CONFIG, getDispositionBorderColor, DispositionBadge } from '../components/StatusBadge'
import {
  SALES_FUNNEL_STAGES,
  ZERO_PROGRESS_OPTIONS,
  isAgentSelectableDisposition,
  DISPOSITION_COLORS,
  getDispositionLabel,
  getAclaracionForDisposition,
  getResponseOption,
  isDefinitiveClosureDisposition,
  requiresCallbackDate,
  isHiddenFromAgentQueue,
} from '../config/responseOptions'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientSummary {
  id: string
  ruc: string
  razonSocial?: string
  status: string
  lastDisposition?: string | null
  lastAclaracion?: string | null
  contacts: {
    id?: string
    nombre: string
    tipoContacto?: string
    telefono?: string
    email?: string
    dni?: string
    _count?: { callLogs: number }
  }[]
  importBatch?: { id: string; filename: string; createdAt: string }
}

interface CallLogEntry {
  id: string
  agentId: string
  disposition: string
  aclaracion?: string
  notes?: string
  calledAt: string
  updatedAt?: string
  agent: { id: string; name: string }
  contact?: { id: string; nombre: string; tipoContacto?: string }
}

interface CallLogSnapshot {
  disposition: string
  aclaracion?: string
  notes?: string
  schedDate: string
  schedTime: string
  schedNotes?: string
}

interface ClientDetail {
  id: string
  ruc: string
  razonSocial?: string
  importStatus?: string
  fechaConsulta?: string
  plan?: string
  notes?: string
  status: string
  importBatch?: { id: string; filename: string; createdAt: string }
  contacts: { id: string; nombre: string; tipoContacto?: string; telefono?: string; email?: string; dni?: string }[]
  callLogs: CallLogEntry[]
  callbacks: { id: string; callLogId?: string; scheduledAt: string; notes?: string; completed: boolean }[]
  mobileLines: { id: string; numeroTelefono?: string; estadoLinea?: string; plan?: string; estado?: string }[]
}

interface Callback {
  id: string
  callLogId?: string
  scheduledAt: string
  notes?: string
  company: { id: string; ruc: string; razonSocial?: string; contacts: { nombre: string; telefono?: string }[] }
  callLog?: { contact?: { id: string; nombre: string; telefono?: string; tipoContacto?: string } | null }
  agent: { id: string; name: string }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function callbackColor(dt: string): string {
  const d = new Date(dt)
  if (isPast(d)) return 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100'
  if (isToday(d)) return 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
  return 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100'
}

function contactNameParts(nombre?: string) {
  const parts = (nombre ?? '').trim().split(/\s+/).filter(Boolean)
  return {
    primerNombre: parts[0] ?? '',
    segundoNombre: parts[1] ?? '',
    tercerNombre: parts[2] ?? '',
  }
}

function truncateGraphemes(text: string, max: number): string {
  if (!text) return text
  const chars = [...text]
  if (chars.length <= max) return text
  return chars.slice(0, max - 1).join('') + '…'
}

function callLogDisplayTime(log: Pick<CallLogEntry, 'calledAt' | 'updatedAt'>): Date {
  return new Date(log.updatedAt ?? log.calledAt)
}

function callLogWasEdited(log: Pick<CallLogEntry, 'calledAt' | 'updatedAt'>): boolean {
  if (!log.updatedAt) return false
  return new Date(log.updatedAt).getTime() > new Date(log.calledAt).getTime()
}

function filterCallLogsByHistorialScope(
  logs: CallLogEntry[],
  scope: 'contact' | 'company',
  activeContactId: string | undefined,
  displayContactsCount: number,
): CallLogEntry[] {
  return logs.filter((log) => {
    if (scope === 'company' || displayContactsCount <= 1) return true
    return !log.contact || log.contact.id === activeContactId
  })
}

function sortCallLogsNewestFirst(logs: CallLogEntry[]): CallLogEntry[] {
  return [...logs].sort((a, b) => callLogDisplayTime(b).getTime() - callLogDisplayTime(a).getTime())
}

function HistorialCallLogCard({
  log,
  linkedCb,
  muted = false,
}: {
  log: CallLogEntry
  linkedCb?: { scheduledAt: string; notes?: string; completed: boolean }
  muted?: boolean
}) {
  const cfg = DISPOSITION_CONFIG[log.disposition] ?? {
    label: getDispositionLabel(log.disposition),
    classes: 'bg-gray-100 text-gray-600',
  }
  return (
    <div
      className={`rounded-lg border border-l-4 p-2.5 shadow-sm ${
        muted
          ? 'bg-gray-50/80 border-gray-200/80 opacity-85'
          : 'bg-white border-gray-200'
      } ${getDispositionBorderColor(log.disposition)}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={`badge text-[10px] ${cfg.classes}`}>{cfg.label}</span>
        <div className="flex items-center gap-1 shrink-0">
          {callLogWasEdited(log) && (
            <span className="text-[9px] text-amber-600 font-semibold uppercase tracking-wide">
              Editado
            </span>
          )}
          <span className="text-[10px] text-gray-400 font-mono">
            {format(callLogDisplayTime(log), 'dd/MM/yy HH:mm')}
          </span>
        </div>
      </div>
      {log.contact && (
        <p className={`text-[10px] mb-1 font-medium ${muted ? 'text-blue-500/80' : 'text-blue-600'}`}>
          {log.contact.nombre}{log.contact.tipoContacto ? ` · ${log.contact.tipoContacto}` : ''}
        </p>
      )}
      {log.aclaracion && (
        <p className={`text-[11px] italic mb-1 ${muted ? 'text-gray-400' : 'text-gray-500'}`}>{log.aclaracion}</p>
      )}
      {log.notes && (
        <p className={`text-xs leading-snug mb-1 rounded px-2 py-1 ${muted ? 'text-gray-500 bg-gray-100/80' : 'text-gray-700 bg-gray-50'}`}>
          {log.notes}
        </p>
      )}
      {linkedCb && (
        <div className="mt-1 pt-1 border-t border-dashed border-blue-200 space-y-0.5">
          <div className={`flex items-center gap-1 text-[10px] ${muted ? 'text-blue-500/80' : 'text-blue-600'}`}>
            <CalendarClock size={9} />
            <span className="font-semibold">Agendado:</span>
            <span className="font-mono">{format(new Date(linkedCb.scheduledAt), 'dd/MM/yy HH:mm')}</span>
            {linkedCb.completed && <span className="ml-1 text-green-600 font-semibold">✓</span>}
          </div>
          {linkedCb.notes && (
            <p className={`text-[10px] italic pl-3 leading-snug whitespace-pre-wrap ${muted ? 'text-blue-400' : 'text-blue-500'}`}>
              {linkedCb.notes}
            </p>
          )}
        </div>
      )}
      <p className={`text-[10px] mt-1.5 pt-1 border-t border-gray-100 ${muted ? 'text-gray-400' : 'text-gray-400'}`}>
        — {log.agent.name}
      </p>
    </div>
  )
}

class SaveCancelled extends Error {
  constructor() {
    super('Save cancelled')
    this.name = 'SaveCancelled'
  }
}

function DetailRecordNav({
  variant,
  onFirstRegistered,
  onPrev,
  onNext,
  onFirstEmpty,
  isFirst,
  isLast,
  atFirstRegistered,
  atFirstEmpty,
  noRegistered,
  noEmpty,
}: {
  variant: 'header' | 'footer'
  onFirstRegistered: () => void
  onPrev: () => void
  onNext: () => void
  onFirstEmpty: () => void
  isFirst: boolean
  isLast: boolean
  atFirstRegistered: boolean
  atFirstEmpty: boolean
  noRegistered: boolean
  noEmpty: boolean
}) {
  const isHeader = variant === 'header'
  const btnBase = isHeader
    ? 'flex items-center justify-center p-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors'
    : 'flex items-center justify-center p-2.5 min-h-[44px] min-w-[44px] border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
  const iconSize = isHeader ? 16 : 15

  return (
    <div className={`flex items-center gap-1 ${isHeader ? '' : 'flex-1 sm:flex-none'}`}>
      <button
        type="button"
        onClick={onFirstRegistered}
        disabled={noRegistered || atFirstRegistered}
        className={btnBase}
        title="Primera empresa con registro"
        aria-label="Primera empresa con registro"
      >
        <ChevronsLeft size={iconSize} />
      </button>
      <button
        type="button"
        onClick={onPrev}
        disabled={isFirst}
        className={btnBase}
        title="Anterior"
        aria-label="Anterior"
      >
        <ChevronLeft size={iconSize} />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={isLast}
        className={btnBase}
        title="Siguiente"
        aria-label="Siguiente"
      >
        <ChevronRight size={iconSize} />
      </button>
      <button
        type="button"
        onClick={onFirstEmpty}
        disabled={noEmpty || atFirstEmpty}
        className={btnBase}
        title="Primera empresa pendiente"
        aria-label="Primera empresa pendiente"
      >
        <ChevronsRight size={iconSize} />
      </button>
    </div>
  )
}

function snapshotFromLog(
  log: CallLogEntry,
  callbacks: ClientDetail['callbacks'],
  pendingFallback?: ClientDetail['callbacks'][number]
): CallLogSnapshot {
  const linkedCb = callbacks?.find((c) => c.callLogId === log.id)
  const cb =
    linkedCb ??
    (pendingFallback && !pendingFallback.completed ? pendingFallback : undefined)
  const schedAt = cb ? new Date(cb.scheduledAt) : null
  return {
    disposition: log.disposition,
    aclaracion: log.aclaracion,
    notes: log.notes,
    schedDate: schedAt ? format(schedAt, 'yyyy-MM-dd') : '',
    schedTime: schedAt ? format(schedAt, 'HH:mm') : '09:00',
    schedNotes: cb?.notes,
  }
}

function isAgendaModified(
  snapshot: CallLogSnapshot | null,
  schedDate: string,
  schedTime: string
): boolean {
  if (!snapshot) return schedDate !== ''
  if (!schedDate && snapshot.schedDate) return false
  const time = schedTime || '09:00'
  const snapshotTime = snapshot.schedTime || '09:00'
  if (schedDate !== snapshot.schedDate) return true
  if (schedDate && time !== snapshotTime) return true
  return false
}

function areCallNotesUnchanged(
  callNotes: string,
  snapshotNotes: string | null | undefined
): boolean {
  const notesTrimmed = (callNotes ?? '').trim()
  const snapshotNotesTrimmed = (snapshotNotes ?? '').trim()
  if (notesTrimmed === snapshotNotesTrimmed) return true
  // Non-pinned loads leave callNotes empty while snapshot retains stored notes
  if (!notesTrimmed && snapshotNotesTrimmed) return true
  return false
}

function isResponseOrNotesModified(
  snapshot: CallLogSnapshot | null,
  disposition: string,
  callNotes: string
): boolean {
  if (!snapshot) return false
  if (disposition !== snapshot.disposition) return true
  return !areCallNotesUnchanged(callNotes, snapshot.notes)
}

function isCallLogUnchanged(
  snapshot: CallLogSnapshot | null,
  disposition: string,
  callNotes: string,
  schedDate: string,
  schedTime: string
): boolean {
  if (!snapshot) return false
  if (disposition !== snapshot.disposition) return false
  if (isAgendaModified(snapshot, schedDate, schedTime)) return false
  return areCallNotesUnchanged(callNotes, snapshot.notes)
}

/** Disposition and notes match snapshot; only callback date/time changed — update in place. */
function isRescheduleOnlyChange(
  snapshot: CallLogSnapshot | null,
  disposition: string,
  callNotes: string,
  schedDate: string,
  schedTime: string
): boolean {
  if (!snapshot) return false
  if (disposition !== snapshot.disposition) return false
  if (!isAgendaModified(snapshot, schedDate, schedTime)) return false
  return areCallNotesUnchanged(callNotes, snapshot.notes)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReadField({
  label,
  value,
  className,
  valueClassName,
  mono = true,
}: {
  label: string
  value?: string
  className?: string
  valueClassName?: string
  mono?: boolean
}) {
  return (
    <div className={['flex flex-col gap-0.5', className].filter(Boolean).join(' ')}>
      <span className="text-xs text-gray-500 font-medium">{label}</span>
      <div
        className={[
          'bg-gray-100 border border-gray-200 rounded px-3 py-1.5 text-sm text-gray-700 min-h-[34px] select-all',
          mono ? 'font-mono' : '',
          valueClassName,
        ]
          .filter(Boolean)
          .join(' ')}
        title={value || undefined}
      >
        {value || <span className="text-gray-400 italic font-sans">—</span>}
      </div>
    </div>
  )
}

function ContactPhoneField({
  telefono,
  onChange,
}: {
  telefono: string
  onChange: (v: string) => void
}) {
  const copyPhone = () => {
    if (!telefono) return
    navigator.clipboard.writeText(telefono).then(() => toast.success('Teléfono copiado'))
  }

  return (
    <div className="col-span-full">
      <span className="text-xs text-gray-500 font-medium">Teléfono</span>
      <div className="mt-0.5 flex items-center gap-3 rounded-lg border-2 border-blue-200 bg-blue-50 px-4 py-3">
        <Phone size={20} className="text-blue-600 shrink-0" />
        <input
          type="tel"
          value={telefono}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Sin teléfono — ingresar manualmente"
          className="flex-1 text-2xl font-mono font-semibold text-blue-900 tracking-wide bg-transparent border-none outline-none placeholder:text-blue-300 placeholder:text-base placeholder:font-sans min-w-0"
        />
        {telefono && (
          <>
            <a
              href={`tel:${telefono}`}
              title="Llamar"
              className="text-blue-600 hover:text-blue-800 shrink-0"
            >
              <PhoneCall size={18} />
            </a>
            <button
              type="button"
              onClick={copyPhone}
              title="Copiar teléfono"
              className="flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors shrink-0"
            >
              <Copy size={13} /> Copiar
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function EditField({
  label, value, onChange, placeholder, onBlur, className,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
  onBlur?: () => void; className?: string
}) {
  return (
    <div className={['flex flex-col gap-0.5', className].filter(Boolean).join(' ')}>
      <span className="text-xs text-gray-500 font-medium">{label}</span>
      <input
        type="text"
        className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
      />
    </div>
  )
}

const GRID_STATUS_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'IN_PROGRESS', label: 'En progreso' },
  { value: 'INTERESTED', label: 'Interesados' },
  { value: 'NOT_INTERESTED', label: 'No interesados' },
  { value: 'DO_NOT_CALL', label: 'No llamar' },
] as const

const LIST_COLA_OPTIONS = [
  { value: 'ALL', label: 'Todos' },
  { value: 'FUNNEL', label: 'Embudo comercial' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'VOLVER_A_LLAMAR', label: 'Volver a llamar' },
  { value: 'OTROS', label: 'Otros' },
] as const

type ListCola = (typeof LIST_COLA_OPTIONS)[number]['value']

const COLA_ALL_AGENT_TITLE =
  'Cola activa: pendientes, no contesta, volver a llamar, embudo y venta cerrada. Excluye no interesado, cliente actual, RUC suspendido y sin llegada al decisor.'
const COLA_ALL_ADMIN_TITLE = 'Todas las empresas asignadas.'

const COLA_OPTION_TITLES: Record<
  ListCola,
  { agent: string; admin?: string }
> = {
  ALL: { agent: COLA_ALL_AGENT_TITLE, admin: COLA_ALL_ADMIN_TITLE },
  FUNNEL: {
    agent: 'Empresas en avance comercial (25% a 100%). Usa los chips para filtrar por etapa.',
  },
  PENDING: { agent: 'Sin respuesta registrada aún.' },
  VOLVER_A_LLAMAR: { agent: 'Empresas con seguimiento o callback pendiente.' },
  OTROS: {
    agent:
      'Resto de respuestas 0%: no interesado, no contesta, sin llegada al decisor, RUC suspendido, cliente actual, etc.',
  },
}

function getColaOptionTitle(value: ListCola, isAdmin: boolean): string {
  const entry = COLA_OPTION_TITLES[value]
  if (isAdmin && entry.admin) return entry.admin
  return entry.agent
}

const GRID_STATUS_FILTER_TITLES: Record<
  (typeof GRID_STATUS_FILTERS)[number]['value'],
  string
> = {
  '': COLA_ALL_AGENT_TITLE,
  PENDING: 'Sin respuesta registrada aún.',
  IN_PROGRESS: 'Empresas con actividad en curso (llamadas o seguimiento activo).',
  INTERESTED: 'Empresas con interés comercial registrado.',
  NOT_INTERESTED: 'Empresas marcadas como no interesadas.',
  DO_NOT_CALL: 'Empresas en las que no se debe volver a llamar.',
}

function getGridStatusFilterTitle(value: (typeof GRID_STATUS_FILTERS)[number]['value'], isAdmin: boolean): string {
  if (value === '') return isAdmin ? COLA_ALL_ADMIN_TITLE : COLA_ALL_AGENT_TITLE
  return GRID_STATUS_FILTER_TITLES[value]
}

const VALID_LIST_FILTERS = new Set([
  'ALL',
  'PENDING',
  'VOLVER_A_LLAMAR',
  'OTROS',
  'FUNNEL',
  ...SALES_FUNNEL_STAGES.map((stage) => stage.code),
  ...ZERO_PROGRESS_OPTIONS.map((o) => o.code),
])

const LIST_FILTER_SHORT_LABELS: Partial<Record<string, string>> = {
  ESPERA_RESPUESTA: 'Espera resp. final',
  DISCUSION_PROPUESTA: 'Discusión propuesta',
  PROPUESTA_PRESENTADA: 'Propuesta presentada',
  NO_CONTESTA: 'No contesta',
  VOLVER_A_LLAMAR: 'Volver a llamar',
  SIN_LLEGADA_DECISOR: 'Sin llegada',
  RUC_SUSPENDIDO: 'RUC suspendido',
  CLIENTE_ACTUAL: 'Cliente actual',
  NO_INTERESADO: 'No interesado',
}

const LIST_FILTERS_FUNNEL = SALES_FUNNEL_STAGES.map((stage) => {
  const label = stage.label.charAt(0) + stage.label.slice(1).toLowerCase()
  return {
    value: stage.code,
    label,
    shortLabel: LIST_FILTER_SHORT_LABELS[stage.code] ?? label,
    aclaracion: stage.aclaracion,
    fullLabel: stage.label,
  }
})

function parseListFiltersFromUrl(filterParam: string): { cola: ListCola; drilldown: string | null } {
  if (!filterParam) return { cola: 'ALL', drilldown: null }
  if (filterParam === 'FUNNEL') return { cola: 'FUNNEL', drilldown: null }
  if (filterParam === 'ALL') return { cola: 'ALL', drilldown: null }
  if (filterParam === 'PENDING' || filterParam === 'VOLVER_A_LLAMAR' || filterParam === 'OTROS') {
    return { cola: filterParam, drilldown: null }
  }
  if (VALID_LIST_FILTERS.has(filterParam)) return { cola: 'FUNNEL', drilldown: filterParam }
  return { cola: 'ALL', drilldown: null }
}

function listFiltersToUrl(cola: ListCola, drilldown: string | null): string | null {
  if (drilldown) return drilldown
  if (cola === 'ALL') return null
  if (cola === 'FUNNEL') return 'FUNNEL'
  return cola
}

function getListFilterLabel(cola: ListCola, drilldown: string | null): string | undefined {
  if (drilldown) {
    return (
      LIST_FILTERS_FUNNEL.find((f) => f.value === drilldown)?.label ??
      LIST_FILTER_SHORT_LABELS[drilldown] ??
      getDispositionLabel(drilldown)
    )
  }
  return LIST_COLA_OPTIONS.find((f) => f.value === cola)?.label
}

function getListApiParams(cola: ListCola, drilldown: string | null) {
  if (drilldown) return { disposition: drilldown }
  if (cola === 'PENDING') return { status: 'PENDING' as const }
  if (cola === 'ALL') return {}
  return { disposition: cola }
}

function listChipColorClasses(value: string): string {
  if (value === 'PENDING') return 'bg-gray-100 text-gray-700 border-gray-300'
  if (value === 'OTROS') return 'bg-slate-100 text-slate-700 border-slate-300'
  const disp = DISPOSITION_COLORS[value]
  return disp ? disp.split(' border-l-')[0] : 'bg-white text-gray-600 border-gray-300'
}

const AGENDADOS_SPLIT_STORAGE_KEY = 'myLeads-agendadosSplitPct'
const AGENDADOS_SPLIT_DEFAULT = 38
const AGENDADOS_SPLIT_MIN = 20
const AGENDADOS_SPLIT_MAX = 75

function clampAgendadosSplit(pct: number) {
  return Math.min(AGENDADOS_SPLIT_MAX, Math.max(AGENDADOS_SPLIT_MIN, pct))
}

function useIsLg() {
  const [isLg, setIsLg] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const handler = (e: MediaQueryListEvent) => setIsLg(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isLg
}

function countCompanies(list: ClientSummary[]) {
  return list.length
}

function batchMetricsLabel(companyCount: number, contactCount: number) {
  return `${companyCount} empresas · ${contactCount} contactos`
}

function batchLabelShort(batch: { filename: string }) {
  return batch.filename.replace(/\.[^.]+$/, '')
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function MyLeads() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const isLg = useIsLg()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialFilter = searchParams.get('filter') ?? ''
  const initialBatchId = searchParams.get('batchId') ?? ''
  const initialCompanyId = searchParams.get('companyId') ?? ''
  const initialContactId = searchParams.get('contactId') ?? ''
  const hasListDeepLink = initialFilter !== '' && VALID_LIST_FILTERS.has(initialFilter)
  const initialListFilters = parseListFiltersFromUrl(initialFilter)
  const initialFromDashboard = searchParams.get('from') === 'dashboard'

  // ── View toggle (persisted)
  const [viewMode, setViewMode] = useState<'detail' | 'grid' | 'list'>(() => {
    if (hasListDeepLink) return 'list'
    return (localStorage.getItem('myLeadsView') as 'detail' | 'grid' | 'list') || 'detail'
  })
  const [returnToView, setReturnToView] = useState<'list' | 'grid' | null>(null)
  const [returnToDashboard, setReturnToDashboard] = useState(initialFromDashboard)
  const switchView = (mode: 'detail' | 'grid' | 'list', opts?: { persist?: boolean }) => {
    setViewMode(mode)
    if (opts?.persist !== false) {
      localStorage.setItem('myLeadsView', mode)
    }
  }

  // ── List view state
  const [listSearch, setListSearch] = useState('')
  const [listCola, setListCola] = useState<ListCola>(initialListFilters.cola)
  const [listDrilldown, setListDrilldown] = useState<string | null>(initialListFilters.drilldown)

  // ── Grid view state
  const [gridSearch, setGridSearch] = useState('')
  const [gridStatus, setGridStatus] = useState('')
  const [gridPage, setGridPage] = useState(1)
  const [selectedClient, setSelectedClient] = useState<{ id: string; ruc: string; razonSocial?: string; contacts?: { id?: string; nombre: string; tipoContacto?: string; telefono?: string }[] } | null>(null)

  // ── Batch filter (shared between detail + grid views)
  const [selectedBatchId, setSelectedBatchId] = useState<string>(initialBatchId)

  // ── Agendados sidebar tab
  const [cbTab, setCbTab] = useState<'own' | 'team'>('own')
  const [completeConfirm, setCompleteConfirm] = useState<CompleteConfirm | null>(null)
  const [historialScope, setHistorialScope] = useState<'contact' | 'company'>('contact')
  const [showPreviousHistorial, setShowPreviousHistorial] = useState(false)
  const [mobilePanelTab, setMobilePanelTab] = useState<'agendados' | 'historial'>('agendados')

  // ── Agendados / Historial vertical split (persisted)
  const [agendadosSplitPct, setAgendadosSplitPct] = useState(() => {
    const saved = localStorage.getItem(AGENDADOS_SPLIT_STORAGE_KEY)
    if (saved !== null) {
      const n = parseFloat(saved)
      if (!Number.isNaN(n)) return clampAgendadosSplit(n)
    }
    return AGENDADOS_SPLIT_DEFAULT
  })
  const rightPanelRef = useRef<HTMLDivElement>(null)
  const isDraggingSplitRef = useRef(false)
  const agendadosSplitPctRef = useRef(agendadosSplitPct)
  agendadosSplitPctRef.current = agendadosSplitPct

  const handleSplitMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingSplitRef.current = true
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSplitRef.current || !rightPanelRef.current) return
      const rect = rightPanelRef.current.getBoundingClientRect()
      const pct = ((e.clientY - rect.top) / rect.height) * 100
      const clamped = clampAgendadosSplit(pct)
      agendadosSplitPctRef.current = clamped
      setAgendadosSplitPct(clamped)
    }

    const handleMouseUp = () => {
      if (!isDraggingSplitRef.current) return
      isDraggingSplitRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      localStorage.setItem(AGENDADOS_SPLIT_STORAGE_KEY, String(agendadosSplitPctRef.current))
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [])

  const [currentIndex, setCurrentIndex] = useState(0)
  const [activeContactIdx, setActiveContactIdx] = useState(0)
  const [editPlan, setEditPlan] = useState('')
  const [editRazonSocial, setEditRazonSocial] = useState('')
  const persistedRazonSocialRef = useRef('')
  const razonSocialSavingRef = useRef(false)
  const [latestLogSnapshot, setLatestLogSnapshot] = useState<CallLogSnapshot | null>(null)
  const [disposition, setDisposition] = useState('')
  const [callNotes, setCallNotes] = useState('')
  const [schedDate, setSchedDate] = useState('')
  const [schedTime, setSchedTime] = useState('')
  const [editingCallLogId, setEditingCallLogId] = useState<string | null>(null)
  const pendingCallLogIdRef = useRef<string | null>(null)
  const pendingContactIdRef = useRef<string | null>(null)
  const pendingContactIdxRef = useRef<number | null>(null)
  const needsContactResolveRef = useRef(false)
  const companyDeepLinkHandledRef = useRef(false)
  const [editTelefono, setEditTelefono] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editDni, setEditDni] = useState('')
  const [respuestaError, setRespuestaError] = useState(false)
  const [agendaConfirm, setAgendaConfirm] = useState<{ dateStr: string } | null>(null)
  const agendaConfirmResolveRef = useRef<((conservar: boolean) => void) | null>(null)
  const [exporting, setExporting] = useState(false)
  const savedContactRef = useRef<{ id: string; telefono: string; email: string; dni: string } | null>(null)
  const lastSyncedContactKey = useRef<string | null>(null)
  const contactTabRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Load ALL clients without batch filter — used only to derive available batches
  const { data: allClientsData } = useQuery({
    queryKey: ['clients', 'my-leads', 'all-for-batches'],
    queryFn: () => getClients({ limit: 500 }),
  })

  // Load clients for current batch (server-side filter) — used for detail view navigation
  const { data: clientsData, isLoading: loadingList } = useQuery({
    queryKey: ['clients', 'my-leads', 'nav', selectedBatchId],
    queryFn: () => getClients({ limit: 500, batchId: selectedBatchId || undefined }),
  })

  // List view: server-side disposition / pending filters
  const { data: listData, isLoading: loadingListView } = useQuery({
    queryKey: ['clients', 'my-leads', 'list', selectedBatchId, listCola, listDrilldown],
    queryFn: () =>
      getClients({
        limit: 500,
        batchId: selectedBatchId || undefined,
        ...getListApiParams(listCola, listDrilldown),
      }),
    enabled: viewMode === 'list',
  })

  // Paginated + filtered list (for grid view)
  const { data: gridData, isLoading: loadingGrid, isFetching: fetchingGrid } = useQuery({
    queryKey: ['clients', 'my-leads', 'grid', gridSearch, gridStatus, gridPage, selectedBatchId],
    queryFn: () =>
      getClients({
        search: gridSearch || undefined,
        status: gridStatus || undefined,
        batchId: selectedBatchId || undefined,
        page: gridPage,
        limit: 30,
      }),
    enabled: viewMode === 'grid',
  })

  // All loaded clients (unfiltered) — used only for batch derivation
  const allClients: ClientSummary[] = allClientsData?.clients ?? []
  const countContacts = (list: ClientSummary[]) =>
    list.reduce((sum, c) => sum + (c.contacts?.length ?? 0), 0)
  const allContactCount = countContacts(allClients)

  // Derive unique batches sorted newest first
  const batches = Array.from(
    new Map(
      allClients
        .filter((c) => c.importBatch)
        .map((c) => [c.importBatch!.id, c.importBatch!])
    ).values()
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  // Clients for detail view navigation — server-filtered by batch
  const rawNavClients: ClientSummary[] = clientsData?.clients ?? []
  const clients: ClientSummary[] = useMemo(() => {
    if (isAdmin) return rawNavClients
    return rawNavClients.filter((c) => !isHiddenFromAgentQueue(c.lastDisposition))
  }, [rawNavClients, isAdmin])
  const hiddenNavCount = isAdmin ? 0 : rawNavClients.length - clients.length
  const total = clients.length
  const currentClient = clients[currentIndex]

  // Load detail for current client — placeholderData keeps previous record visible during nav
  const { data: clientDetail, isFetching: fetchingDetail } = useQuery({
    queryKey: ['client-detail', currentClient?.id],
    queryFn: () => getClient(currentClient!.id),
    enabled: !!currentClient?.id,
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
  })
  const detail = clientDetail as ClientDetail | undefined
  const displayDetail = detail
  const visibleMobileLines = useMemo(
    () => dedupeMobileLinesByNumber(displayDetail?.mobileLines ?? []),
    [displayDetail?.mobileLines]
  )
  const showingStale = Boolean(displayDetail && currentClient && displayDetail.id !== currentClient.id)
  const isInitialDetailLoad = Boolean(
    !displayDetail && fetchingDetail && !loadingList && clients.length > 0
  )

  // Prefetch adjacent clients for instant prev/next navigation
  useEffect(() => {
    if (!currentClient?.id || clients.length === 0) return
    const prefetchClient = (id: string) => {
      void qc.prefetchQuery({
        queryKey: ['client-detail', id],
        queryFn: () => getClient(id),
        staleTime: 30_000,
      })
    }
    if (currentIndex > 0) prefetchClient(clients[currentIndex - 1].id)
    if (currentIndex < clients.length - 1) prefetchClient(clients[currentIndex + 1].id)
  }, [currentClient?.id, currentIndex, clients, qc])

  // Prefer detail contacts; during stale placeholder keep showing previous client's contacts
  const displayContacts: ClientDetail['contacts'] =
    detail != null && (detail.contacts?.length ?? 0) > 0
      ? detail.contacts
      : detail?.id === currentClient?.id
        ? (currentClient?.contacts ?? []).map((ct, idx) => ({
            id: (ct as { id?: string }).id ?? `summary-${currentClient?.id ?? 'x'}-${idx}`,
            nombre: ct.nombre ?? '',
            tipoContacto: ct.tipoContacto,
            telefono: ct.telefono,
            email: ct.email,
            dni: ct.dni,
          }))
        : []

  // Load pending callbacks for Agendados panel
  const { data: agendados = [] } = useQuery({
    queryKey: ['callbacks', 'pending'],
    queryFn: () => getCallbacks({ completed: false }),
    refetchInterval: 60000,
  })
  const callbackList = agendados as Callback[]

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

  const handleConfirmComplete = () => {
    if (!completeConfirm) return
    completeMutation.mutate({ id: completeConfirm.id, companyId: completeConfirm.companyId })
  }

  // Clamp contact index when contact count changes (only if out of bounds)
  useEffect(() => {
    if (!displayContacts.length) return
    if (
      pendingContactIdRef.current !== null ||
      pendingContactIdxRef.current !== null ||
      needsContactResolveRef.current
    ) {
      return
    }
    setActiveContactIdx((idx) =>
      idx >= displayContacts.length ? Math.max(0, displayContacts.length - 1) : idx
    )
  }, [detail?.id, displayContacts.length])

  useEffect(() => {
    needsContactResolveRef.current = true
  }, [selectedBatchId])

  useEffect(() => {
    if (
      !initialCompanyId ||
      companyDeepLinkHandledRef.current ||
      loadingList ||
      clients.length === 0
    ) {
      return
    }
    const idx = clients.findIndex((c) => c.id === initialCompanyId)
    if (idx < 0) return
    companyDeepLinkHandledRef.current = true
    if (initialContactId) {
      pendingContactIdRef.current = initialContactId
      pendingContactIdxRef.current = null
      needsContactResolveRef.current = false
    }
    setCurrentIndex(idx)
    switchView('detail', { persist: false })
  }, [initialCompanyId, initialContactId, loadingList, clients])

  // Sync company fields when company changes (skip stale placeholder from previous record)
  useEffect(() => {
    if (detail && currentClient && detail.id === currentClient.id) {
      setEditPlan(detail.plan ?? '')
      const rs = detail.razonSocial ?? ''
      setEditRazonSocial(rs)
      persistedRazonSocialRef.current = rs
      setHistorialScope('contact')
    }
  }, [detail?.id, currentClient?.id])

  const normalizeRazonSocial = (v: string) => v.trim()

  const isRazonSocialDirty = useCallback(
    () => normalizeRazonSocial(editRazonSocial) !== normalizeRazonSocial(persistedRazonSocialRef.current),
    [editRazonSocial]
  )

  const saveRazonSocialIfChanged = useCallback(async (): Promise<boolean> => {
    if (!currentClient?.id) return false
    if (!isRazonSocialDirty()) return false
    if (razonSocialSavingRef.current) return false

    razonSocialSavingRef.current = true
    const value = normalizeRazonSocial(editRazonSocial)
    try {
      await updateClient(currentClient.id, { razonSocial: value || undefined })
      persistedRazonSocialRef.current = value
      qc.invalidateQueries({ queryKey: ['client-detail', currentClient.id] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      return true
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Error al guardar razón social'
      toast.error(message)
      setEditRazonSocial(persistedRazonSocialRef.current)
      return false
    } finally {
      razonSocialSavingRef.current = false
    }
  }, [currentClient?.id, editRazonSocial, isRazonSocialDirty, qc])

  const handleRazonSocialBlur = useCallback(async () => {
    const saved = await saveRazonSocialIfChanged()
    if (saved) toast.success('Razón social actualizada')
  }, [saveRazonSocialIfChanged])

  const clearEditableCallFields = useCallback(() => {
    setDisposition('')
    setCallNotes('')
    setSchedDate('')
    setSchedTime('')
  }, [])

  const askConservarAgenda = useCallback((dateStr: string): Promise<boolean> => {
    return new Promise((resolve) => {
      agendaConfirmResolveRef.current = resolve
      setAgendaConfirm({ dateStr })
    })
  }, [])

  const resolveAgendaConfirm = useCallback((conservar: boolean) => {
    agendaConfirmResolveRef.current?.(conservar)
    agendaConfirmResolveRef.current = null
    setAgendaConfirm(null)
  }, [])

  // Prefill disposition from latest log; each save appends a new CallLog
  useEffect(() => {
    if (!detail || !user?.id || !currentClient?.id) return
    if (detail.id !== currentClient.id) return

    let contactIdx = activeContactIdx
    if (needsContactResolveRef.current && detail.id === currentClient?.id) {
      const agentLogs = [...detail.callLogs]
        .filter((l) => l.agentId === user.id && l.contact?.id)
        .sort((a, b) => new Date(b.calledAt).getTime() - new Date(a.calledAt).getTime())
      if (agentLogs.length > 0) {
        const contactId = agentLogs[0].contact!.id
        const cIdx = displayContacts.findIndex((c) => c.id === contactId)
        contactIdx = cIdx >= 0 ? cIdx : 0
      } else {
        contactIdx = 0
      }
      setActiveContactIdx(contactIdx)
      needsContactResolveRef.current = false
      pendingContactIdRef.current = null
      pendingContactIdxRef.current = null
    } else if (pendingContactIdRef.current && !needsContactResolveRef.current) {
      const cIdx = displayContacts.findIndex((c) => c.id === pendingContactIdRef.current)
      if (cIdx >= 0) {
        contactIdx = cIdx
        setActiveContactIdx(cIdx)
      }
      pendingContactIdRef.current = null
      pendingContactIdxRef.current = null
    } else if (pendingContactIdxRef.current !== null) {
      contactIdx = Math.min(pendingContactIdxRef.current, Math.max(0, displayContacts.length - 1))
      setActiveContactIdx(contactIdx)
      pendingContactIdxRef.current = null
    }

    let pinnedLogId: string | null = null
    if (pendingCallLogIdRef.current) {
      const pinnedLog = detail.callLogs.find((l) => l.id === pendingCallLogIdRef.current)
      pendingCallLogIdRef.current = null
      if (pinnedLog) {
        pinnedLogId = pinnedLog.id
        if (pinnedLog.contact?.id) {
          const cIdx = displayContacts.findIndex((c) => c.id === pinnedLog.contact!.id)
          if (cIdx >= 0) {
            contactIdx = cIdx
            setActiveContactIdx(cIdx)
          }
        }
      }
    }

    const idx = Math.min(contactIdx, Math.max(0, displayContacts.length - 1))
    const contact = displayContacts[idx]
    if (!contact?.id || contact.id.startsWith('summary-')) {
      setLatestLogSnapshot(null)
      setEditingCallLogId(null)
      clearEditableCallFields()
      return
    }

    const agentContactLogs = [...detail.callLogs]
      .filter((l) => l.contact?.id === contact.id && l.agentId === user.id)
      .sort((a, b) => new Date(b.calledAt).getTime() - new Date(a.calledAt).getTime())

    const prefillStartIdx = pinnedLogId
      ? Math.max(0, agentContactLogs.findIndex((l) => l.id === pinnedLogId))
      : 0

    const targetLog =
      agentContactLogs.slice(prefillStartIdx).find((l) => isAgentSelectableDisposition(l.disposition)) ??
      null

    if (targetLog) {
      const agentLogIds = new Set(
        detail.callLogs.filter((l) => l.agentId === user.id).map((l) => l.id)
      )
      const agentPendingCb = detail.callbacks?.find(
        (c) => !c.completed && (!c.callLogId || agentLogIds.has(c.callLogId))
      )
      const snap = snapshotFromLog(targetLog, detail.callbacks, agentPendingCb)
      setLatestLogSnapshot(snap)
      setDisposition(targetLog.disposition)
      setCallNotes(targetLog.notes ?? '')
      setSchedDate(snap.schedDate)
      setSchedTime(snap.schedTime)
      setEditingCallLogId(targetLog.id)
    } else {
      setLatestLogSnapshot(null)
      setEditingCallLogId(null)
      clearEditableCallFields()
    }
  }, [detail, activeContactIdx, user?.id, clearEditableCallFields, displayContacts, currentClient?.id])

  const saveActiveContactIfDirty = useCallback(async (): Promise<boolean> => {
    if (!displayContacts.length) return false
    const idx = Math.min(activeContactIdx, displayContacts.length - 1)
    const ct = displayContacts[idx]
    if (!ct?.id || ct.id.startsWith('summary-')) return false

    const saved = savedContactRef.current
    if (!saved || saved.id !== ct.id) return false

    const telefono = editTelefono.trim()
    const email = editEmail.trim()
    const dni = editDni.trim()

    if (telefono === saved.telefono && email === saved.email && dni === saved.dni) return false

    await updateContact(ct.id, {
      telefono: telefono || null,
      email: email || null,
      dni: dni || null,
    })
    savedContactRef.current = { id: ct.id, telefono, email, dni }
    lastSyncedContactKey.current = `${ct.id}:${telefono}:${email}:${dni}`
    if (currentClient?.id) {
      qc.invalidateQueries({ queryKey: ['client-detail', currentClient.id] })
    }
    qc.invalidateQueries({ queryKey: ['clients'] })
    return true
  }, [displayContacts, activeContactIdx, editTelefono, editEmail, editDni, currentClient?.id, qc])

  // Sync editable contact fields when active contact changes
  const activeContactIdForSync =
    displayContacts.length > 0
      ? displayContacts[Math.min(activeContactIdx, displayContacts.length - 1)]?.id
      : undefined

  useEffect(() => {
    if (!activeContactIdForSync) return
    const ct = displayContacts.find((c) => c.id === activeContactIdForSync)
    if (!ct) return
    const telefono = ct.telefono ?? ''
    const email = ct.email ?? ''
    const dni = ct.dni ?? ''
    const syncKey = `${ct.id}:${telefono}:${email}:${dni}`
    if (lastSyncedContactKey.current === syncKey) return
    lastSyncedContactKey.current = syncKey
    setEditTelefono(telefono)
    setEditEmail(email)
    setEditDni(dni)
    if (!ct.id.startsWith('summary-')) {
      savedContactRef.current = { id: ct.id, telefono, email, dni }
    } else {
      savedContactRef.current = null
    }
  }, [activeContactIdForSync, displayContacts])

  const contactCountFor = useCallback(
    (clientIdx: number) => {
      const client = clients[clientIdx]
      if (!client) return 0
      const listCount = client.contacts?.length ?? 0
      if (clientIdx === currentIndex && detail != null && detail.id === client.id) {
        return Math.max(listCount, displayContacts.length)
      }
      return listCount
    },
    [clients, currentIndex, detail?.id, displayContacts.length]
  )

  const contactIdAt = useCallback(
    (clientIdx: number, contactIdx: number): string | undefined => {
      const client = clients[clientIdx]
      if (!client) return undefined

      if (clientIdx === currentIndex && detail != null && detail.id === client.id) {
        if (displayContacts.length > 0) {
          const fromDisplay = displayContacts[contactIdx]?.id
          if (fromDisplay && !fromDisplay.startsWith('summary-')) return fromDisplay
        }
      }

      const fromList = client.contacts?.[contactIdx]?.id
      if (fromList) return fromList

      if (clientIdx === currentIndex && detail != null && detail.id === client.id) {
        return detail.contacts?.[contactIdx]?.id
      }

      const cachedDetail = qc.getQueryData<ClientDetail>(['client-detail', client.id])
      if (cachedDetail?.id === client.id) {
        const fromCached = cachedDetail.contacts?.[contactIdx]?.id
        if (fromCached && !fromCached.startsWith('summary-')) return fromCached
      }

      return undefined
    },
    [clients, currentIndex, detail, displayContacts, qc]
  )

  const contactHasAgentLogByContactId = useCallback(
    (contactId: string | undefined, clientIdx?: number): boolean => {
      if (!user?.id || !contactId || contactId.startsWith('summary-')) return false

      const idx = clientIdx ?? currentIndex
      const client = clients[idx]
      if (!client) return false

      const hasLogInDetail = (d: ClientDetail, cid: string) =>
        d.callLogs.some((l) => l.agentId === user.id && l.contact?.id === cid)

      if (idx === currentIndex && detail != null && detail.id === client.id) {
        return hasLogInDetail(detail, contactId)
      }

      const cachedDetail = qc.getQueryData<ClientDetail>(['client-detail', client.id])
      if (cachedDetail?.id === client.id) {
        return hasLogInDetail(cachedDetail, contactId)
      }

      const listContact = client.contacts?.find((c) => c.id === contactId)
      if (listContact) {
        return (listContact._count?.callLogs ?? 0) > 0
      }

      return false
    },
    [clients, currentIndex, detail, user?.id, qc]
  )

  const contactHasAgentLog = useCallback(
    (clientIdx: number, contactIdx: number): boolean => {
      const contactId = contactIdAt(clientIdx, contactIdx)
      return contactHasAgentLogByContactId(contactId, clientIdx)
    },
    [contactIdAt, contactHasAgentLogByContactId]
  )

  const companyHasAgentLog = useCallback(
    (clientIdx: number): boolean => {
      const client = clients[clientIdx]
      if (!client) return false

      let contactIds: (string | undefined)[] = []
      if (clientIdx === currentIndex && detail?.id === client.id && displayContacts.length > 0) {
        contactIds = displayContacts.map((c) => c.id)
      } else {
        const cachedDetail = qc.getQueryData<ClientDetail>(['client-detail', client.id])
        if (cachedDetail?.id === client.id && (cachedDetail.contacts?.length ?? 0) > 0) {
          contactIds = cachedDetail.contacts.map((c) => c.id)
        } else {
          contactIds = (client.contacts ?? []).map((c) => c.id)
        }
      }

      for (const cid of contactIds) {
        if (contactHasAgentLogByContactId(cid, clientIdx)) return true
      }
      return false
    },
    [clients, currentIndex, detail, displayContacts, contactHasAgentLogByContactId, qc]
  )

  const findOtherContactWithAgentLog = useCallback(
    (contactIdToSave: string | undefined): { id: string; nombre: string } | undefined => {
      if (!detail || !user?.id || !contactIdToSave) return undefined
      const otherLog = detail.callLogs.find(
        (l) => l.agentId === user.id && l.contact?.id && l.contact.id !== contactIdToSave
      )
      return otherLog?.contact
    },
    [detail, user?.id]
  )

  const resolveContactIdxForCompany = useCallback(
    (clientIdx: number, detailOverride?: ClientDetail): number => {
      const client = clients[clientIdx]
      if (!client || !user?.id) return 0

      const n = contactCountFor(clientIdx)
      if (n === 0) return 0

      let detailSource: ClientDetail | undefined = detailOverride
      if (!detailSource) {
        if (clientIdx === currentIndex && detail?.id === client.id) {
          detailSource = detail
        } else {
          detailSource = qc.getQueryData<ClientDetail>(['client-detail', client.id])
        }
      }

      if (detailSource?.id === client.id && detailSource.callLogs.length > 0) {
        const agentLogs = [...detailSource.callLogs]
          .filter((l) => l.agentId === user.id && l.contact?.id)
          .sort((a, b) => new Date(b.calledAt).getTime() - new Date(a.calledAt).getTime())
        if (agentLogs.length > 0) {
          const contactId = agentLogs[0].contact!.id
          const contacts =
            clientIdx === currentIndex && displayContacts.length > 0
              ? displayContacts
              : detailSource.contacts?.length > 0
                ? detailSource.contacts
                : (client.contacts ?? [])
          const idx = contacts.findIndex((c) => c.id === contactId)
          if (idx >= 0) return idx
        }
      }

      const listContacts = client.contacts ?? []
      for (const ct of listContacts) {
        if (!ct.id) continue
        if ((ct._count?.callLogs ?? 0) > 0) {
          const contacts =
            clientIdx === currentIndex && displayContacts.length > 0
              ? displayContacts
              : detailSource?.contacts?.length
                ? detailSource.contacts
                : listContacts
          const idx = contacts.findIndex((c) => c.id === ct.id)
          if (idx >= 0) return idx
        }
      }

      return 0
    },
    [clients, user?.id, contactCountFor, currentIndex, detail, displayContacts, qc]
  )

  const navigateToCompany = useCallback(
    async (clientIdx: number) => {
      await saveActiveContactIfDirty()
      const resolvedIdx = resolveContactIdxForCompany(clientIdx)
      const contactId = contactIdAt(clientIdx, resolvedIdx)
      needsContactResolveRef.current = true
      if (contactId && !contactId.startsWith('summary-')) {
        pendingContactIdRef.current = contactId
        pendingContactIdxRef.current = null
      } else {
        pendingContactIdRef.current = null
        pendingContactIdxRef.current = resolvedIdx
      }
      setActiveContactIdx(resolvedIdx)
      setCurrentIndex(clientIdx)
    },
    [saveActiveContactIfDirty, resolveContactIdxForCompany, contactIdAt]
  )

  const goTo = useCallback(
    async (idx: number) => {
      if (idx >= 0 && idx < clients.length) {
        await navigateToCompany(idx)
      }
    },
    [clients.length, navigateToCompany]
  )

  const openDetailFromList = useCallback(
    (realIdx: number) => {
      if (realIdx >= 0) void goTo(realIdx)
      setReturnToView('list')
      switchView('detail', { persist: false })
    },
    [goTo]
  )

  const returnToList = useCallback(() => {
    setReturnToView(null)
    switchView('list')
  }, [])

  const returnToDashboardHome = useCallback(() => {
    setReturnToDashboard(false)
    navigate('/')
  }, [navigate])

  const goNext = useCallback(async () => {
    await saveActiveContactIfDirty()
    if (currentIndex < clients.length - 1) {
      await navigateToCompany(currentIndex + 1)
    }
  }, [currentIndex, clients.length, saveActiveContactIfDirty, navigateToCompany])

  const goPrev = useCallback(async () => {
    await saveActiveContactIfDirty()
    if (currentIndex > 0) {
      await navigateToCompany(currentIndex - 1)
    }
  }, [currentIndex, saveActiveContactIfDirty, navigateToCompany])

  const flatNavItems = useMemo(
    () => clients.map((_, clientIdx) => ({ clientIdx })),
    [clients]
  )

  const firstRegisteredTarget = useMemo(
    () => flatNavItems.find((item) => companyHasAgentLog(item.clientIdx)),
    [flatNavItems, companyHasAgentLog]
  )

  const firstEmptyTarget = useMemo(
    () => flatNavItems.find((item) => !companyHasAgentLog(item.clientIdx)),
    [flatNavItems, companyHasAgentLog]
  )

  const nextPendingTarget = useMemo(
    () =>
      flatNavItems.find(
        (item) => item.clientIdx > currentIndex && !companyHasAgentLog(item.clientIdx)
      ),
    [flatNavItems, currentIndex, companyHasAgentLog]
  )

  const goToFirstRegistered = useCallback(async () => {
    if (firstRegisteredTarget) {
      await navigateToCompany(firstRegisteredTarget.clientIdx)
    } else {
      toast('No hay registros guardados', { icon: 'ℹ️' })
    }
  }, [firstRegisteredTarget, navigateToCompany])

  const goToFirstEmpty = useCallback(async () => {
    if (firstEmptyTarget) {
      await navigateToCompany(firstEmptyTarget.clientIdx)
    } else {
      toast('No hay registros pendientes', { icon: 'ℹ️' })
    }
  }, [firstEmptyTarget, navigateToCompany])

  const goToNextPending = useCallback(async () => {
    if (nextPendingTarget) {
      await navigateToCompany(nextPendingTarget.clientIdx)
    } else {
      toast('No hay más empresas pendientes en este lote', { icon: 'ℹ️' })
    }
  }, [nextPendingTarget, navigateToCompany])

  const navigateWithSave = useCallback(
    (action: () => Promise<void>) => async () => {
      try {
        await action()
      } catch (err) {
        toast.error((err as Error)?.message ?? 'Error al guardar contacto')
      }
    },
    []
  )

  const switchBatch = (batchId: string) => {
    setSelectedBatchId(batchId)
    setCurrentIndex(0)
    pendingContactIdRef.current = null
    pendingContactIdxRef.current = null
    pendingCallLogIdRef.current = null
    setEditingCallLogId(null)
    needsContactResolveRef.current = true
    setGridPage(1)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (batchId) next.set('batchId', batchId)
        else next.delete('batchId')
        return next
      },
      { replace: true }
    )
  }

  const applyListFilters = useCallback(
    (cola: ListCola, drilldown: string | null) => {
      setListCola(cola)
      setListDrilldown(drilldown)
      const urlFilter = listFiltersToUrl(cola, drilldown)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (urlFilter) next.set('filter', urlFilter)
          else next.delete('filter')
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const goToClientById = (
    clientId: string,
    opts?: { callLogId?: string; contactId?: string }
  ) => {
    if (opts?.callLogId) pendingCallLogIdRef.current = opts.callLogId
    const idx = clients.findIndex((c) => c.id === clientId)
    if (idx >= 0) {
      if (opts?.contactId) {
        pendingContactIdRef.current = opts.contactId
        pendingContactIdxRef.current = null
        needsContactResolveRef.current = false
        setCurrentIndex(idx)
      } else {
        void navigateToCompany(idx)
      }
    } else {
      toast('Este cliente no está en tu lista visible', { icon: 'ℹ️' })
    }
  }

  const canSaveCallResult = useMemo(
    () => disposition !== '' || schedDate !== '',
    [disposition, schedDate]
  )

  type SaveAutoNext = false | true | 'sequential' | 'nextPending'

  const saveMutation = useMutation({
    mutationFn: async (autoNext: SaveAutoNext) => {
      const emptyResult = {
        autoNext,
        callLogSaved: false,
        contactSaved: false,
        planChanged: false,
        razonSocialChanged: false,
        noOp: false,
      }
      if (!currentClient) return emptyResult

      const contactSaved = await saveActiveContactIfDirty()
      const planChanged = (editPlan || '') !== (detail?.plan ?? '')
      const razonSocialChanged = isRazonSocialDirty()
      if (planChanged || razonSocialChanged) {
        await updateClient(currentClient.id, {
          ...(planChanged ? { plan: editPlan || undefined } : {}),
          ...(razonSocialChanged
            ? { razonSocial: normalizeRazonSocial(editRazonSocial) || undefined }
            : {}),
        })
        if (razonSocialChanged) {
          persistedRazonSocialRef.current = normalizeRazonSocial(editRazonSocial)
        }
      }

      if (displayContacts.length === 0) {
        throw new Error('Esta empresa no tiene contactos')
      }

      const contactForSave =
        displayContacts[Math.min(activeContactIdx, displayContacts.length - 1)]
      if (displayContacts.length > 1) {
        if (!contactForSave?.id || contactForSave.id.startsWith('summary-')) {
          throw new Error('Selecciona un contacto antes de guardar')
        }
      }

      const callbackDateIso = schedDate
        ? new Date(`${schedDate}T${schedTime || '09:00'}:00`).toISOString()
        : undefined

      const contactId =
        contactForSave?.id && !contactForSave.id.startsWith('summary-')
          ? contactForSave.id
          : undefined

      let callLogSaved = false

      const ownPendingForCompany = callbackList.filter(
        (cb) => cb.company.id === currentClient.id && cb.agent.id === user?.id
      )
      const editingLinkedCb = editingCallLogId
        ? ownPendingForCompany.find((cb) => cb.callLogId === editingCallLogId)
        : undefined

      const agendaModified = isAgendaModified(latestLogSnapshot, schedDate, schedTime)
      const callLogUnchanged =
        !!editingCallLogId &&
        isCallLogUnchanged(latestLogSnapshot, disposition, callNotes, schedDate, schedTime)
      const rescheduleOnly =
        !!editingCallLogId &&
        isRescheduleOnlyChange(latestLogSnapshot, disposition, callNotes, schedDate, schedTime)

      const hasPendingAgendaInForm = !!schedDate
      const hasExistingAgenda =
        ownPendingForCompany.length > 0 || !!(latestLogSnapshot?.schedDate)
      const responseOrNotesModified = isResponseOrNotesModified(
        latestLogSnapshot,
        disposition,
        callNotes
      )

      const shouldConfirmAgenda =
        !!editingCallLogId &&
        !!latestLogSnapshot &&
        hasPendingAgendaInForm &&
        !agendaModified &&
        responseOrNotesModified &&
        !!disposition &&
        !isDefinitiveClosureDisposition(disposition) &&
        hasExistingAgenda

      let conservarMismaAgenda = true
      if (shouldConfirmAgenda) {
        const cbToShow = editingLinkedCb ?? ownPendingForCompany[0]
        const dateStr = cbToShow
          ? format(new Date(cbToShow.scheduledAt), 'dd/MM HH:mm', { locale: es })
          : format(
              new Date(
                `${latestLogSnapshot.schedDate}T${latestLogSnapshot.schedTime || '09:00'}:00`
              ),
              'dd/MM HH:mm',
              { locale: es }
            )
        conservarMismaAgenda = await askConservarAgenda(dateStr)
        if (!conservarMismaAgenda) {
          throw new SaveCancelled()
        }
      }

      const mantenerAgenda =
        !!disposition &&
        !isDefinitiveClosureDisposition(disposition) &&
        !agendaModified &&
        hasExistingAgenda &&
        (!shouldConfirmAgenda || conservarMismaAgenda)

      if (!callLogUnchanged && (editingCallLogId || disposition || schedDate)) {
        if (requiresCallbackDate(disposition) && !schedDate) {
          throw new Error('Selecciona la fecha para el callback')
        }
        if (!editingCallLogId) {
          const otherContact = findOtherContactWithAgentLog(contactId)
          if (
            otherContact &&
            !confirm(
              `Esta empresa ya tiene un contacto registrado (${otherContact.nombre}). ¿Está seguro de que desea registrar este contacto?`
            )
          ) {
            throw new SaveCancelled()
          }
        }

        const callPayload: Record<string, unknown> = {}
        if (disposition) callPayload.disposition = disposition
        if (callNotes) callPayload.notes = callNotes

        if (requiresCallbackDate(disposition) && schedDate && callbackDateIso && !mantenerAgenda) {
          callPayload.callbackDate = callbackDateIso
        } else if (isDefinitiveClosureDisposition(disposition)) {
          if (rescheduleOnly) callPayload.callbackDate = null
        } else if (agendaModified && schedDate && callbackDateIso) {
          callPayload.callbackDate = callbackDateIso
        }

        if (rescheduleOnly) {
          await updateCall(editingCallLogId!, callPayload)
        } else {
          await logCall({
            clientId: currentClient.id,
            contactId,
            disposition: disposition || 'VOLVER_A_LLAMAR',
            notes: callNotes,
            ...(callPayload.callbackDate != null
              ? { callbackDate: callPayload.callbackDate as string }
              : {}),
            ...(mantenerAgenda ? { linkPendingCallback: true } : {}),
          })
        }
        callLogSaved = true
      }

      const nothingSaved =
        !callLogSaved && !contactSaved && !planChanged && !razonSocialChanged

      if (callLogUnchanged && nothingSaved) {
        return {
          autoNext,
          callLogSaved,
          contactSaved,
          planChanged,
          razonSocialChanged,
          noOp: true,
        }
      }

      if (autoNext && !callLogSaved) {
        throw new Error('Selecciona una respuesta antes de avanzar a la siguiente empresa')
      }
      if (nothingSaved) {
        throw new Error('Selecciona una respuesta antes de guardar')
      }

      noOp: false,
      }
    },
    onSuccess: async (result) => {
      setRespuestaError(false)
      if (result.callLogSaved) {
        if (result.autoNext !== false) {
          setCallNotes('')
          setSchedDate('')
          setSchedTime('09:00')
          setEditingCallLogId(null)
        }
        toast.success('Resultado guardado')
      } else if (result.contactSaved) {
        toast.success('Datos de contacto actualizados')
      } else if (result.planChanged) {
        toast.success('Plan actualizado')
      } else if (result.razonSocialChanged) {
        toast.success('Razón social actualizada')
      } else if (result.noOp) {
        toast('Sin cambios que guardar', { icon: 'ℹ️' })
      }
      qc.invalidateQueries({ queryKey: ['client-detail', currentClient?.id] })
      qc.invalidateQueries({ queryKey: ['callbacks'] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      if (result.autoNext === 'nextPending') await goToNextPending()
      else if (result.autoNext) await goNext()
    },
    onError: (err: Error) => {
      if (err.name === 'SaveCancelled') return
      const message = err?.message ?? 'Error al guardar'
      if (
        message.includes('Selecciona una respuesta')
      ) {
        setRespuestaError(true)
      }
      toast.error(message)
    },
  })

  // ─── Render ───────────────────────────────────────────────────────────────

  const gridClients = gridData?.clients ?? []
  const gridTotal = gridData?.total ?? 0
  const rawListClients: ClientSummary[] = listData?.clients ?? []
  const shouldHideArchivedInList = !isAdmin && listCola === 'ALL' && !listDrilldown
  const listClients: ClientSummary[] = useMemo(() => {
    if (!shouldHideArchivedInList) return rawListClients
    return rawListClients.filter((c) => !isHiddenFromAgentQueue(c.lastDisposition))
  }, [rawListClients, shouldHideArchivedInList])
  const hiddenListCount = shouldHideArchivedInList ? rawListClients.length - listClients.length : 0
  const effectiveDisposition = disposition
  const selectedResponse = effectiveDisposition ? getResponseOption(effectiveDisposition) : undefined
  const agendarDisabled =
    selectedResponse?.disableAgendar ||
    effectiveDisposition === 'DO_NOT_CALL' ||
    effectiveDisposition === 'NOT_INTERESTED'

  const handleDispositionChange = useCallback((next: string) => {
    setDisposition(next)
    setRespuestaError(false)
    const opt = getResponseOption(next)
    if (opt?.disableAgendar) {
      setSchedDate('')
      setSchedTime('')
    }
  }, [])

  // Split callbacks: own = current user; team = all (admin only)
  const ownCallbacks = callbackList.filter((c) => c.agent.id === user?.id)
  const activeList = cbTab === 'own' || !isAdmin ? ownCallbacks : callbackList

  const todayCount = activeList.filter((c) => isToday(new Date(c.scheduledAt))).length
  const overdueCount = activeList.filter((c) => isPast(new Date(c.scheduledAt))).length

  // Detail view loading / empty guards are now rendered INSIDE the layout
  // (so the top bar with batch selector remains visible at all times)

  const isFirst = clients.length === 0 || currentIndex === 0
  const isLast = clients.length === 0 || currentIndex >= clients.length - 1

  const atFirstRegistered =
    firstRegisteredTarget != null && firstRegisteredTarget.clientIdx === currentIndex
  const atFirstEmpty =
    firstEmptyTarget != null && firstEmptyTarget.clientIdx === currentIndex

  const duplicateRucCount = detail
    ? clients.filter((c) => c.ruc === detail.ruc).length
    : 0
  const safeContactIdx =
    displayContacts.length > 0
      ? Math.min(activeContactIdx, displayContacts.length - 1)
      : 0
  const activeContact = displayContacts[safeContactIdx]

  const historialSplit = useMemo(() => {
    const allLogs = detail?.callLogs ?? []
    const scopeFilter = (logs: CallLogEntry[]) =>
      filterCallLogsByHistorialScope(logs, historialScope, activeContact?.id, displayContacts.length)

    if (isAdmin) {
      const primaryLogs = sortCallLogsNewestFirst(scopeFilter(allLogs))
      return {
        primaryLogs,
        archivedLogs: [] as CallLogEntry[],
        primaryCount: primaryLogs.length,
        archivedCount: 0,
        hasAnyLogs: allLogs.length > 0,
      }
    }

    const ownLogs = allLogs.filter((log) => log.agentId === user?.id)
    const otherLogs = allLogs.filter((log) => log.agentId !== user?.id)
    const primaryLogs = sortCallLogsNewestFirst(scopeFilter(ownLogs))
    const archivedLogs = sortCallLogsNewestFirst(scopeFilter(otherLogs))
    return {
      primaryLogs,
      archivedLogs,
      primaryCount: primaryLogs.length,
      archivedCount: archivedLogs.length,
      hasAnyLogs: allLogs.length > 0,
    }
  }, [detail?.callLogs, historialScope, activeContact?.id, displayContacts.length, isAdmin, user?.id])

  useEffect(() => {
    setShowPreviousHistorial(false)
  }, [detail?.id])

  useEffect(() => {
    contactTabRefs.current[safeContactIdx]?.scrollIntoView({
      inline: 'nearest',
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [safeContactIdx])

  useEffect(() => {
    if (viewMode !== 'detail' || displayContacts.length <= 1) return

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
      return target.isContentEditable
    }

    const switchToContact = (idx: number) => {
      void navigateWithSave(async () => {
        await saveActiveContactIfDirty()
        setActiveContactIdx(idx)
      })()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return

      if (e.key === 'ArrowLeft' && safeContactIdx > 0) {
        e.preventDefault()
        switchToContact(safeContactIdx - 1)
      } else if (e.key === 'ArrowRight' && safeContactIdx < displayContacts.length - 1) {
        e.preventDefault()
        switchToContact(safeContactIdx + 1)
      } else if (e.key === 'Home' && safeContactIdx !== 0) {
        e.preventDefault()
        switchToContact(0)
      } else if (e.key === 'End') {
        const lastIdx = displayContacts.length - 1
        if (safeContactIdx !== lastIdx) {
          e.preventDefault()
          switchToContact(lastIdx)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [viewMode, displayContacts.length, safeContactIdx, navigateWithSave, saveActiveContactIfDirty])

  useEffect(() => {
    if (viewMode !== 'detail') return

    const handleSaveKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !e.ctrlKey) return

      if (e.shiftKey) {
        if (saveMutation.isPending || !canSaveCallResult || !nextPendingTarget) return
        e.preventDefault()
        saveMutation.mutate('nextPending')
        return
      }

      if (saveMutation.isPending || !canSaveCallResult) return
      e.preventDefault()
      saveMutation.mutate(false)
    }

    window.addEventListener('keydown', handleSaveKeyDown)
    return () => window.removeEventListener('keydown', handleSaveKeyDown)
  }, [viewMode, saveMutation, canSaveCallResult, nextPendingTarget])

  const exportBatchId = selectedBatchId || detail?.importBatch?.id

  const handleExport = async () => {
    if (!exportBatchId) {
      toast.error('Selecciona un lote para exportar')
      return
    }
    setExporting(true)
    try {
      const saved = await downloadImportExport(exportBatchId, isAdmin ? undefined : user?.id)
      if (saved) toast.success('Archivo guardado')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Error al exportar')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ══════════════════════ SHARED TOP BAR ══════════════════════ */}
      <div className="bg-blue-800 text-white px-3 lg:px-6 py-3 flex flex-wrap lg:flex-nowrap items-center justify-between shrink-0 gap-2 lg:gap-4">
        <div className="flex items-center gap-2 lg:gap-4 min-w-0 text-sm flex-wrap">
          <span className="font-semibold truncate shrink-0">Migración de Operador</span>

          {/* Batch selector */}
          {batches.length > 0 && (
            <select
              value={selectedBatchId}
              onChange={(e) => switchBatch(e.target.value)}
              className="bg-blue-700 border border-blue-500 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-300 max-w-[220px] truncate"
            >
              <option value="">
                Todos los lotes ({batchMetricsLabel(countCompanies(allClients), allContactCount)})
              </option>
              {batches.map((b, i) => {
                const batchClients = allClients.filter((c) => c.importBatch?.id === b.id)
                return (
                  <option key={b.id} value={b.id}>
                    {i === 0 ? '★ ' : ''}{batchLabelShort(b)} ({batchMetricsLabel(countCompanies(batchClients), countContacts(batchClients))})
                  </option>
                )
              })}
            </select>
          )}

          {exportBatchId && (
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center justify-center p-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded transition-colors shrink-0"
              title="Descargar mis registros"
            >
              <Save size={13} />
            </button>
          )}

          {viewMode === 'detail' && detail && (
            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge status={detail.status} />
            </div>
          )}
          {viewMode === 'grid' && (
            <span className="text-blue-300 text-xs shrink-0">{gridData?.total ?? 0} clientes</span>
          )}
        </div>

        <div className="flex items-center gap-2 lg:gap-3 shrink-0 flex-wrap lg:flex-nowrap">
          {viewMode === 'list' && returnToDashboard && (
            <button
              type="button"
              onClick={returnToDashboardHome}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 border border-blue-500 text-white text-xs font-medium"
            >
              <ArrowLeft size={14} />
              Volver al inicio
              {(listDrilldown || listCola !== 'FUNNEL') && (
                <span className="text-blue-200 font-normal">
                  ({getListFilterLabel(listCola, listDrilldown)})
                </span>
              )}
            </button>
          )}
          {viewMode === 'detail' && returnToView === 'list' && (
            <button
              type="button"
              onClick={returnToList}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 border border-blue-500 text-white text-xs font-medium"
            >
              <ArrowLeft size={14} />
              Volver a la lista
              {(listDrilldown || listCola !== 'FUNNEL') && (
                <span className="text-blue-200 font-normal">
                  ({getListFilterLabel(listCola, listDrilldown)})
                </span>
              )}
            </button>
          )}
          {/* ── View toggle (fixed position; nav slot always to the right) ── */}
          <div className="flex bg-blue-700 rounded-lg p-0.5 gap-0.5 shrink-0">
            <button
              onClick={() => { setReturnToView(null); switchView('detail') }}
              title="Vista detalle — ficha individual con historial"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                viewMode === 'detail'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-blue-200 hover:text-white'
              }`}
            >
              <List size={13} /> Detalle
            </button>
            <button
              onClick={() => { setReturnToView(null); switchView('grid') }}
              title="Vista tarjetas — grilla con búsqueda y filtros"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                viewMode === 'grid'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-blue-200 hover:text-white'
              }`}
            >
              <LayoutGrid size={13} /> Tarjetas
            </button>
            <button
              onClick={() => {
                if (viewMode === 'detail' && returnToView === 'list') {
                  returnToList()
                } else {
                  setReturnToView(null)
                  switchView('list')
                }
              }}
              title={
                viewMode === 'detail' && returnToView === 'list'
                  ? 'Volver a la lista filtrada'
                  : 'Vista lista — tabla completa de clientes'
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-blue-200 hover:text-white'
              } ${
                viewMode === 'detail' && returnToView === 'list'
                  ? 'ring-1 ring-blue-300'
                  : ''
              }`}
            >
              <AlignJustify size={13} /> Lista
            </button>
          </div>

          {/* ── Nav slot (reserved width so toggle does not shift) ── */}
          <div className="flex items-center justify-end gap-2 min-w-[12rem] shrink-0">
            {viewMode === 'detail' ? (
              <>
                <span
                  className="text-blue-300 text-xs tabular-nums whitespace-nowrap"
                  title={isAdmin ? COLA_ALL_ADMIN_TITLE : COLA_ALL_AGENT_TITLE}
                >
                  {currentIndex + 1} / {total}
                  {hiddenNavCount > 0 && (
                    <span className="text-blue-400/70" title="Empresas archivadas ocultas de la cola">
                      {' '}({hiddenNavCount} ocultas)
                    </span>
                  )}
                </span>
                <DetailRecordNav
                  variant="header"
                  onFirstRegistered={navigateWithSave(goToFirstRegistered)}
                  onPrev={navigateWithSave(goPrev)}
                  onNext={navigateWithSave(goNext)}
                  onFirstEmpty={navigateWithSave(goToFirstEmpty)}
                  isFirst={isFirst}
                  isLast={isLast}
                  atFirstRegistered={atFirstRegistered}
                  atFirstEmpty={atFirstEmpty}
                  noRegistered={!firstRegisteredTarget}
                  noEmpty={!firstEmptyTarget}
                />
              </>
            ) : (
              <div
                className="invisible flex items-center gap-2 pointer-events-none"
                aria-hidden="true"
              >
                <span className="text-xs tabular-nums whitespace-nowrap">999 / 999</span>
                <DetailRecordNav
                  variant="header"
                  onFirstRegistered={() => {}}
                  onPrev={() => {}}
                  onNext={() => {}}
                  onFirstEmpty={() => {}}
                  isFirst
                  isLast
                  atFirstRegistered
                  atFirstEmpty
                  noRegistered
                  noEmpty
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════ DETAIL VIEW ══════════════════════════ */}
      {viewMode === 'detail' && (
        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0">
          {/* ── Left: Form (scrollable) ── */}
          <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] bg-gray-50 p-3 lg:p-4 min-h-0">
            {/* Loading state */}
            {loadingList && (
              <div className="flex items-center justify-center h-full text-gray-400">
                <div className="text-center">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm">Cargando clientes...</p>
                </div>
              </div>
            )}
            {/* Empty state — keeps top bar + batch selector visible */}
            {!loadingList && clients.length === 0 && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-400">
                  <User size={48} className="mx-auto mb-3" />
                  {selectedBatchId
                    ? <><p className="font-medium text-gray-600">No hay clientes en este lote</p>
                        <button onClick={() => switchBatch('')} className="mt-3 text-sm text-blue-600 hover:underline">Ver todos los lotes</button></>
                    : <><p className="font-medium text-gray-600">No tienes clientes asignados</p>
                        <p className="text-sm mt-1">Contacta al administrador para recibir una asignación</p></>
                  }
                </div>
              </div>
            )}
            {!loadingList && clients.length > 0 && (
              <div className="relative min-h-[480px]">
                {fetchingDetail && displayDetail && (
                  <div className="absolute top-0 left-0 right-0 z-10 h-0.5 overflow-hidden bg-blue-100">
                    <div className="h-full w-full bg-blue-500 animate-pulse" />
                  </div>
                )}
                {isInitialDetailLoad ? (
                  <div className="flex items-center justify-center min-h-[480px] text-gray-400">
                    <div className="text-center">
                      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-sm">Cargando datos del cliente...</p>
                    </div>
                  </div>
                ) : displayDetail ? (
                  <div
                    className={`relative transition-opacity duration-200 ease-out ${
                      fetchingDetail && showingStale ? 'opacity-50 pointer-events-none' : 'opacity-100'
                    }`}
                  >
                    <div className="space-y-3 h-full flex flex-col">

                {/* ── Datos de la Empresa ── */}
                <div className="bg-white border border-gray-200 rounded-lg p-4 shrink-0">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Empresa</p>
                  {duplicateRucCount > 1 && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800">
                        Hay {duplicateRucCount} registros con el mismo RUC ({displayDetail.ruc}) en tu lista.
                        Revisá el lote de importación para distinguirlos.
                      </p>
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row gap-3 items-start">
                    <ReadField label="RUC" value={displayDetail.ruc} className="sm:w-40 shrink-0" mono />
                    <EditField
                      label="Razón Social"
                      value={editRazonSocial}
                      onChange={setEditRazonSocial}
                      onBlur={() => { void handleRazonSocialBlur() }}
                      placeholder="Sin razón social — completar manualmente"
                      className="flex-1 min-w-0 w-full"
                    />
                  </div>
                </div>

                {/* ── Contacto (tabs) ── */}
                <div className="bg-white border border-gray-200 rounded-lg shrink-0">
                  {displayContacts.length > 0 && (
                    <div
                      role="tablist"
                      className="flex h-16 shrink-0 overflow-x-auto overflow-y-hidden flex-nowrap border-b border-gray-200 bg-gray-50 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                      {displayContacts.map((ct, idx) => {
                        const fullName = (ct.nombre ?? '').trim() || 'Contacto'
                        const { primerNombre, segundoNombre, tercerNombre } = contactNameParts(ct.nombre)
                        const isRegistered = contactHasAgentLogByContactId(ct.id, currentIndex)
                        const isActive = safeContactIdx === idx
                        const tabClass = isRegistered
                          ? isActive
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-500 border-b-4 border-b-emerald-600 hover:bg-emerald-200'
                            : 'bg-emerald-100 text-emerald-900 border-emerald-500 border-b-2 hover:bg-emerald-200'
                          : isActive
                            ? 'text-blue-700 border-blue-600 bg-white border-b-2'
                            : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-100 border-b-2'
                        const tabTitle = isRegistered ? `${fullName} — Contacto registrado` : fullName
                        return (
                          <button
                            key={ct.id ?? idx}
                            ref={(el) => {
                              contactTabRefs.current[idx] = el
                            }}
                            role="tab"
                            aria-selected={isActive}
                            title={tabTitle}
                            onClick={navigateWithSave(async () => {
                              await saveActiveContactIfDirty()
                              setActiveContactIdx(idx)
                            })}
                            className={`flex h-full min-w-[100px] max-w-[120px] shrink-0 flex-col items-center justify-center gap-0 px-3 py-0.5 text-xs font-medium leading-tight transition-colors ${tabClass}`}>
                            <span className="flex items-center gap-1 overflow-hidden max-w-full">
                              {isRegistered && <CheckCircle2 size={12} className="shrink-0 text-emerald-700" />}
                              <span className="overflow-hidden">{truncateGraphemes(primerNombre || 'Contacto', 14)}</span>
                            </span>
                            <span className="min-h-[12px] text-[10px] font-normal opacity-75 overflow-hidden max-w-[110px] text-center leading-tight">
                              {truncateGraphemes([segundoNombre, tercerNombre].filter(Boolean).join(' '), 20) || '\u00A0'}
                            </span>
                            <span className="min-h-[12px] text-[10px] font-normal opacity-60 overflow-hidden max-w-[110px] text-center leading-tight">
                              {truncateGraphemes(ct.tipoContacto ?? '', 22) || '\u00A0'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {displayContacts.length === 0 ? (
                    <div className="p-4">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Contacto</p>
                      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                        <AlertCircle size={16} className="text-amber-600 shrink-0" />
                        <span className="text-sm text-amber-800">Sin contactos importados — verificar archivo de importación</span>
                      </div>
                    </div>
                  ) : (
                      <div className="p-4">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                          Contacto {safeContactIdx + 1} de {displayContacts.length}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          <ContactPhoneField telefono={editTelefono} onChange={setEditTelefono} />
                          <EditField label="Email" value={editEmail} onChange={setEditEmail} placeholder="correo@ejemplo.com" />
                          <EditField label="DNI" value={editDni} onChange={setEditDni} placeholder="Documento" />
                        </div>
                      </div>
                  )}
                </div>

                {/* ── Resultado + Agendar apilados ── */}
                <div className="flex flex-col gap-3 flex-1">

                  {/* Resultado de esta llamada */}
                  <div className={`border border-gray-200 rounded-lg p-4 space-y-3 border-l-4 ${latestLogSnapshot ? 'bg-slate-50 border-l-blue-500' : 'bg-white border-l-transparent'}`}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Resultado de esta llamada</p>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs text-gray-500 font-medium">Respuesta</label>
                      <DispositionSelector
                        disposition={disposition}
                        onChange={handleDispositionChange}
                        error={respuestaError}
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs text-gray-500 font-medium">Notas de la llamada</label>
                      <textarea
                        rows={3}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                        placeholder="Comentarios adicionales de esta llamada..."
                        value={callNotes}
                        onChange={(e) => setCallNotes(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="relative h-0 shrink-0 z-10">
                    {latestLogSnapshot && (
                      <div className="absolute inset-x-0 top-0 -translate-y-1/2 flex items-center gap-3 px-1 pointer-events-none" aria-hidden>
                        <div className="h-0.5 flex-1 rounded-full bg-gradient-to-r from-transparent via-blue-500/80 to-blue-500/40" />
                        <span className="flex items-center gap-1.5 shrink-0 text-xs font-medium text-blue-600 bg-gray-50 px-1">
                          <CheckCircle2 size={12} className="text-blue-500" />
                          Registro guardado
                        </span>
                        <div className="h-0.5 flex-1 rounded-full bg-gradient-to-l from-transparent via-blue-500/80 to-blue-500/40" />
                      </div>
                    )}
                  </div>

                  {/* Agendar */}
                  <div className={`border border-gray-200 rounded-lg overflow-hidden transition-opacity ${agendarDisabled ? 'opacity-40 pointer-events-none select-none' : ''} ${latestLogSnapshot ? 'bg-amber-50' : 'bg-white'}`}>
                    <div className="bg-gray-100 border-b border-gray-200 px-4 py-2 flex items-center gap-2">
                      <CalendarClock size={14} className="text-gray-500" />
                      <span className="text-sm font-semibold text-gray-600">Agendar</span>
                      {effectiveDisposition === 'VOLVER_A_LLAMAR' || effectiveDisposition === 'CALLBACK'
                        ? <span className="badge bg-blue-100 text-blue-700 ml-1">Requerido</span>
                        : <span className="text-xs text-gray-400">(opcional)</span>}
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <div className="flex flex-col gap-0.5">
                          <label className="text-xs text-gray-500 font-medium">Fecha</label>
                          <input
                            type="date"
                            className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none w-full"
                            value={schedDate}
                            min={new Date().toISOString().split('T')[0]}
                            onChange={(e) => setSchedDate(e.target.value)}
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <label className="text-xs text-gray-500 font-medium">Hora</label>
                          <input
                            type="time"
                            className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none w-full"
                            value={schedTime}
                            onChange={(e) => setSchedTime(e.target.value)}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const d = new Date()
                            d.setDate(d.getDate() + 1)
                            setSchedDate(d.toISOString().split('T')[0])
                            setSchedTime('09:00')
                          }}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 transition-colors h-[34px] bg-white"
                        >
                          <Clock size={13} /> Primer libre
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="sticky bottom-0 z-10 border-t border-gray-200 bg-gray-50/95 px-3 py-3 backdrop-blur-sm lg:px-4">
                    <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3">
                      <button onClick={() => saveMutation.mutate(false)} disabled={saveMutation.isPending || !canSaveCallResult}
                        title="Guardar resultado (Ctrl+Enter)"
                        className="flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 sm:flex-none">
                        <Save size={15} />
                        {saveMutation.isPending ? 'Guardando...' : latestLogSnapshot ? 'Guardar actualización' : 'Guardar resultado'}
                      </button>
                      <button onClick={() => saveMutation.mutate(true)} disabled={saveMutation.isPending || isLast || !canSaveCallResult}
                        className="flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 sm:flex-none">
                        Guardar y siguiente empresa <ChevronRight size={15} />
                      </button>
                      <button
                        onClick={() => saveMutation.mutate('nextPending')}
                        disabled={saveMutation.isPending || !canSaveCallResult || !nextPendingTarget}
                        title="Guarda y salta a la próxima empresa sin registro en este lote (Ctrl+Shift+Enter)"
                        className="flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] border-2 border-indigo-500 text-indigo-700 hover:bg-indigo-50 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 sm:flex-none"
                      >
                        Guardar y siguiente pendiente <ChevronRight size={15} />
                      </button>
                      <div className="flex gap-2 sm:ml-auto">
                        <DetailRecordNav
                          variant="footer"
                          onFirstRegistered={navigateWithSave(goToFirstRegistered)}
                          onPrev={navigateWithSave(goPrev)}
                          onNext={navigateWithSave(goNext)}
                          onFirstEmpty={navigateWithSave(goToFirstEmpty)}
                          isFirst={isFirst}
                          isLast={isLast}
                          atFirstRegistered={atFirstRegistered}
                          atFirstEmpty={atFirstEmpty}
                          noRegistered={!firstRegisteredTarget}
                          noEmpty={!firstEmptyTarget}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Líneas móviles */}
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-100 border-b border-gray-200 px-4 py-2">
                      <span className="text-sm font-semibold text-gray-600">Líneas móviles</span>
                    </div>
                    <div className="p-4 overflow-x-auto">
                      {visibleMobileLines.length === 0 ? (
                        <p className="text-sm text-gray-400 italic">Sin líneas móviles registradas</p>
                      ) : (
                        <table className="w-full text-sm min-w-[320px]">
                          <thead>
                            <tr className="border-b border-gray-200 text-left">
                              <th className="pb-2 pr-3 font-medium text-gray-600">Número</th>
                              <th className="pb-2 pr-3 font-medium text-gray-600">Estado línea</th>
                              <th className="pb-2 pr-3 font-medium text-gray-600">Plan</th>
                              <th className="pb-2 font-medium text-gray-600">Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleMobileLines.map((line) => (
                              <tr key={line.id} className="border-b border-gray-100 last:border-0">
                                <td className="py-2 pr-3 font-mono text-gray-800">
                                  {line.numeroTelefono || <span className="text-gray-400 italic font-sans">—</span>}
                                </td>
                                <td className="py-2 pr-3 text-gray-700">{line.estadoLinea || '—'}</td>
                                <td className="py-2 pr-3 text-gray-700">{line.plan || '—'}</td>
                                <td className="py-2 text-gray-700">{line.estado || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* ── Right panel: Agendados + Historial ── */}
          <div
            ref={rightPanelRef}
            className="flex flex-col bg-white overflow-hidden min-h-0 border-t border-gray-200 flex-1 max-h-[45vh] lg:max-h-none lg:w-72 lg:shrink-0 lg:border-l lg:border-t-0 lg:flex-none"
          >
            <div className="lg:hidden flex border-b border-gray-200 bg-gray-50 shrink-0">
              <button
                type="button"
                onClick={() => setMobilePanelTab('agendados')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors min-h-[44px] ${
                  mobilePanelTab === 'agendados'
                    ? 'text-blue-700 border-b-2 border-blue-600 bg-white'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <CalendarClock size={14} />
                Agendados
                {overdueCount > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{overdueCount}</span>}
                {todayCount > 0 && <span className="bg-amber-400 text-amber-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{todayCount}</span>}
              </button>
              <button
                type="button"
                onClick={() => setMobilePanelTab('historial')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors min-h-[44px] ${
                  mobilePanelTab === 'historial'
                    ? 'text-blue-700 border-b-2 border-blue-600 bg-white'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <History size={14} />
                Historial
                <span className="text-[10px] text-gray-400">({historialSplit.primaryCount})</span>
              </button>
            </div>

            {/* ── AGENDADOS ── altura ajustable con scroll interno */}
            <div
              className={`flex flex-col overflow-hidden min-h-0 shrink-0 ${
                mobilePanelTab === 'agendados' ? 'flex-1 flex' : 'hidden'
              } lg:flex lg:shrink-0 lg:flex-none`}
              style={isLg ? { height: `${agendadosSplitPct}%` } : undefined}
            >
              <div className="bg-blue-600 text-white px-4 py-2.5 items-center justify-between shrink-0 hidden lg:flex">
                <div className="flex items-center gap-2">
                  <CalendarClock size={14} />
                  <span className="font-semibold text-sm">Agendados</span>
                </div>
                <div className="flex gap-1">
                  {overdueCount > 0 && <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{overdueCount}</span>}
                  {todayCount > 0 && <span className="bg-amber-400 text-amber-900 text-xs font-bold px-1.5 py-0.5 rounded-full">{todayCount}</span>}
                </div>
              </div>

              {/* Tabs — solo para admins */}
              {isAdmin && (
                <div className="flex border-b border-gray-200 bg-gray-50 shrink-0">
                  <button
                    onClick={() => setCbTab('own')}
                    className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${
                      cbTab === 'own'
                        ? 'text-blue-700 border-b-2 border-blue-600 bg-white'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Míos ({ownCallbacks.length})
                  </button>
                  <button
                    onClick={() => setCbTab('team')}
                    className={`flex-1 py-1.5 text-xs font-semibold transition-colors ${
                      cbTab === 'team'
                        ? 'text-blue-700 border-b-2 border-blue-600 bg-white'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Equipo ({callbackList.length})
                  </button>
                </div>
              )}

              <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable] p-2 space-y-1.5">
                {activeList.length === 0 ? (
                  <div className="text-center text-gray-400 py-4 text-xs px-2">
                    <CalendarClock size={20} className="mx-auto mb-1.5 opacity-40" />
                    {cbTab === 'own' || !isAdmin ? 'Sin callbacks propios pendientes' : 'Sin callbacks pendientes en el equipo'}
                  </div>
                ) : (
                  activeList.map((cb) => {
                    const isCurrent = cb.company.id === currentClient?.id
                    const cbDate = new Date(cb.scheduledAt)
                    const isOverdue = isPast(cbDate)
                    const canComplete = isOverdue && (isAdmin || cb.agent.id === user?.id)
                    return (
                      <div
                        key={cb.id}
                        className={`flex items-stretch gap-1 rounded border text-xs transition-all ${callbackColor(cb.scheduledAt)} ${isCurrent ? 'ring-2 ring-blue-400' : ''}`}
                      >
                        <button
                          onClick={() => goToClientById(cb.company.id, {
                            callLogId: cb.callLogId,
                            contactId: cb.callLog?.contact?.id,
                          })}
                          className="flex-1 min-w-0 text-left px-2.5 py-2"
                        >
                          <p className="font-semibold truncate leading-tight">{cb.company.razonSocial || cb.company.ruc}</p>
                          <p className="opacity-70 truncate text-[10px]">
                            {cb.callLog?.contact
                              ? `${cb.callLog.contact.nombre.split(' ')[0]}${cb.callLog.contact.telefono ? ' · ' + cb.callLog.contact.telefono : ''}`
                              : (cb.company.contacts?.[0]?.telefono ?? cb.company.ruc)}
                          </p>
                          {cbTab === 'team' && isAdmin && (
                            <p className="text-[10px] opacity-60 truncate">→ {cb.agent.name}</p>
                          )}
                          <div className="flex items-center gap-1 mt-0.5 opacity-75">
                            <Clock size={9} />
                            <span className="text-[10px]">{format(cbDate, 'dd/MM/yy HH:mm')}</span>
                          </div>
                          {cb.notes && <p className="opacity-60 truncate mt-0.5 italic text-[10px]">{cb.notes}</p>}
                        </button>
                        {canComplete && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setCompleteConfirm({
                                id: cb.id,
                                label: cb.company.razonSocial || cb.company.ruc,
                                scheduledAt: cb.scheduledAt,
                                companyId: cb.company.id,
                              })
                            }}
                            disabled={completeMutation.isPending}
                            title="Marcar como completado"
                            className="shrink-0 self-center px-1.5 py-2 mr-1 rounded text-green-600 hover:bg-green-100 disabled:opacity-50"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
              <div className="border-t border-gray-100 px-3 py-1.5 shrink-0 bg-gray-50 flex items-center gap-3">
                <div className="flex items-center gap-1 text-[10px] text-red-500"><AlertCircle size={8} /> Vencido</div>
                <div className="flex items-center gap-1 text-[10px] text-amber-600"><Clock size={8} /> Hoy</div>
                <div className="flex items-center gap-1 text-[10px] text-blue-600"><CalendarClock size={8} /> Próximo</div>
              </div>
            </div>

            {/* ── Resize handle ── */}
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-valuenow={agendadosSplitPct}
              onMouseDown={handleSplitMouseDown}
              className="hidden lg:flex shrink-0 h-1.5 cursor-row-resize bg-gray-100 hover:bg-blue-100 border-y border-gray-200 items-center justify-center group"
            >
              <div className="w-10 h-0.5 bg-gray-300 group-hover:bg-blue-400 rounded-full" />
            </div>

            {/* ── 3. HISTORIAL DE LLAMADAS ── flex-1, scroll, más recientes primero */}
            <div
              className={`min-h-0 overflow-hidden flex flex-col ${
                mobilePanelTab === 'historial' ? 'flex-1 flex' : 'hidden'
              } lg:flex-1 lg:flex`}
            >
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200 shrink-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                  <History size={10} /> Historial de llamadas
                </p>
                <div className="flex items-center gap-2">
                  {displayContacts.length > 1 && (
                    <div className="flex bg-gray-200 rounded p-0.5 gap-0.5">
                      <button
                        onClick={() => setHistorialScope('contact')}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${historialScope === 'contact' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >Contacto</button>
                      <button
                        onClick={() => setHistorialScope('company')}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${historialScope === 'company' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                      >Empresa</button>
                    </div>
                  )}
                  <span className="text-xs text-gray-400">{historialSplit.primaryCount}</span>
                </div>
              </div>
              {!detail || !historialSplit.hasAnyLogs ? (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <AlertCircle size={22} className="mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Sin llamadas registradas</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable] p-3 space-y-2 bg-gray-50">
                  {historialSplit.primaryCount === 0 ? (
                    historialScope === 'contact' && displayContacts.length > 1 ? (
                      <div className="flex items-center justify-center py-8 text-gray-400">
                        <div className="text-center">
                          <AlertCircle size={20} className="mx-auto mb-2 opacity-30" />
                          <p className="text-xs">
                            {isAdmin ? 'Sin llamadas para este contacto' : 'Sin llamadas propias para este contacto'}
                          </p>
                          <button onClick={() => setHistorialScope('company')} className="mt-1.5 text-[11px] text-blue-500 hover:underline">Ver toda la empresa</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center py-8 text-gray-400">
                        <div className="text-center">
                          <AlertCircle size={20} className="mx-auto mb-2 opacity-30" />
                          <p className="text-xs">
                            {isAdmin ? 'Sin llamadas registradas' : 'Sin llamadas propias registradas'}
                          </p>
                        </div>
                      </div>
                    )
                  ) : (
                    historialSplit.primaryLogs.map((log) => (
                      <HistorialCallLogCard
                        key={log.id}
                        log={log}
                        linkedCb={detail.callbacks?.find((c) => c.callLogId === log.id)}
                      />
                    ))
                  )}

                  {!isAdmin && historialSplit.archivedCount > 0 && (
                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowPreviousHistorial((prev) => !prev)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-dashed border-gray-300 text-xs text-gray-600 hover:bg-gray-100/80 hover:border-gray-400 transition-colors"
                      >
                        <span>
                          {showPreviousHistorial
                            ? 'Ocultar historial anterior'
                            : `Historial anterior (${historialSplit.archivedCount})`}
                        </span>
                        {showPreviousHistorial ? (
                          <ChevronDown size={14} className="shrink-0 text-gray-400" />
                        ) : (
                          <ChevronRight size={14} className="shrink-0 text-gray-400" />
                        )}
                      </button>
                      {showPreviousHistorial &&
                        historialSplit.archivedLogs.map((log) => (
                          <HistorialCallLogCard
                            key={log.id}
                            log={log}
                            linkedCb={detail.callbacks?.find((c) => c.callLogId === log.id)}
                            muted
                          />
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ══════════════════════ GRID / KANBAN VIEW ═══════════════════ */}
      {viewMode === 'grid' && (
        <div className="flex-1 overflow-y-auto bg-gray-50 p-4 lg:p-6 space-y-5">
          {/* Search + filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                className="input pl-9"
                placeholder="Buscar por nombre o teléfono..."
                value={gridSearch}
                onChange={(e) => { setGridSearch(e.target.value); setGridPage(1) }}
              />
            </div>
            {batches.length > 0 && (
              <div className="flex flex-col gap-1 shrink-0 w-full sm:w-auto sm:min-w-[160px]">
                <label htmlFor="grid-batch-filter" className="text-xs text-gray-500 font-medium">
                  Lote
                </label>
                <select
                  id="grid-batch-filter"
                  value={selectedBatchId}
                  onChange={(e) => switchBatch(e.target.value)}
                  className="input text-sm h-9 py-1.5 w-full"
                >
                  <option value="">
                    Todos los lotes ({batchMetricsLabel(countCompanies(allClients), allContactCount)})
                  </option>
                  {batches.map((b, i) => {
                    const batchClients = allClients.filter((c) => c.importBatch?.id === b.id)
                    return (
                      <option key={b.id} value={b.id}>
                        {i === 0 ? '★ ' : ''}{batchLabelShort(b)} ({batchMetricsLabel(countCompanies(batchClients), countContacts(batchClients))})
                      </option>
                    )
                  })}
                </select>
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {GRID_STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  title={getGridStatusFilterTitle(f.value, isAdmin)}
                  onClick={() => { setGridStatus(f.value); setGridPage(1) }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    gridStatus === f.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cards */}
          {loadingGrid ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => <div key={i} className="h-40 bg-gray-200 rounded-xl animate-pulse" />)}
            </div>
          ) : gridClients.length === 0 ? (
            <div className="card p-12 text-center text-gray-400">
              <PhoneCall size={40} className="mx-auto mb-2" />
              <p className="font-medium">No hay clientes en esta categoría</p>
              <p className="text-sm mt-1">Prueba otro filtro</p>
            </div>
          ) : (
            <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 transition-opacity ${fetchingGrid ? 'opacity-60' : ''}`}>
              {gridClients.map((c: {
                id: string; ruc: string; razonSocial?: string
                contacts: { nombre: string; telefono?: string }[]
                plan?: string; notes?: string; status: string
                _count: { callLogs: number; callbacks: number }
              }) => (
                <div key={c.id} className="card p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate text-sm">{c.razonSocial || c.ruc}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{c.ruc}</p>
                      {c.contacts?.[0] && (
                        <div className="flex items-center gap-1 text-xs text-gray-600 mt-0.5">
                          <Phone size={11} className="text-gray-400 shrink-0" />
                          {c.contacts[0].telefono ? (
                            <a href={`tel:${c.contacts[0].telefono}`} className="font-mono hover:text-blue-600">
                              {c.contacts[0].telefono}
                            </a>
                          ) : (
                            <span className="font-mono">—</span>
                          )}
                        </div>
                      )}
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="text-xs text-gray-400 space-y-0.5 flex-1">
                    {c.contacts.length > 1 && <p className="text-blue-500">{c.contacts.length} contactos</p>}
                    {c.plan && <p className="truncate">Plan: <span className="text-gray-600">{c.plan}</span></p>}
                    {c.notes && <p className="truncate text-gray-500 italic">{c.notes}</p>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><History size={10} />{c._count.callLogs} llamada{c._count.callLogs !== 1 ? 's' : ''}</span>
                    {c._count.callbacks > 0 && <span className="text-blue-500">{c._count.callbacks} callback{c._count.callbacks !== 1 ? 's' : ''}</span>}
                  </div>
                  <button
                    onClick={() => {
                      setSelectedClient(c)
                    }}
                    disabled={c.status === 'DO_NOT_CALL' || c.status === 'CONVERTED'}
                    className={`btn w-full justify-center text-xs py-2 ${
                      c.status === 'DO_NOT_CALL' || c.status === 'CONVERTED'
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'btn-primary'
                    }`}
                  >
                    <Phone size={13} />
                    {c.status === 'DO_NOT_CALL' ? 'No llamar' : c.status === 'CONVERTED' ? 'Convertido' : 'Registrar llamada'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {gridTotal > 30 && (
            <div className="flex items-center justify-between text-sm text-gray-500 pt-2">
              <p>{(gridPage - 1) * 30 + 1}–{Math.min(gridPage * 30, gridTotal)} de {gridTotal}</p>
              <div className="flex gap-2">
                <button onClick={() => setGridPage((p) => Math.max(1, p - 1))} disabled={gridPage === 1} className="btn-secondary py-1.5">Anterior</button>
                <button onClick={() => setGridPage((p) => p + 1)} disabled={gridPage * 30 >= gridTotal} className="btn-secondary py-1.5">Siguiente</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Call modal (grid view) */}
      {selectedClient && (
        <CallModal
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
        />
      )}

      {/* Conservar agenda confirmation */}
      {agendaConfirm && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                  <CalendarClock size={20} className="text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Conservar fecha de agenda</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Hay agendado el {agendaConfirm.dateStr}. ¿Desea conservar la misma fecha?
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                <button
                  type="button"
                  onClick={() => resolveAgendaConfirm(true)}
                  className="btn-primary justify-center flex-1"
                >
                  Sí, conservar fecha
                </button>
                <button
                  type="button"
                  onClick={() => resolveAgendaConfirm(false)}
                  className="btn-secondary justify-center flex-1"
                >
                  No, corregir fecha
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <CompleteCallbackModal
        confirm={completeConfirm}
        onClose={() => setCompleteConfirm(null)}
        onConfirm={handleConfirmComplete}
        isPending={completeMutation.isPending}
      />

      {/* ══════════════════════ LIST VIEW ══════════════════════════ */}
      {viewMode === 'list' && (() => {
        const queueIndexById = new Map(clients.map((c, i) => [c.id, i]))
        const listFiltered = listClients.filter((c) => {
          const q = listSearch.toLowerCase()
          const matchSearch = !q || c.ruc.toLowerCase().includes(q) || (c.razonSocial ?? '').toLowerCase().includes(q) || c.contacts.some((ct) => ct.nombre.toLowerCase().includes(q) || (ct.telefono ?? '').includes(q))
          return matchSearch
        })
        const listSorted = [...listFiltered].sort(
          (a, b) =>
            (queueIndexById.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
            (queueIndexById.get(b.id) ?? Number.MAX_SAFE_INTEGER)
        )
        return (
          <div className="flex-1 overflow-y-auto p-4 lg:p-5 space-y-4">
            {/* Filters — row 1: search, cola, lote */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                <div className="relative flex-1 min-w-[12rem] w-full sm:min-w-48">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    className="input w-full pl-9 text-sm h-9 py-1.5"
                    placeholder="Buscar nombre o teléfono"
                    value={listSearch}
                    onChange={(e) => setListSearch(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1 shrink-0 w-full sm:w-auto sm:min-w-[160px]">
                  <label htmlFor="list-queue-filter" className="text-xs text-gray-500 font-medium">
                    Cola
                  </label>
                  <ColaFilterDropdown
                    id="list-queue-filter"
                    value={listCola}
                    isAdmin={isAdmin}
                    options={LIST_COLA_OPTIONS}
                    getDescription={getColaOptionTitle}
                    onChange={(cola) => applyListFilters(cola, null)}
                  />
                </div>
                {batches.length > 0 && (
                  <div className="flex flex-col gap-1 shrink-0 w-full sm:w-auto sm:min-w-[160px]">
                    <label htmlFor="list-batch-filter" className="text-xs text-gray-500 font-medium">
                      Lote
                    </label>
                    <select
                      id="list-batch-filter"
                      value={selectedBatchId}
                      onChange={(e) => switchBatch(e.target.value)}
                      className="input text-sm h-9 py-1.5 w-full"
                    >
                      <option value="">
                        Todos los lotes ({batchMetricsLabel(countCompanies(allClients), allContactCount)})
                      </option>
                      {batches.map((b, i) => {
                        const batchClients = allClients.filter((c) => c.importBatch?.id === b.id)
                        return (
                          <option key={b.id} value={b.id}>
                            {i === 0 ? '★ ' : ''}{batchLabelShort(b)} ({batchMetricsLabel(countCompanies(batchClients), countContacts(batchClients))})
                          </option>
                        )
                      })}
                    </select>
                  </div>
                )}
                <div className="flex items-center gap-2 shrink-0 pb-0.5 sm:ml-auto">
                  {(listDrilldown || (listCola !== 'FUNNEL' && listCola !== 'ALL')) && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                      Filtro: {getListFilterLabel(listCola, listDrilldown)}
                      <button
                        type="button"
                        onClick={() => applyListFilters('ALL', null)}
                        className="p-0.5 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700"
                        aria-label="Quitar filtro"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  )}
                  <span
                    className="text-xs text-gray-400"
                    title={getColaOptionTitle(listCola, isAdmin)}
                  >
                    {listFiltered.length} empresas
                    {hiddenListCount > 0 && (
                      <span className="text-gray-300" title="Empresas archivadas ocultas de la cola">
                        {' '}({hiddenListCount} archivadas ocultas)
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Row 2: Embudo comercial */}
              <div className="w-full">
                <p className="text-xs font-medium text-gray-500 mb-1.5">Embudo comercial</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    title={getColaOptionTitle('ALL', isAdmin)}
                    onClick={() => applyListFilters('ALL', null)}
                    className={`flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-[5.5rem] text-center rounded-lg text-xs font-medium transition-colors border shrink-0 ${
                      listCola === 'ALL' && !listDrilldown
                        ? 'bg-gray-100 text-gray-700 border-gray-300 ring-2 ring-offset-1 ring-green-500'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-xs leading-tight max-w-[8rem] text-balance">Todos</span>
                  </button>
                  {LIST_FILTERS_FUNNEL.map((f) => {
                    const isActive = listDrilldown === f.value
                    const funnelMode = listCola === 'FUNNEL' && !listDrilldown
                    const colorClasses = listChipColorClasses(f.value)
                    return (
                      <button
                        key={f.value}
                        type="button"
                        title={`${f.fullLabel} — Etapa ${f.aclaracion} del embudo comercial.`}
                        onClick={() =>
                          applyListFilters('FUNNEL', isActive ? null : f.value)
                        }
                        className={`flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-[5.5rem] text-center rounded-lg text-xs font-medium transition-colors border shrink-0 ${
                          isActive
                            ? `${colorClasses} border-current ring-2 ring-offset-1 ring-green-500`
                            : funnelMode
                            ? `${colorClasses} border-current opacity-80`
                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <span className="text-xs leading-tight max-w-[8rem] text-balance">
                          {f.shortLabel}
                        </span>
                        <span className="text-[10px] font-semibold opacity-80">
                          {f.aclaracion}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="card overflow-x-auto">
              {loadingListView ? (
                <div className="p-8 text-center text-gray-400 text-sm">Cargando...</div>
              ) : listFiltered.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <User size={36} className="mx-auto mb-2" />
                  <p className="text-sm">Sin resultados</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">#</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">RUC</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Razón Social / Contacto</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Teléfono</th>
                      {!selectedBatchId && <th className="text-left px-4 py-3 font-medium text-gray-600">Lote</th>}
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Respuesta</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Próximo agendado</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Llamadas</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {listSorted.map((c) => {
                      const realIdx = queueIndexById.get(c.id) ?? -1
                      const navIdx = realIdx
                      const nextCb = callbackList
                        .filter((cb) => cb.company.id === c.id)
                        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0]
                      const cbDate = nextCb ? new Date(nextCb.scheduledAt) : null
                      const cbColor = cbDate
                        ? isPast(cbDate)
                          ? 'text-red-600 bg-red-50 border border-red-200'
                          : isToday(cbDate)
                          ? 'text-amber-700 bg-amber-50 border border-amber-200'
                          : 'text-blue-700 bg-blue-50 border border-blue-200'
                        : ''
                      const aclaracion = c.lastAclaracion || (c.lastDisposition ? getAclaracionForDisposition(c.lastDisposition) : '')
                      return (
                        <tr
                          key={c.id}
                          className={`hover:bg-blue-50 cursor-pointer transition-colors ${
                            navIdx === currentIndex ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                          }`}
                          onClick={() => openDetailFromList(realIdx)}
                        >
                          <td className="px-4 py-2.5 text-gray-400 text-xs">{realIdx >= 0 ? realIdx + 1 : '—'}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{c.ruc}</td>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-gray-900 text-sm">{c.razonSocial || <span className="text-gray-400 italic text-xs">Sin razón social</span>}</p>
                            {c.contacts?.[0] && (
                              <p className="text-xs text-gray-400">{c.contacts[0].nombre}</p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">
                            {c.contacts?.[0]?.telefono ? (
                              <a href={`tel:${c.contacts[0].telefono}`} className="hover:text-blue-600" onClick={(e) => e.stopPropagation()}>
                                {c.contacts[0].telefono}
                              </a>
                            ) : '—'}
                          </td>
                          {!selectedBatchId && (
                            <td className="px-4 py-2.5 text-xs text-gray-500">
                              {c.importBatch
                                ? c.importBatch.filename.replace(/\.[^.]+$/, '').slice(0, 18)
                                : '—'}
                            </td>
                          )}
                          <td className="px-4 py-2.5">
                            {c.lastDisposition ? (
                              <div className="flex flex-wrap items-center gap-1.5">
                                <DispositionBadge disposition={c.lastDisposition} />
                                {aclaracion ? (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                    {aclaracion}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <StatusBadge status="PENDING" />
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            {cbDate ? (
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cbColor}`}>
                                <CalendarClock size={11} />
                                {format(cbDate, 'dd/MM HH:mm', { locale: es })}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center text-gray-500">
                            {(c as ClientSummary & { _count?: { callLogs: number } })._count?.callLogs ?? 0}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="text-xs text-blue-500 hover:underline">Ver detalle →</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

