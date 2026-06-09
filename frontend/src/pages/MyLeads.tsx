import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getClients, getClient, logCall, updateClient, getCallbacks } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  ChevronLeft,
  ChevronRight,
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
} from 'lucide-react'
import CallModal from '../components/CallModal'
import { format, isPast, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { StatusBadge, DISPOSITION_CONFIG } from '../components/StatusBadge'

// ─── Constants ────────────────────────────────────────────────────────────────

const RESPUESTA_OPTIONS = [
  { value: '', label: 'NINGUNO' },
  { value: 'INTERESTED', label: 'Interesado en migrar' },
  { value: 'NOT_INTERESTED', label: 'No interesado' },
  { value: 'NO_ANSWER', label: 'Sin respuesta / No contesta' },
  { value: 'BUSY', label: 'Ocupado' },
  { value: 'CALLBACK', label: 'Agendar llamada posterior' },
  { value: 'DO_NOT_CALL', label: 'No llamar (lista negra)' },
  { value: 'OTHER', label: 'Otro' },
]

const ACLARACION_OPTIONS: Record<string, string[]> = {
  INTERESTED: ['Necesita más información', 'Pide cotización', 'Quiere revisar contrato', 'Enviará documentos'],
  NOT_INTERESTED: ['Precio alto', 'Contrato vigente con otro operador', 'No necesita el servicio', 'Mala experiencia previa'],
  NO_ANSWER: ['Timbre sin respuesta', 'Buzón de voz', 'Número no disponible', 'Número equivocado'],
  BUSY: ['En reunión', 'Llamar más tarde hoy', 'Pide llamar mañana por la mañana', 'Pide llamar mañana por la tarde'],
  CALLBACK: ['Cliente solicitó la cita', 'Necesita consultar con decisor', 'Fuera de ciudad', 'Fecha específica acordada'],
  DO_NOT_CALL: ['Solicita no ser contactado', 'Número equivocado permanente', 'Cliente fallecido'],
  OTHER: ['Sin información adicional', 'Número de empresa', 'Idioma diferente'],
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClientSummary {
  id: string
  name: string
  phone: string
  status: string
  importBatch?: { id: string; filename: string; createdAt: string }
}

interface CallLogEntry {
  id: string
  disposition: string
  aclaracion?: string
  notes?: string
  calledAt: string
  agent: { name: string }
}

interface ClientDetail {
  id: string
  name: string
  phone: string
  phone2?: string
  email?: string
  address?: string
  currentOp?: string
  plan?: string
  notes?: string
  status: string
  callLogs: CallLogEntry[]
  callbacks: { id: string; callLogId?: string; scheduledAt: string; notes?: string; completed: boolean }[]
}

interface Callback {
  id: string
  scheduledAt: string
  notes?: string
  client: { id: string; name: string; phone: string }
  agent: { id: string; name: string }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function callbackColor(dt: string): string {
  const d = new Date(dt)
  if (isPast(d) && !isToday(d)) return 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100'
  if (isToday(d)) return 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
  return 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100'
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

// ─── Main Component ────────────────────────────────────────────────────────────

export default function MyLeads() {
  const qc = useQueryClient()
  const { user, isAdmin } = useAuth()

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
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string; phone: string; phone2?: string } | null>(null)

  // ── Batch filter (shared between detail + grid views)
  const [selectedBatchId, setSelectedBatchId] = useState<string>('')

  // ── Agendados sidebar tab
  const [cbTab, setCbTab] = useState<'own' | 'team'>('own')

  // ── Persist last visited client per user
  const lastClientKey = `myLeads-lastClient-${user?.id ?? 'anon'}`

  const [currentIndex, setCurrentIndex] = useState(0)
  const [editEmail, setEditEmail] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editCurrentOp, setEditCurrentOp] = useState('')
  const [editPlan, setEditPlan] = useState('')
  const [disposition, setDisposition] = useState('')
  const [aclaracion, setAclaracion] = useState('')
  const [callNotes, setCallNotes] = useState('')
  const [schedDate, setSchedDate] = useState('')
  const [schedTime, setSchedTime] = useState('09:00')
  const [schedNotes, setSchedNotes] = useState('')

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

  // Restore last position when clients load (only on initial load, index still 0)
  useEffect(() => {
    if (clients.length === 0) return
    const savedId = localStorage.getItem(lastClientKey)
    if (!savedId) return
    const idx = clients.findIndex((c) => c.id === savedId)
    if (idx > 0) setCurrentIndex(idx) // only jump if not already at that position
  }, [clients.length, lastClientKey]) // run when clients list changes size (i.e. first load)

  // Persist current client ID on every navigation
  useEffect(() => {
    if (currentClient?.id) {
      localStorage.setItem(lastClientKey, currentClient.id)
    }
  }, [currentClient?.id, lastClientKey])

  // Load detail for current client
  const { data: clientDetail, isFetching: loadingDetail } = useQuery({
    queryKey: ['client-detail', currentClient?.id],
    queryFn: () => getClient(currentClient!.id),
    enabled: !!currentClient?.id,
  })
  const detail = clientDetail as ClientDetail | undefined

  // Load pending callbacks for Agendados panel
  const { data: agendados = [] } = useQuery({
    queryKey: ['callbacks', 'pending'],
    queryFn: () => getCallbacks({ completed: false }),
    refetchInterval: 60000,
  })
  const callbackList = agendados as Callback[]

  // Sync editable fields when client changes
  useEffect(() => {
    if (detail) {
      setEditEmail(detail.email ?? '')
      setEditAddress(detail.address ?? '')
      setEditCurrentOp(detail.currentOp ?? '')
      setEditPlan(detail.plan ?? '')
      setDisposition('')
      setAclaracion('')
      setCallNotes('')
      setSchedDate('')
      setSchedTime('09:00')
      setSchedNotes('')
    }
  }, [detail?.id])

  const goTo = useCallback(
    (idx: number) => { if (idx >= 0 && idx < clients.length) setCurrentIndex(idx) },
    [clients.length]
  )

  const switchBatch = (batchId: string) => {
    setSelectedBatchId(batchId)
    setCurrentIndex(0)
    setGridPage(1)
  }

  const goToClientById = (clientId: string) => {
    const idx = clients.findIndex((c) => c.id === clientId)
    if (idx >= 0) goTo(idx)
    else toast('Este cliente no está en tu lista visible', { icon: 'ℹ️' })
  }

  const saveMutation = useMutation({
    mutationFn: async (autoNext: boolean) => {
      if (!currentClient) return autoNext
      await updateClient(currentClient.id, {
        email: editEmail || undefined,
        address: editAddress || undefined,
        currentOp: editCurrentOp || undefined,
        plan: editPlan || undefined,
      })
      if (disposition) {
        if (disposition === 'CALLBACK' && !schedDate)
          throw new Error('Selecciona la fecha para el callback')
        await logCall({
          clientId: currentClient.id,
          disposition,
          aclaracion: aclaracion || undefined,
          notes: callNotes || undefined,
          // Send callbackDate whenever a date is set (any disposition)
          callbackDate: schedDate
            ? new Date(`${schedDate}T${schedTime}:00`).toISOString()
            : undefined,
          callbackNotes: schedNotes || undefined,
        })
      } else if (schedDate) {
        // No disposition selected but date set — use CALLBACK as disposition
        await logCall({
          clientId: currentClient.id,
          disposition: 'CALLBACK',
          notes: callNotes || undefined,
          callbackDate: new Date(`${schedDate}T${schedTime}:00`).toISOString(),
          callbackNotes: schedNotes || undefined,
        })
      }
      return autoNext
    },
    onSuccess: (autoNext) => {
      toast.success('Guardado correctamente')
      qc.invalidateQueries({ queryKey: ['client-detail', currentClient?.id] })
      qc.invalidateQueries({ queryKey: ['callbacks'] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      if (autoNext && currentIndex < clients.length - 1) goTo(currentIndex + 1)
    },
    onError: (err: Error) => toast.error(err?.message ?? 'Error al guardar'),
  })

  // ─── Render ───────────────────────────────────────────────────────────────

  const gridClients = gridData?.clients ?? []
  const gridTotal = gridData?.total ?? 0
  const aclaracionList = disposition ? ACLARACION_OPTIONS[disposition] ?? [] : []

  // Split callbacks: own = current user; team = all (admin only)
  const ownCallbacks = callbackList.filter((c) => c.agent.id === user?.id)
  const activeList = cbTab === 'own' || !isAdmin ? ownCallbacks : callbackList

  const todayCount = activeList.filter((c) => isToday(new Date(c.scheduledAt))).length
  const overdueCount = activeList.filter(
    (c) => isPast(new Date(c.scheduledAt)) && !isToday(new Date(c.scheduledAt))
  ).length

  // Detail view loading / empty guards are now rendered INSIDE the layout
  // (so the top bar with batch selector remains visible at all times)

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ══════════════════════ SHARED TOP BAR ══════════════════════ */}
      <div className="bg-blue-800 text-white px-6 py-3 flex items-center justify-between shrink-0 gap-4">
        <div className="flex items-center gap-4 min-w-0 text-sm">
          <span className="font-semibold truncate shrink-0">Campaña: Migración de Operador</span>

          {/* Batch selector */}
          {batches.length > 0 && (
            <select
              value={selectedBatchId}
              onChange={(e) => switchBatch(e.target.value)}
              className="bg-blue-700 border border-blue-500 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-300 max-w-[220px] truncate"
            >
              <option value="">Todos los lotes ({allClients.length})</option>
              {batches.map((b, i) => (
                <option key={b.id} value={b.id}>
                  {i === 0 ? '★ ' : ''}{b.filename.replace(/\.[^.]+$/, '')} ({allClients.filter(c => c.importBatch?.id === b.id).length})
                </option>
              ))}
            </select>
          )}

          {viewMode === 'detail' && detail && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-blue-300 text-xs">Contacto {currentIndex + 1} / {total}:</span>
              <StatusBadge status={detail.status} />
            </div>
          )}
          {viewMode === 'detail' && clients.length > 0 && (() => {
            const savedId = localStorage.getItem(lastClientKey)
            const savedIdx = savedId ? clients.findIndex((c) => c.id === savedId) : -1
            if (savedIdx > 0 && savedIdx !== currentIndex) {
              return (
                <button
                  onClick={() => setCurrentIndex(savedIdx)}
                  title={`Ir al último registro visitado (${savedIdx + 1} de ${total})`}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-white text-xs font-medium rounded transition-colors shrink-0"
                >
                  ↩ Retomar #{savedIdx + 1}
                </button>
              )
            }
            return null
          })()}
          {viewMode === 'grid' && (
            <span className="text-blue-300 text-xs shrink-0">{gridData?.total ?? 0} clientes</span>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
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
              <button
                onClick={() => goTo(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed rounded text-xs font-medium transition-colors"
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <button
                onClick={() => goTo(currentIndex + 1)}
                disabled={currentIndex >= clients.length - 1}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed rounded text-xs font-medium transition-colors"
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ══════════════════════ DETAIL VIEW ══════════════════════════ */}
      {viewMode === 'detail' && (
        <div className="flex flex-1 overflow-hidden">
          {/* ── Left: Form (scrollable) ── */}
          <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
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

                {/* ── Datos del cliente ── */}
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Datos del cliente</p>
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    <ReadField label="Nombre" value={detail.name} />
                    <ReadField label="Teléfono 1" value={detail.phone} />
                    <ReadField label="Teléfono 2" value={detail.phone2} />
                    <EditField label="Operador actual" value={editCurrentOp} onChange={setEditCurrentOp} placeholder="Movistar, Claro, AT&T..." />
                    <div className="col-span-2">
                      <EditField label="Email" value={editEmail} onChange={setEditEmail} placeholder="correo@ejemplo.com" />
                    </div>
                    <div className="col-span-2">
                      <EditField label="Dirección" value={editAddress} onChange={setEditAddress} placeholder="Calle, número, colonia..." />
                    </div>
                    <div className="col-span-2">
                      <EditField label="Plan / Tarifa" value={editPlan} onChange={setEditPlan} placeholder="Plan actual del cliente" />
                    </div>
                  </div>
                </div>

                {/* ── Resultado + Agendar apilados ── */}
                <div className="flex flex-col gap-3 flex-1">

                  {/* Resultado de esta llamada */}
                  <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Resultado de esta llamada</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-gray-500 font-medium">Respuesta</label>
                        <select
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                          value={disposition}
                          onChange={(e) => { setDisposition(e.target.value); setAclaracion('') }}
                        >
                          {RESPUESTA_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-gray-500 font-medium">Aclaración</label>
                        <select
                          className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                          value={aclaracion}
                          onChange={(e) => setAclaracion(e.target.value)}
                          disabled={!disposition || aclaracionList.length === 0}
                        >
                          <option value="">— Seleccionar —</option>
                          {aclaracionList.map((a) => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label className="text-xs text-gray-500 font-medium">Notas de la llamada</label>
                      <textarea
                        rows={3}
                        className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                        placeholder="Comentarios adicionales de esta llamada..."
                        value={callNotes}
                        onChange={(e) => setCallNotes(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Agendar */}
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-100 border-b border-gray-200 px-4 py-2 flex items-center gap-2">
                      <CalendarClock size={14} className="text-gray-500" />
                      <span className="text-sm font-semibold text-gray-600">Agendar</span>
                      {disposition === 'CALLBACK'
                        ? <span className="badge bg-blue-100 text-blue-700 ml-1">Requerido</span>
                        : <span className="text-xs text-gray-400">(opcional)</span>}
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="grid grid-cols-3 gap-3 items-end">
                        <div className="flex flex-col gap-0.5">
                          <label className="text-xs text-gray-500 font-medium">Fecha</label>
                          <input type="date" className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none w-full"
                            value={schedDate} min={new Date().toISOString().split('T')[0]} onChange={(e) => setSchedDate(e.target.value)} />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <label className="text-xs text-gray-500 font-medium">Hora</label>
                          <input type="time" className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none w-full"
                            value={schedTime} onChange={(e) => setSchedTime(e.target.value)} />
                        </div>
                        <button type="button" onClick={() => { const d = new Date(); d.setDate(d.getDate() + 1); setSchedDate(d.toISOString().split('T')[0]); setSchedTime('09:00') }}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50 transition-colors h-[34px]">
                          <Clock size={13} /> Primer libre
                        </button>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <label className="text-xs text-gray-500 font-medium">Observaciones del agendado</label>
                        <textarea rows={3} className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                          placeholder="Ej: Llamar por la tarde, preguntar por el gerente..."
                          value={schedNotes} onChange={(e) => setSchedNotes(e.target.value)} />
                      </div>
                    </div>
                  </div>

                </div>

                <div className="flex items-center gap-3 pb-6 flex-wrap">
                  <button onClick={() => saveMutation.mutate(false)} disabled={saveMutation.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                    <Save size={15} />
                    {saveMutation.isPending ? 'Guardando...' : 'Guardar resultado'}
                  </button>
                  <button onClick={() => saveMutation.mutate(true)} disabled={saveMutation.isPending || currentIndex >= clients.length - 1}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                    Guardar y siguiente <ChevronRight size={15} />
                  </button>
                  <div className="flex gap-2 ml-auto">
                    <button onClick={() => goTo(currentIndex - 1)} disabled={currentIndex === 0}
                      className="flex items-center gap-1 px-4 py-2.5 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium disabled:opacity-40">
                      <ChevronLeft size={15} /> Anterior
                    </button>
                    <button onClick={() => goTo(currentIndex + 1)} disabled={currentIndex >= clients.length - 1}
                      className="flex items-center gap-1 px-4 py-2.5 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium disabled:opacity-40">
                      Siguiente <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Center: Stats + History (full-height panel) ── */}
          {detail && (
            <div className="w-80 shrink-0 border-l border-gray-200 flex flex-col bg-white overflow-hidden">
              {/* Stats card */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 shrink-0">
                <p className="text-white font-semibold text-sm truncate">{detail.name}</p>
                <p className="text-blue-200 text-xs font-mono mt-0.5">{detail.phone}</p>
              </div>
              <div className="shrink-0 divide-y divide-gray-100 border-b border-gray-200">
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="text-xs text-gray-500">Llamadas totales</span>
                  <span className="text-sm font-bold text-gray-900">{detail.callLogs.length}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="text-xs text-gray-500">Última llamada</span>
                  <span className="text-xs font-medium text-gray-700">
                    {detail.callLogs.length > 0
                      ? format(new Date([...detail.callLogs].sort((a, b) => new Date(b.calledAt).getTime() - new Date(a.calledAt).getTime())[0].calledAt), 'dd/MM/yyyy', { locale: es })
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="text-xs text-gray-500">Próximo callback</span>
                  <span className="text-xs font-medium text-gray-700">
                    {detail.callbacks?.filter((c) => !c.completed).length > 0
                      ? format(new Date(detail.callbacks.filter((c) => !c.completed).sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0].scheduledAt), 'dd/MM HH:mm', { locale: es })
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-2">
                  <span className="text-xs text-gray-500">Estado</span>
                  <StatusBadge status={detail.status} />
                </div>
                {detail.currentOp && (
                  <div className="flex items-center justify-between px-4 py-2">
                    <span className="text-xs text-gray-500">Operador</span>
                    <span className="text-xs font-semibold text-orange-600">{detail.currentOp}</span>
                  </div>
                )}
                {detail.plan && (
                  <div className="flex items-center justify-between px-4 py-2">
                    <span className="text-xs text-gray-500">Plan actual</span>
                    <span className="text-xs text-gray-700 truncate max-w-[160px]">{detail.plan}</span>
                  </div>
                )}
              </div>

              {/* History — fills remaining height */}
              <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-200 shrink-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Historial de llamadas</p>
                <span className="text-xs text-gray-400">{detail.callLogs.length} registros</span>
              </div>
              {detail.callLogs.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <AlertCircle size={24} className="mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Sin llamadas registradas</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
                  {[...detail.callLogs]
                    .sort((a, b) => new Date(b.calledAt).getTime() - new Date(a.calledAt).getTime())
                    .map((log) => {
                      const cfg = DISPOSITION_CONFIG[log.disposition] ?? { label: log.disposition, classes: 'bg-gray-100 text-gray-600' }
                      const borderColor: Record<string, string> = {
                        INTERESTED: 'border-l-green-400',
                        NOT_INTERESTED: 'border-l-red-400',
                        NO_ANSWER: 'border-l-gray-300',
                        BUSY: 'border-l-yellow-400',
                        CALLBACK: 'border-l-blue-400',
                        DO_NOT_CALL: 'border-l-red-700',
                        OTHER: 'border-l-purple-400',
                      }
                      const linkedCb = detail.callbacks?.find((c) => c.callLogId === log.id)
                      return (
                        <div
                          key={log.id}
                          className={`bg-white rounded-lg border border-gray-200 border-l-4 ${borderColor[log.disposition] ?? 'border-l-gray-300'} p-3 shadow-sm`}
                        >
                          {/* Row 1: badge + date */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className={`badge text-[10px] ${cfg.classes}`}>{cfg.label}</span>
                            <span className="text-[10px] text-gray-400 font-mono shrink-0">
                              {format(new Date(log.calledAt), 'dd/MM/yy HH:mm')}
                            </span>
                          </div>
                          {/* Row 2: aclaración */}
                          {log.aclaracion && (
                            <p className="text-[11px] text-gray-500 italic mb-1.5">{log.aclaracion}</p>
                          )}
                          {/* Row 3: notes */}
                          {log.notes && (
                            <p className="text-xs text-gray-700 leading-snug mb-1.5 bg-gray-50 rounded px-2 py-1">{log.notes}</p>
                          )}
                          {/* Row 4: scheduled callback */}
                          {linkedCb && (
                            <div className="mt-1.5 pt-1.5 border-t border-dashed border-blue-200 space-y-0.5">
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
                          {/* Footer: agent */}
                          <p className="text-[10px] text-gray-400 mt-2 pt-1.5 border-t border-gray-100">
                            — {log.agent.name}
                          </p>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          )}

          {/* Agendados sidebar */}
          <div className="w-56 shrink-0 border-l border-gray-200 flex flex-col bg-white overflow-hidden">
            <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <CalendarClock size={15} />
                <span className="font-semibold text-sm">Agendados</span>
              </div>
              <div className="flex gap-1">
                {overdueCount > 0 && <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{overdueCount}</span>}
                {todayCount > 0 && <span className="bg-amber-400 text-amber-900 text-xs font-bold px-1.5 py-0.5 rounded-full">{todayCount}</span>}
              </div>
            </div>

            {/* Tabs — only rendered for admins */}
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

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {activeList.length === 0 ? (
                <div className="text-center text-gray-400 py-8 text-xs px-2">
                  <CalendarClock size={24} className="mx-auto mb-2 opacity-40" />
                  {cbTab === 'own' || !isAdmin ? 'Sin callbacks propios pendientes' : 'Sin callbacks pendientes en el equipo'}
                </div>
              ) : (
                activeList.map((cb) => {
                  const isCurrent = cb.client.id === currentClient?.id
                  return (
                    <button key={cb.id} onClick={() => goToClientById(cb.client.id)}
                      className={`w-full text-left px-2.5 py-2 rounded border text-xs transition-all ${callbackColor(cb.scheduledAt)} ${isCurrent ? 'ring-2 ring-blue-400' : ''}`}>
                      <p className="font-semibold truncate leading-tight">{cb.client.name}</p>
                      <p className="opacity-70 truncate text-[10px]">{cb.client.phone}</p>
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
            <div className="border-t border-gray-100 px-3 py-2 space-y-0.5 shrink-0 bg-gray-50">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Leyenda</p>
              <div className="flex items-center gap-1 text-[10px] text-red-600"><AlertCircle size={9} /> Vencido</div>
              <div className="flex items-center gap-1 text-[10px] text-amber-600"><Clock size={9} /> Hoy</div>
              <div className="flex items-center gap-1 text-[10px] text-blue-600"><CalendarClock size={9} /> Próximo</div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ GRID / KANBAN VIEW ═══════════════════ */}
      {viewMode === 'grid' && (
        <div className="flex-1 overflow-y-auto bg-gray-50 p-6 space-y-5">
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
                id: string; name: string; phone: string; phone2?: string
                currentOp?: string; plan?: string; notes?: string; status: string
                _count: { callLogs: number; callbacks: number }
              }) => (
                <div key={c.id} className="card p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate text-sm">{c.name}</p>
                      <div className="flex items-center gap-1 text-xs text-gray-600 mt-0.5">
                        <Phone size={11} className="text-gray-400 shrink-0" />
                        <span className="font-medium font-mono">{c.phone}</span>
                      </div>
                      {c.phone2 && <p className="text-xs text-gray-400 font-mono pl-3">{c.phone2}</p>}
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                  <div className="text-xs text-gray-400 space-y-0.5 flex-1">
                    {c.currentOp && <p>Op: <span className="text-orange-600 font-medium">{c.currentOp}</span></p>}
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
          const matchSearch = !q || c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)
          return matchStatus && matchSearch
        })
        return (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
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
            <div className="card overflow-hidden">
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
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Teléfono</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Operador</th>
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
                        .filter((cb) => cb.client.id === c.id)
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
                          <td className="px-4 py-2.5 font-medium text-gray-900">{c.name}</td>
                          <td className="px-4 py-2.5 text-gray-600 font-mono text-xs">{c.phone}</td>
                          <td className="px-4 py-2.5 text-gray-500 text-xs">
                            {(c as ClientSummary & { currentOp?: string }).currentOp ?? '—'}
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

