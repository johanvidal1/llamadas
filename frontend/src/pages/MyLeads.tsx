import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getClients, getClient, logCall, updateCall, updateClient, updateContact, getCallbacks, downloadImportExport } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
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
} from 'lucide-react'
import CallModal from '../components/CallModal'
import { format, isPast, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { StatusBadge, DISPOSITION_CONFIG, getDispositionBorderColor } from '../components/StatusBadge'
import {
  RESPUESTA_SELECT_OPTIONS,
  RESPONSE_OPTIONS,
  getDispositionLabel,
  getResponseOption,
} from '../config/responseOptions'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientSummary {
  id: string
  ruc: string
  razonSocial?: string
  status: string
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
  if (isPast(d) && !isToday(d)) return 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100'
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
  callbacks: ClientDetail['callbacks']
): CallLogSnapshot {
  const linkedCb = callbacks?.find((c) => c.callLogId === log.id)
  const schedAt = linkedCb ? new Date(linkedCb.scheduledAt) : null
  return {
    disposition: log.disposition,
    aclaracion: log.aclaracion,
    notes: log.notes,
    schedDate: schedAt ? format(schedAt, 'yyyy-MM-dd') : '',
    schedTime: schedAt ? format(schedAt, 'HH:mm') : '09:00',
    schedNotes: linkedCb?.notes,
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReadField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-500 font-medium">{label}</span>
      <div className="bg-gray-100 border border-gray-200 rounded px-3 py-1.5 text-sm text-gray-700 min-h-[34px] select-all font-mono">
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
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-500 font-medium">{label}</span>
      <input
        type="text"
        className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
]

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

// ─── Main Component ────────────────────────────────────────────────────────────

export default function MyLeads() {
  const qc = useQueryClient()
  const { user, isAdmin } = useAuth()
  const isLg = useIsLg()

  // ── View toggle (persisted)
  const [viewMode, setViewMode] = useState<'detail' | 'grid' | 'list'>(
    () => (localStorage.getItem('myLeadsView') as 'detail' | 'grid' | 'list') || 'detail'
  )
  const switchView = (mode: 'detail' | 'grid' | 'list') => {
    setViewMode(mode)
    localStorage.setItem('myLeadsView', mode)
  }

  // ── List view state
  const [listSearch, setListSearch] = useState('')
  const [listStatus, setListStatus] = useState('')

  // ── Grid view state
  const [gridSearch, setGridSearch] = useState('')
  const [gridStatus, setGridStatus] = useState('')
  const [gridPage, setGridPage] = useState(1)
  const [selectedClient, setSelectedClient] = useState<{ id: string; ruc: string; razonSocial?: string; contacts?: { id?: string; nombre: string; tipoContacto?: string; telefono?: string }[] } | null>(null)

  // ── Batch filter (shared between detail + grid views)
  const [selectedBatchId, setSelectedBatchId] = useState<string>('')

  // ── Agendados sidebar tab
  const [cbTab, setCbTab] = useState<'own' | 'team'>('own')
  const [historialScope, setHistorialScope] = useState<'contact' | 'company'>('contact')
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
  const [editingCallLogId, setEditingCallLogId] = useState<string | null>(null)
  const [previousSnapshot, setPreviousSnapshot] = useState<CallLogSnapshot | null>(null)
  const [disposition, setDisposition] = useState('')
  const [callNotes, setCallNotes] = useState('')
  const [schedDate, setSchedDate] = useState('')
  const [schedTime, setSchedTime] = useState('')
  const pendingCallLogIdRef = useRef<string | null>(null)
  const pendingContactIdRef = useRef<string | null>(null)
  const pendingContactIdxRef = useRef<number | null>(null)
  const needsContactResolveRef = useRef(false)
  const [editTelefono, setEditTelefono] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editDni, setEditDni] = useState('')
  const [exporting, setExporting] = useState(false)
  const savedContactRef = useRef<{ id: string; telefono: string; email: string; dni: string } | null>(null)
  const lastSyncedContactKey = useRef<string | null>(null)

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
  const clients: ClientSummary[] = clientsData?.clients ?? []
  const total = clients.length
  const currentClient = clients[currentIndex]

  // Load detail for current client
  const { data: clientDetail, isFetching: loadingDetail } = useQuery({
    queryKey: ['client-detail', currentClient?.id],
    queryFn: () => getClient(currentClient!.id),
    enabled: !!currentClient?.id,
  })
  const detail = clientDetail as ClientDetail | undefined

  // Prefer detail contacts for the active company only; fall back to list summary while loading
  const displayContacts: ClientDetail['contacts'] =
    detail != null && detail.id === currentClient?.id && (detail.contacts?.length ?? 0) > 0
      ? detail.contacts
      : (currentClient?.contacts ?? []).map((ct, idx) => ({
          id: (ct as { id?: string }).id ?? `summary-${currentClient?.id ?? 'x'}-${idx}`,
          nombre: ct.nombre ?? '',
          tipoContacto: ct.tipoContacto,
          telefono: ct.telefono,
          email: ct.email,
          dni: ct.dni,
        }))

  // Load pending callbacks for Agendados panel
  const { data: agendados = [] } = useQuery({
    queryKey: ['callbacks', 'pending'],
    queryFn: () => getCallbacks({ completed: false }),
    refetchInterval: 60000,
  })
  const callbackList = agendados as Callback[]

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

  // Sync company fields when company changes
  useEffect(() => {
    if (detail) {
      setEditPlan(detail.plan ?? '')
      setHistorialScope('contact')
    }
  }, [detail?.id])

  const clearEditableCallFields = useCallback(() => {
    setDisposition('')
    setCallNotes('')
    setSchedDate('')
    setSchedTime('')
  }, [])

  const hydrateFromSnapshot = useCallback((snapshot: CallLogSnapshot) => {
    setDisposition(snapshot.disposition)
    setCallNotes(snapshot.notes ?? '')
    setSchedDate(snapshot.schedDate ?? '')
    setSchedTime(snapshot.schedTime || '09:00')
  }, [])

  // Hydrate call log view/edit state when contact or detail changes
  useEffect(() => {
    if (!detail || !user?.id) return

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

    const idx = Math.min(contactIdx, Math.max(0, displayContacts.length - 1))
    const contact = displayContacts[idx]
    if (!contact?.id || contact.id.startsWith('summary-')) {
      setEditingCallLogId(null)
      setPreviousSnapshot(null)
      clearEditableCallFields()
      return
    }

    let targetLog: CallLogEntry | undefined
    if (pendingCallLogIdRef.current) {
      targetLog = detail.callLogs.find((l) => l.id === pendingCallLogIdRef.current)
      pendingCallLogIdRef.current = null
    } else {
      targetLog = [...detail.callLogs]
        .filter((l) => l.contact?.id === contact.id && l.agentId === user.id)
        .sort((a, b) => new Date(b.calledAt).getTime() - new Date(a.calledAt).getTime())[0]
    }

    if (targetLog) {
      const snapshot = snapshotFromLog(targetLog, detail.callbacks)
      setEditingCallLogId(targetLog.id)
      setPreviousSnapshot(snapshot)
      hydrateFromSnapshot(snapshot)
    } else {
      setEditingCallLogId(null)
      setPreviousSnapshot(null)
      clearEditableCallFields()
    }
  }, [detail, activeContactIdx, user?.id, clearEditableCallFields, hydrateFromSnapshot, displayContacts, currentClient?.id])

  const saveActiveContactIfDirty = useCallback(async () => {
    if (!displayContacts.length) return
    const idx = Math.min(activeContactIdx, displayContacts.length - 1)
    const ct = displayContacts[idx]
    if (!ct?.id || ct.id.startsWith('summary-')) return

    const saved = savedContactRef.current
    if (!saved || saved.id !== ct.id) return

    const telefono = editTelefono.trim()
    const email = editEmail.trim()
    const dni = editDni.trim()

    if (telefono === saved.telefono && email === saved.email && dni === saved.dni) return

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

      const fromList = client.contacts?.[contactIdx]?.id
      if (fromList) return fromList

      if (clientIdx === currentIndex && detail != null && detail.id === client.id) {
        if (displayContacts.length > 0) {
          const fromDisplay = displayContacts[contactIdx]?.id
          if (fromDisplay && !fromDisplay.startsWith('summary-')) return fromDisplay
        }
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

  const contactHasAgentLog = useCallback(
    (clientIdx: number, contactIdx: number): boolean => {
      if (!user?.id) return false
      const client = clients[clientIdx]
      if (!client) return false

      const contact = client.contacts?.[contactIdx]
      const contactId = contactIdAt(clientIdx, contactIdx) ?? contact?.id

      const hasLogInDetail = (d: ClientDetail, cid: string) =>
        d.callLogs.some((l) => l.agentId === user.id && l.contact?.id === cid)

      if (contactId && !contactId.startsWith('summary-')) {
        if (clientIdx === currentIndex && detail != null && detail.id === client.id) {
          return hasLogInDetail(detail, contactId)
        }

        const cachedDetail = qc.getQueryData<ClientDetail>(['client-detail', client.id])
        if (cachedDetail?.id === client.id) {
          return hasLogInDetail(cachedDetail, contactId)
        }
      }

      if (!contact) return false
      return (contact._count?.callLogs ?? 0) > 0
    },
    [clients, currentIndex, detail, user?.id, contactIdAt, qc]
  )

  const companyHasAgentLog = useCallback(
    (clientIdx: number): boolean => {
      const n = contactCountFor(clientIdx)
      for (let i = 0; i < n; i++) {
        if (contactHasAgentLog(clientIdx, i)) return true
      }
      return false
    },
    [contactCountFor, contactHasAgentLog]
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
            detailSource.contacts?.length > 0
              ? detailSource.contacts
              : (client.contacts ?? [])
          const idx = contacts.findIndex((c) => c.id === contactId)
          if (idx >= 0) return idx
        }
      }

      const listContacts = client.contacts ?? []
      for (let i = 0; i < listContacts.length; i++) {
        if ((listContacts[i]._count?.callLogs ?? 0) > 0) {
          return i
        }
      }

      return 0
    },
    [clients, user?.id, contactCountFor, currentIndex, detail, qc]
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
    needsContactResolveRef.current = true
    setGridPage(1)
  }

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

  const saveMutation = useMutation({
    mutationFn: async (autoNext: boolean) => {
      if (!currentClient) return autoNext
      await saveActiveContactIfDirty()
      await updateClient(currentClient.id, {
        plan: editPlan || undefined,
      })

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

      if (editingCallLogId) {
        const snap = previousSnapshot
        const snapSchedTime = snap?.schedTime || '09:00'
        const hasDispositionChange = snap ? disposition !== snap.disposition : !!disposition
        const hasNotesChange = snap ? callNotes !== (snap.notes ?? '') : !!callNotes
        const hasSchedDateChange = snap ? schedDate !== (snap.schedDate ?? '') : !!schedDate
        const hasSchedTimeChange = snap ? schedTime !== snapSchedTime : !!schedTime
        const hasCallUpdate = hasDispositionChange || hasNotesChange
        const hasSchedUpdate = hasSchedDateChange || hasSchedTimeChange
        if (!hasCallUpdate && !hasSchedUpdate) {
          throw new Error('Ingresa al menos un campo para actualizar el registro')
        }
        if (disposition === 'VOLVER_A_LLAMAR' && !schedDate) {
          throw new Error('Selecciona la fecha para el callback')
        }
        await updateCall(editingCallLogId, {
          ...(hasDispositionChange ? { disposition } : {}),
          ...(hasNotesChange ? { notes: callNotes || undefined } : {}),
          ...(hasSchedUpdate ? { callbackDate: callbackDateIso } : {}),
        })
      } else if (disposition) {
        if (disposition === 'VOLVER_A_LLAMAR' && !schedDate) {
          throw new Error('Selecciona la fecha para el callback')
        }
        await logCall({
          clientId: currentClient.id,
          contactId,
          disposition,
          notes: callNotes || undefined,
          callbackDate: schedDate ? callbackDateIso : undefined,
        })
      } else if (schedDate) {
        await logCall({
          clientId: currentClient.id,
          contactId,
          disposition: 'VOLVER_A_LLAMAR',
          notes: callNotes || undefined,
          callbackDate: callbackDateIso,
        })
      }
      return autoNext
    },
    onSuccess: async (autoNext) => {
      toast.success('Guardado correctamente')
      qc.invalidateQueries({ queryKey: ['client-detail', currentClient?.id] })
      qc.invalidateQueries({ queryKey: ['callbacks'] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      if (autoNext) await goNext()
    },
    onError: (err: Error) => toast.error(err?.message ?? 'Error al guardar'),
  })

  // ─── Render ───────────────────────────────────────────────────────────────

  const gridClients = gridData?.clients ?? []
  const gridTotal = gridData?.total ?? 0
  const effectiveDisposition = disposition
  const selectedResponse = effectiveDisposition ? getResponseOption(effectiveDisposition) : undefined
  const derivedAclaracion =
    selectedResponse?.aclaracion ??
    (previousSnapshot?.aclaracion && !selectedResponse ? previousSnapshot.aclaracion : '')
  const agendarDisabled =
    selectedResponse?.disableAgendar ||
    effectiveDisposition === 'DO_NOT_CALL' ||
    effectiveDisposition === 'NOT_INTERESTED'
  const respuestaSelectOptions = useMemo(() => {
    if (
      effectiveDisposition &&
      !RESPONSE_OPTIONS.some((o) => o.code === effectiveDisposition)
    ) {
      return [
        ...RESPUESTA_SELECT_OPTIONS,
        { value: effectiveDisposition, label: `${getDispositionLabel(effectiveDisposition)} (histórico)` },
      ]
    }
    return RESPUESTA_SELECT_OPTIONS
  }, [effectiveDisposition])

  // Split callbacks: own = current user; team = all (admin only)
  const ownCallbacks = callbackList.filter((c) => c.agent.id === user?.id)
  const activeList = cbTab === 'own' || !isAdmin ? ownCallbacks : callbackList

  const todayCount = activeList.filter((c) => isToday(new Date(c.scheduledAt))).length
  const overdueCount = activeList.filter(
    (c) => isPast(new Date(c.scheduledAt)) && !isToday(new Date(c.scheduledAt))
  ).length

  // Detail view loading / empty guards are now rendered INSIDE the layout
  // (so the top bar with batch selector remains visible at all times)

  // Flat navigation helpers — prefer detail contact counts for current client
  const flatTotal = clients.reduce((sum, c, idx) => sum + contactCountFor(idx), 0)
  const globalPosition =
    clients.slice(0, currentIndex).reduce((sum, _c, idx) => sum + contactCountFor(idx), 0) +
    activeContactIdx +
    1
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
      <div className="bg-blue-800 text-white px-3 lg:px-6 py-3 flex flex-wrap items-center justify-between shrink-0 gap-2 lg:gap-4">
        <div className="flex items-center gap-2 lg:gap-4 min-w-0 text-sm flex-wrap">
          <span className="font-semibold truncate shrink-0">Migración de Operador</span>

          {/* Batch selector */}
          {batches.length > 0 && (
            <select
              value={selectedBatchId}
              onChange={(e) => switchBatch(e.target.value)}
              className="bg-blue-700 border border-blue-500 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-300 max-w-[220px] truncate"
            >
              <option value="">Todos los lotes ({allContactCount} registros)</option>
              {batches.map((b, i) => (
                <option key={b.id} value={b.id}>
                  {i === 0 ? '★ ' : ''}{b.filename.replace(/\.[^.]+$/, '')} ({countContacts(allClients.filter(c => c.importBatch?.id === b.id))} registros)
                </option>
              ))}
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
              <span className="text-blue-300 text-xs">Registro {globalPosition} / {flatTotal}:</span>
              <StatusBadge status={detail.status} />
            </div>
          )}
          {viewMode === 'grid' && (
            <span className="text-blue-300 text-xs shrink-0">{gridData?.total ?? 0} clientes</span>
          )}
        </div>

        <div className="flex items-center gap-2 lg:gap-3 shrink-0 flex-wrap">
          {/* ── View toggle ── */}
          <div className="flex bg-blue-700 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => switchView('detail')}
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
              onClick={() => switchView('grid')}
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
              onClick={() => switchView('list')}
              title="Vista lista — tabla completa de clientes"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-blue-200 hover:text-white'
              }`}
            >
              <AlignJustify size={13} /> Lista
            </button>
          </div>

          {/* ── Navigation (detail only) ── */}
          {viewMode === 'detail' && (
            <>
              <span className="text-blue-300 text-xs">{currentIndex + 1} / {total}</span>
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
          )}
        </div>
      </div>

      {/* ══════════════════════ DETAIL VIEW ══════════════════════════ */}
      {viewMode === 'detail' && (
        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden min-h-0">
          {/* ── Left: Form (scrollable) ── */}
          <div className="flex-1 overflow-y-auto bg-gray-50 p-3 lg:p-4 min-h-0">
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
            {!detail && !loadingList && clients.length > 0 && loadingDetail && (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                Cargando datos del cliente...
              </div>
            )}
            {detail && (
              <div className="space-y-3 h-full flex flex-col">

                {/* ── Datos de la Empresa ── */}
                <div className="bg-white border border-gray-200 rounded-lg p-4 shrink-0">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Empresa</p>
                  {duplicateRucCount > 1 && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800">
                        Hay {duplicateRucCount} registros con el mismo RUC ({detail.ruc}) en tu lista.
                        Revisá el lote de importación para distinguirlos.
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <ReadField label="RUC" value={detail.ruc} />
                    <div className="col-span-full sm:col-span-2">
                      <ReadField label="Razón Social" value={detail.razonSocial} />
                    </div>
                  </div>
                </div>

                {/* ── Contacto (tabs) ── */}
                <div className="bg-white border border-gray-200 rounded-lg shrink-0">
                  {displayContacts.length > 0 && (
                    <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto">
                      {displayContacts.map((ct, idx) => {
                        const { primerNombre, segundoNombre, tercerNombre } = contactNameParts(ct.nombre)
                        return (
                          <button
                            key={ct.id ?? idx}
                            onClick={navigateWithSave(async () => {
                              await saveActiveContactIfDirty()
                              setActiveContactIdx(idx)
                            })}
                            className={`px-4 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 flex flex-col items-center leading-tight min-w-[100px] ${
                              safeContactIdx === idx
                                ? 'text-blue-700 border-blue-600 bg-white'
                                : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-100'
                            }`}>
                            <span>{primerNombre || 'Contacto'}</span>
                            {(segundoNombre || tercerNombre) && (
                              <span className="flex items-center gap-1 text-[10px] font-normal opacity-75 mt-0.5">
                                {segundoNombre && <span>{segundoNombre}</span>}
                                {tercerNombre && <span>{tercerNombre}</span>}
                              </span>
                            )}
                            {ct.tipoContacto && <span className="text-[10px] font-normal opacity-60 mt-0.5 truncate max-w-full">{ct.tipoContacto}</span>}
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
                  <div className={`border border-gray-200 rounded-lg p-4 space-y-3 ${previousSnapshot ? 'bg-slate-50 border-l-4 border-l-blue-500' : 'bg-white'}`}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Resultado de esta llamada</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-gray-500 font-medium">Respuesta</label>
                        <select
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                          value={disposition}
                          onChange={(e) => {
                            const next = e.target.value
                            setDisposition(next)
                            const opt = getResponseOption(next)
                            if (opt?.disableAgendar) {
                              setSchedDate('')
                              setSchedTime('')
                            }
                          }}
                        >
                          {respuestaSelectOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-gray-500 font-medium">Aclaración</label>
                        <div className="w-full border border-gray-200 rounded px-3 py-2 text-sm bg-gray-100 text-gray-700 min-h-[38px] flex items-center">
                          {derivedAclaracion ? (
                            <span className="badge bg-slate-200 text-slate-800">{derivedAclaracion}</span>
                          ) : (
                            <span className="text-gray-400 italic">Se asigna según la respuesta</span>
                          )}
                        </div>
                      </div>
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

                  {previousSnapshot && (
                    <div className="relative flex items-center gap-3 py-1 px-1 -my-0.5" aria-hidden>
                      <div className="h-0.5 flex-1 rounded-full bg-gradient-to-r from-transparent via-blue-500/80 to-blue-500/40" />
                      <span className="flex items-center gap-1.5 shrink-0 text-xs font-medium text-blue-600">
                        <CheckCircle2 size={12} className="text-blue-500" />
                        Registro guardado
                      </span>
                      <div className="h-0.5 flex-1 rounded-full bg-gradient-to-l from-transparent via-blue-500/80 to-blue-500/40" />
                    </div>
                  )}

                  {/* Agendar */}
                  <div className={`border border-gray-200 rounded-lg overflow-hidden transition-opacity ${agendarDisabled ? 'opacity-40 pointer-events-none select-none' : ''} ${previousSnapshot ? 'bg-amber-50' : 'bg-white'}`}>
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

                  <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 py-3">
                    <button onClick={() => saveMutation.mutate(false)} disabled={saveMutation.isPending}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 sm:flex-none">
                      <Save size={15} />
                      {saveMutation.isPending ? 'Guardando...' : editingCallLogId ? 'Guardar actualización' : 'Guardar resultado'}
                    </button>
                    <button onClick={() => saveMutation.mutate(true)} disabled={saveMutation.isPending || isLast}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 sm:flex-none">
                      Guardar y siguiente empresa <ChevronRight size={15} />
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

                  {/* Líneas móviles */}
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-100 border-b border-gray-200 px-4 py-2">
                      <span className="text-sm font-semibold text-gray-600">Líneas móviles</span>
                    </div>
                    <div className="p-4 overflow-x-auto">
                      {detail.mobileLines.length === 0 ? (
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
                            {detail.mobileLines.map((line) => (
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
                <span className="text-[10px] text-gray-400">({detail?.callLogs.length ?? 0})</span>
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

              <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
                {activeList.length === 0 ? (
                  <div className="text-center text-gray-400 py-4 text-xs px-2">
                    <CalendarClock size={20} className="mx-auto mb-1.5 opacity-40" />
                    {cbTab === 'own' || !isAdmin ? 'Sin callbacks propios pendientes' : 'Sin callbacks pendientes en el equipo'}
                  </div>
                ) : (
                  activeList.map((cb) => {
                    const isCurrent = cb.company.id === currentClient?.id
                    return (
                      <button key={cb.id} onClick={() => goToClientById(cb.company.id, {
                        callLogId: cb.callLogId,
                        contactId: cb.callLog?.contact?.id,
                      })}
                        className={`w-full text-left px-2.5 py-2 rounded border text-xs transition-all ${callbackColor(cb.scheduledAt)} ${isCurrent ? 'ring-2 ring-blue-400' : ''}`}>
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
                          <span className="text-[10px]">{format(new Date(cb.scheduledAt), 'dd/MM/yy HH:mm')}</span>
                        </div>
                        {cb.notes && <p className="opacity-60 truncate mt-0.5 italic text-[10px]">{cb.notes}</p>}
                      </button>
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
                  <span className="text-xs text-gray-400">{detail?.callLogs.length ?? 0}</span>
                </div>
              </div>
              {!detail || detail.callLogs.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <AlertCircle size={22} className="mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Sin llamadas registradas</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
                  {(() => {
                    const activeContactId = activeContact?.id
                    const logs = [...detail.callLogs]
                      .filter((log) => {
                        if (historialScope === 'company' || (displayContacts.length <= 1)) return true
                        // Show logs for this contact, or logs with no contact assigned
                        return !log.contact || log.contact.id === activeContactId
                      })
                      .sort((a, b) => new Date(b.calledAt).getTime() - new Date(a.calledAt).getTime())
                    if (logs.length === 0) return (
                      <div className="flex items-center justify-center py-8 text-gray-400">
                        <div className="text-center">
                          <AlertCircle size={20} className="mx-auto mb-2 opacity-30" />
                          <p className="text-xs">Sin llamadas para este contacto</p>
                          <button onClick={() => setHistorialScope('company')} className="mt-1.5 text-[11px] text-blue-500 hover:underline">Ver toda la empresa</button>
                        </div>
                      </div>
                    )
                    return logs.map((log) => {
                      const cfg = DISPOSITION_CONFIG[log.disposition] ?? { label: getDispositionLabel(log.disposition), classes: 'bg-gray-100 text-gray-600' }
                      const linkedCb = detail.callbacks?.find((c) => c.callLogId === log.id)
                      return (
                        <div
                          key={log.id}
                          className={`bg-white rounded-lg border border-gray-200 border-l-4 ${getDispositionBorderColor(log.disposition)} p-2.5 shadow-sm`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className={`badge text-[10px] ${cfg.classes}`}>{cfg.label}</span>
                            <span className="text-[10px] text-gray-400 font-mono shrink-0">
                              {format(new Date(log.calledAt), 'dd/MM/yy HH:mm')}
                            </span>
                          </div>
                          {log.contact && (
                            <p className="text-[10px] text-blue-600 mb-1 font-medium">{log.contact.nombre}{log.contact.tipoContacto ? ` · ${log.contact.tipoContacto}` : ''}</p>
                          )}
                          {log.aclaracion && (
                            <p className="text-[11px] text-gray-500 italic mb-1">{log.aclaracion}</p>
                          )}
                          {log.notes && (
                            <p className="text-xs text-gray-700 leading-snug mb-1 bg-gray-50 rounded px-2 py-1">{log.notes}</p>
                          )}
                          {linkedCb && (
                            <div className="mt-1 pt-1 border-t border-dashed border-blue-200 space-y-0.5">
                              <div className="flex items-center gap-1 text-[10px] text-blue-600">
                                <CalendarClock size={9} />
                                <span className="font-semibold">Agendado:</span>
                                <span className="font-mono">{format(new Date(linkedCb.scheduledAt), 'dd/MM/yy HH:mm')}</span>
                                {linkedCb.completed && <span className="ml-1 text-green-600 font-semibold">✓</span>}
                              </div>
                              {linkedCb.notes && (
                                <p className="text-[10px] text-blue-500 italic pl-3 leading-snug">{linkedCb.notes}</p>
                              )}
                            </div>
                          )}
                          <p className="text-[10px] text-gray-400 mt-1.5 pt-1 border-t border-gray-100">
                            — {log.agent.name}
                          </p>
                        </div>
                      )
                    })
                  })()}
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
            <div className="flex gap-2 flex-wrap">
              {GRID_STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
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

      {/* ══════════════════════ LIST VIEW ══════════════════════════ */}
      {viewMode === 'list' && (() => {
        const STATUS_FILTERS = [
          { value: '', label: 'Todos' },
          { value: 'PENDING', label: 'Pendientes' },
          { value: 'IN_PROGRESS', label: 'En progreso' },
          { value: 'INTERESTED', label: 'Interesados' },
          { value: 'NOT_INTERESTED', label: 'No interesados' },
          { value: 'DO_NOT_CALL', label: 'No llamar' },
        ]
        const listFiltered = clients.filter((c) => {
          const matchStatus = !listStatus || c.status === listStatus
          const q = listSearch.toLowerCase()
          const matchSearch = !q || c.ruc.toLowerCase().includes(q) || (c.razonSocial ?? '').toLowerCase().includes(q) || c.contacts.some((ct) => ct.nombre.toLowerCase().includes(q) || (ct.telefono ?? '').includes(q))
          return matchStatus && matchSearch
        })
        return (
          <div className="flex-1 overflow-y-auto p-4 lg:p-5 space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  className="input pl-9 text-sm"
                  placeholder="Buscar por nombre o teléfono..."
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setListStatus(f.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      listStatus === f.value
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-gray-400 self-center shrink-0">{listFiltered.length} registros</span>
            </div>

            {/* Table */}
            <div className="card overflow-x-auto">
              {loadingList ? (
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
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Próximo agendado</th>
                      <th className="text-center px-4 py-3 font-medium text-gray-600">Llamadas</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {listFiltered.map((c, i) => {
                      const realIdx = clients.findIndex((x) => x.id === c.id)
                      // Find next pending callback for this client (sorted soonest first)
                      const nextCb = callbackList
                        .filter((cb) => cb.company.id === c.id)
                        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0]
                      const cbDate = nextCb ? new Date(nextCb.scheduledAt) : null
                      const cbColor = cbDate
                        ? isPast(cbDate) && !isToday(cbDate)
                          ? 'text-red-600 bg-red-50 border border-red-200'
                          : isToday(cbDate)
                          ? 'text-amber-700 bg-amber-50 border border-amber-200'
                          : 'text-blue-700 bg-blue-50 border border-blue-200'
                        : ''
                      return (
                        <tr
                          key={c.id}
                          className={`hover:bg-blue-50 cursor-pointer transition-colors ${
                            realIdx === currentIndex ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                          }`}
                          onClick={() => { goTo(realIdx); switchView('detail') }}
                        >
                          <td className="px-4 py-2.5 text-gray-400 text-xs">{realIdx + 1}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{c.ruc}</td>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-gray-900 text-sm">{(c as ClientSummary).razonSocial || <span className="text-gray-400 italic text-xs">Sin razón social</span>}</p>
                            {(c as ClientSummary).contacts?.[0] && (
                              <p className="text-xs text-gray-400">{(c as ClientSummary).contacts[0].nombre}</p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">
                            {(c as ClientSummary).contacts?.[0]?.telefono ? (
                              <a href={`tel:${(c as ClientSummary).contacts![0].telefono}`} className="hover:text-blue-600">
                                {(c as ClientSummary).contacts![0].telefono}
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
                          <td className="px-4 py-2.5"><StatusBadge status={c.status} /></td>
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

