import { useState, useRef, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getImports, getImport, uploadImport, deleteImport, patchImport, downloadImportExport, downloadImportOriginal, getUsers, previewDepuradoExport, downloadDepuradoExport } from '../api/client'
import type { DuplicateFileWarning, ImportBatch, AppUser, DepuradoExportPreview } from '../api/client'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import {
  Upload, FileSpreadsheet, ChevronRight, ChevronDown, Clock, X,
  Phone, Mail, UserCheck, UserX, Search, Trash2, AlertTriangle, Building2, List, Ban, ShieldCheck, Download,
  Filter, CheckCircle2,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { StatusBadge } from '../components/StatusBadge'
import {
  compareQuincenaKeysDesc,
  formatQuincenaLabel,
  getQuincenaKey,
  type QuincenaKey,
} from '../lib/quincena'
import {
  CONTACTOS_IMPORT_COLUMNS,
  CONTACTOS_SHEET_NAME,
  DETALLE_PLAN_IMPORT_COLUMNS,
  DETALLE_PLAN_SHEET_NAME,
  PRODUCTOS_MOVIL_IMPORT_COLUMNS,
  PRODUCTOS_MOVIL_SHEET_NAME,
  type ImportSheetName,
} from '../lib/importWorkbookColumns'

const IMPORT_SHEET_TABS: {
  name: ImportSheetName
  columns: readonly string[]
  required: boolean
}[] = [
  { name: CONTACTOS_SHEET_NAME, columns: CONTACTOS_IMPORT_COLUMNS, required: true },
  { name: PRODUCTOS_MOVIL_SHEET_NAME, columns: PRODUCTOS_MOVIL_IMPORT_COLUMNS, required: false },
  { name: DETALLE_PLAN_SHEET_NAME, columns: DETALLE_PLAN_IMPORT_COLUMNS, required: false },
]

function batchLabel(batch: { displayName?: string | null; filename: string }) {
  return batch.displayName?.trim() || batch.filename
}

function formatFileSize(bytes: number | null | undefined) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function registroLabel(count: number) {
  return `${count} registro${count !== 1 ? 's' : ''}`
}

function batchMetricsText(batch: {
  sourceRowCount?: number | null
  companyCount: number
}) {
  const parts: string[] = []
  if (batch.sourceRowCount != null) {
    parts.push(registroLabel(batch.sourceRowCount))
  }
  parts.push(`${batch.companyCount} empresa${batch.companyCount !== 1 ? 's' : ''}`)
  return parts.join(' · ')
}

function assignmentUsage(batch: Pick<ImportBatch, 'companyCount' | 'unassignedCompanyCount' | 'blocked'>) {
  const companyCount = batch.companyCount ?? 0
  const unassigned = batch.unassignedCompanyCount ?? 0
  const assigned = Math.max(0, companyCount - unassigned)
  const pct = companyCount > 0 ? Math.round((100 * assigned) / companyCount) : 0
  return { assigned, companyCount, pct, blocked: !!batch.blocked }
}

function usageTone(pct: number, blocked: boolean) {
  if (blocked) {
    return {
      bar: 'bg-gray-300',
      track: 'bg-gray-100',
      text: 'text-gray-400',
    }
  }
  if (pct < 10) {
    return {
      bar: 'bg-gray-400',
      track: 'bg-gray-100',
      text: 'text-gray-500',
    }
  }
  if (pct >= 80) {
    return {
      bar: 'bg-emerald-500',
      track: 'bg-emerald-50',
      text: 'text-emerald-700',
    }
  }
  if (pct >= 40) {
    return {
      bar: 'bg-blue-500',
      track: 'bg-blue-50',
      text: 'text-blue-700',
    }
  }
  return {
    bar: 'bg-amber-500',
    track: 'bg-amber-50',
    text: 'text-amber-700',
  }
}

type QuincenaGroup = {
  key: QuincenaKey
  label: string
  batches: ImportBatch[]
  totalRucs: number
}

function groupBatchesByQuincena(batches: ImportBatch[]): QuincenaGroup[] {
  const map = new Map<QuincenaKey, ImportBatch[]>()
  for (const batch of batches) {
    const key = getQuincenaKey(new Date(batch.createdAt))
    const list = map.get(key)
    if (list) list.push(batch)
    else map.set(key, [batch])
  }
  return [...map.entries()]
    .sort(([a], [b]) => compareQuincenaKeysDesc(a, b))
    .map(([key, groupBatches]) => {
      const sorted = [...groupBatches].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      return {
        key,
        label: formatQuincenaLabel(key),
        batches: sorted,
        totalRucs: sorted.reduce((sum, b) => sum + (b.companyCount ?? 0), 0),
      }
    })
}

function duplicateWarningStyle(severity: DuplicateFileWarning['severity']) {
  if (severity === 'filename_and_size') {
    return { iconBg: 'bg-red-100', iconColor: 'text-red-600' }
  }
  if (severity === 'size_only') {
    return { iconBg: 'bg-orange-100', iconColor: 'text-orange-600' }
  }
  return { iconBg: 'bg-amber-100', iconColor: 'text-amber-600' }
}

function ImportSheetHeadersHelp() {
  const [activeSheet, setActiveSheet] = useState<ImportSheetName>(CONTACTOS_SHEET_NAME)
  const active = IMPORT_SHEET_TABS.find((sheet) => sheet.name === activeSheet) ?? IMPORT_SHEET_TABS[0]

  return (
    <div className="card p-5">
      <p className="text-sm text-gray-600 mb-3">
        El Excel necesita las hojas <strong>Contactos</strong> (obligatoria),{' '}
        <strong>ProductosMovil</strong> y <strong>DetallePlan</strong> (opcionales). CSV: los
        mismos encabezados en la fila 1, sin hojas.
      </p>

      <div className="rounded-md border border-gray-300 overflow-hidden bg-[#f3f3f3]">
        <div
          className="flex items-end gap-px bg-[#d9d9d9] px-1 pt-1 border-b border-gray-300"
          role="tablist"
          aria-label="Hojas del Excel"
        >
          {IMPORT_SHEET_TABS.map((sheet) => {
            const selected = sheet.name === active.name
            return (
              <button
                key={sheet.name}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveSheet(sheet.name)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-md border border-b-0 transition-colors ${
                  selected
                    ? 'bg-white border-gray-300 text-gray-900 -mb-px z-10 shadow-[0_-1px_0_#fff]'
                    : 'bg-[#efefef] border-transparent text-gray-600 hover:bg-[#f7f7f7]'
                }`}
              >
                {selected && (
                  <span className="absolute inset-x-0 top-0 h-0.5 rounded-t-md bg-green-600" />
                )}
                <span className="font-mono">{sheet.name}</span>
                <span
                  className={`text-[10px] font-sans font-medium leading-none px-1 py-0.5 rounded ${
                    sheet.required
                      ? 'bg-green-50 text-green-800'
                      : 'bg-gray-200/80 text-gray-500'
                  }`}
                >
                  {sheet.required ? 'obligatoria' : 'opcional'}
                </span>
              </button>
            )
          })}
        </div>

        <div className="overflow-x-auto bg-white">
          <div className="flex min-w-max border-b border-gray-300" role="row">
            {active.columns.map((column) => (
              <div
                key={column}
                role="columnheader"
                className="shrink-0 px-2.5 py-1.5 text-xs font-mono text-gray-700 bg-[#f2f2f2] border-r border-gray-300 whitespace-nowrap last:border-r-0"
              >
                {column}
              </div>
            ))}
          </div>
        </div>
      </div>

      <details className="mt-3">
        <summary className="text-xs text-gray-500 cursor-pointer select-none hover:text-gray-700">
          También aceptamos estos nombres
        </summary>
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
          El importador también reconoce sinónimos habituales (tel, celular, name…).
        </p>
      </details>
    </div>
  )
}

function DepuradoExportPanel() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<DepuradoExportPreview | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: getUsers })
  const agents = (users as AppUser[]).filter((u) => u.role === 'AGENT' && u.active)

  const toggleAgent = (id: string) => {
    setPreview(null)
    setConfirmOpen(false)
    setSelectedAgentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedIds = [...selectedAgentIds]

  const handlePreview = async () => {
    if (selectedIds.length === 0) {
      toast.error('Selecciona al menos un agente')
      return
    }
    setLoadingPreview(true)
    try {
      const data = await previewDepuradoExport(selectedIds)
      setPreview(data)
      if (data.agents.length === 0) {
        toast('Ningún agente seleccionado tiene empresas No contesta — depurado', { icon: 'ℹ️' })
        return
      }
      setConfirmOpen(true)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Error al preparar la vista previa')
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleConfirmExport = async () => {
    if (!preview || preview.agents.length === 0) return
    setExporting(true)
    try {
      const { saved, filename } = await downloadDepuradoExport(preview.agents.map((a) => a.agentId))
      if (saved) {
        toast.success(`Exportado: ${filename}`)
        if (preview.skippedAgents.length > 0) {
          toast(
            `Sin archivo para: ${preview.skippedAgents.map((a) => a.agentName).join(', ')} (0 depurados)`,
            { icon: 'ℹ️', duration: 5000 }
          )
        }
      }
      setConfirmOpen(false)
      setPreview(null)
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['imports'] })
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['assignmentRuns'] })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Error al exportar')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <div className="card overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/80 transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <Filter size={15} className="text-slate-500" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-medium text-gray-800 text-sm">Exportar No contesta — depurado</h2>
            <p className="text-xs text-gray-500 truncate">
              Recupera empresas de la cola depurada para reimportarlas como lote nuevo
            </p>
          </div>
          {open ? (
            <ChevronDown size={16} className="text-gray-400 shrink-0" />
          ) : (
            <ChevronRight size={16} className="text-gray-400 shrink-0" />
          )}
        </button>

        {open && (
          <div className="px-4 pb-4 pt-1 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-3">
              Un Excel por agente (formato de importación). Si eliges varios, se descarga un ZIP.
            </p>
            {agents.length === 0 ? (
              <p className="text-sm text-gray-400">No hay agentes activos.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
                {agents.map((agent) => {
                  const checked = selectedAgentIds.has(agent.id)
                  return (
                    <label
                      key={agent.id}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                        checked
                          ? 'border-blue-300 bg-blue-50 text-blue-900'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAgent(agent.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="truncate font-medium">{agent.name}</span>
                    </label>
                  )
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 mt-4">
              <button
                type="button"
                onClick={handlePreview}
                disabled={loadingPreview || selectedIds.length === 0}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingPreview ? 'Calculando...' : 'Vista previa'}
              </button>
              <p className="text-xs text-gray-400">
                {selectedIds.length === 0
                  ? 'Selecciona agentes para continuar'
                  : `${selectedIds.length} agente${selectedIds.length !== 1 ? 's' : ''} seleccionado${selectedIds.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
        )}
      </div>

      {confirmOpen && preview && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                <Download size={20} className="text-slate-700" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Confirmar exportación</h3>
                <p className="text-sm text-gray-500">
                  {preview.totalCompanies} empresa{preview.totalCompanies !== 1 ? 's' : ''} ·{' '}
                  {preview.totalContacts} contacto{preview.totalContacts !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              {preview.agents.map((agent) => (
                <div key={agent.agentId} className="bg-gray-50 rounded-lg px-3 py-2 text-sm">
                  <p className="font-medium text-gray-900">{agent.agentName}</p>
                  <p className="text-gray-600 text-xs mt-0.5">
                    {agent.companyCount} empresa{agent.companyCount !== 1 ? 's' : ''} ·{' '}
                    {agent.contactCount} contacto{agent.contactCount !== 1 ? 's' : ''}
                    {' · '}archivo {agent.firstName}.xlsx
                  </p>
                  {agent.sample.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      Muestra: {agent.sample.map((s) => s.ruc).join(', ')}
                      {agent.companyCount > agent.sample.length ? '…' : ''}
                    </p>
                  )}
                  {agent.sharedWithOtherAgentCount > 0 && (
                    <p className="text-xs text-amber-700 mt-1">
                      {agent.sharedWithOtherAgentCount} de estas también las tiene otro agente hoy
                    </p>
                  )}
                </div>
              ))}
              {preview.skippedAgents.length > 0 && (
                <p className="text-xs text-gray-500">
                  Sin archivo (0 depurados): {preview.skippedAgents.map((a) => a.agentName).join(', ')}
                </p>
              )}
            </div>

            <p className="text-sm text-gray-700 mb-2">
              Al confirmar, estas empresas saldrán de la cola <strong>No contesta — depurado</strong> de
              ese agente y no se volverán a exportar.
            </p>
            <p className="text-xs text-gray-500 mb-6">
              No quedarán disponibles para asignar en el lote original. Las llamadas y métricas del
              agente se conservan. El Excel no incluye columnas de campaña: al reimportarlo serán
              empresas pendientes nuevas.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={exporting}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmExport}
                disabled={exporting}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {exporting ? 'Exportando...' : 'Exportar y retirar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function duplicateWarningCopy(severity: DuplicateFileWarning['severity']) {
  switch (severity) {
    case 'filename_and_size':
      return {
        title: 'Archivo posiblemente duplicado',
        subtitle: 'Mismo nombre y mismo tamaño que una importación anterior',
        body: 'El archivo que intentas subir parece ser el mismo que ya importaste (mismo nombre y tamaño en bytes). Puedes continuar y crear un nuevo lote si lo deseas.',
      }
    case 'size_only':
      return {
        title: 'Archivo con mismo tamaño',
        subtitle: 'Mismo peso en bytes que una importación anterior con otro nombre',
        body: 'El archivo que intentas subir tiene el mismo tamaño que una importación previa con un nombre distinto (por ejemplo, una copia renombrada como "lista (1).xlsx"). Puede ser el mismo archivo. Puedes continuar y crear un nuevo lote si lo deseas.',
      }
    default:
      return {
        title: 'Nombre de archivo repetido',
        subtitle: 'Ya existe una importación con este nombre de archivo',
        body: 'Ya importaste un archivo con el mismo nombre. Si el contenido es distinto, puedes continuar como un nuevo lote.',
      }
  }
}

export default function Imports() {
  const [dragging, setDragging] = useState(false)
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [drawerSearch, setDrawerSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null)
  const [confirmBlock, setConfirmBlock] = useState<{
    id: string
    label: string
    blocked: boolean
  } | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<{
    file: File
    severity: DuplicateFileWarning['severity']
    existingBatch: DuplicateFileWarning['existingBatch']
  } | null>(null)
  const [duplicateDisplayName, setDuplicateDisplayName] = useState('')
  const [exportingBatchId, setExportingBatchId] = useState<string | null>(null)
  const [downloadingOriginalId, setDownloadingOriginalId] = useState<string | null>(null)
  const [collapsedQuincenas, setCollapsedQuincenas] = useState<Set<QuincenaKey>>(() => new Set())
  const [quincenaCollapseSeeded, setQuincenaCollapseSeeded] = useState(false)
  const [importSuccess, setImportSuccess] = useState<{
    imported: number
    label: string
  } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const { user } = useAuth()
  const canDownloadOriginal = user?.isSuperAdmin || user?.isSystemOwner

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['imports'],
    queryFn: getImports,
  })

  const quincenaGroups = useMemo(() => groupBatchesByQuincena(batches), [batches])

  useEffect(() => {
    if (quincenaCollapseSeeded || quincenaGroups.length === 0) return
    const openCount = 1
    const collapsed = new Set(quincenaGroups.slice(openCount).map((g) => g.key))
    setCollapsedQuincenas(collapsed)
    setQuincenaCollapseSeeded(true)
  }, [quincenaGroups, quincenaCollapseSeeded])

  const toggleQuincena = (key: QuincenaKey) => {
    setCollapsedQuincenas((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const { data: batchDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['import', selectedBatchId],
    queryFn: () => getImport(selectedBatchId!),
    enabled: !!selectedBatchId,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteImport(id),
    onSuccess: () => {
      toast.success('Importación eliminada correctamente')
      setConfirmDelete(null)
      qc.invalidateQueries({ queryKey: ['imports'] })
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(
        err?.response?.data?.error ?? 'Error al eliminar la importación',
        { duration: 5000 }
      )
      toast('Puedes bloquear el lote para que no se use en nuevas asignaciones.', { icon: 'ℹ️' })
      setConfirmDelete(null)
    },
  })

  const blockMutation = useMutation({
    mutationFn: ({ id, blocked }: { id: string; blocked: boolean }) =>
      patchImport(id, { blocked }),
    onSuccess: (_data, { blocked }) => {
      toast.success(blocked ? 'Lote bloqueado' : 'Lote desbloqueado')
      setConfirmBlock(null)
      qc.invalidateQueries({ queryKey: ['imports'] })
      qc.invalidateQueries({ queryKey: ['import'] })
      qc.invalidateQueries({ queryKey: ['clients', 'unassigned'] })
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Error al actualizar el lote')
      setConfirmBlock(null)
    },
  })

  const mutation = useMutation({
    mutationFn: ({
      file,
      confirmDuplicate,
      displayName,
    }: {
      file: File
      confirmDuplicate?: boolean
      displayName?: string
    }) => uploadImport(file, { confirmDuplicate, displayName }),
    onSuccess: (data) => {
      setDuplicateWarning(null)
      setDuplicateDisplayName('')
      const label = data.displayName?.trim() || data.filename
      setImportSuccess({ imported: data.imported, label })
      toast.success(`Importados ${data.imported} empresas de «${label}»`)
      if (data.withoutPhone && data.withoutPhone > 0) {
        toast(`⚠️ ${data.withoutPhone} registro(s) sin teléfono`, { icon: '⚠️' })
      }
      if (data.withoutContacts && data.withoutContacts > 0) {
        toast(`⚠️ ${data.withoutContacts} registro(s) sin contactos`, { icon: '⚠️' })
      }
      qc.invalidateQueries({ queryKey: ['imports'] })
    },
    onError: (
      err: {
        response?: {
          status?: number
          data?: Partial<DuplicateFileWarning> & { error?: string }
        }
      },
      variables
    ) => {
      const data = err?.response?.data
      if (
        err?.response?.status === 409 &&
        data?.error === 'duplicate_file_warning' &&
        data.severity &&
        data.existingBatch
      ) {
        setDuplicateWarning({
          file: variables.file,
          severity: data.severity,
          existingBatch: data.existingBatch,
        })
        return
      }
      toast.error(data?.error ?? 'Error al importar el archivo')
    },
  })

  const handleFile = (file: File) => {
    if (!file.name.match(/\.(xlsx?|csv)$/i)) {
      toast.error('Solo se permiten archivos Excel (.xlsx, .xls) o CSV (.csv)')
      return
    }
    setDuplicateDisplayName('')
    setImportSuccess(null)
    mutation.mutate({ file })
  }

  const handleConfirmDuplicate = () => {
    if (!duplicateWarning) return
    mutation.mutate({
      file: duplicateWarning.file,
      confirmDuplicate: true,
      displayName: duplicateDisplayName || undefined,
    })
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleExportBatch = async (batchId: string) => {
    setExportingBatchId(batchId)
    try {
      const saved = await downloadImportExport(batchId)
      if (saved) toast.success('Archivo guardado')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Error al exportar')
    } finally {
      setExportingBatchId(null)
    }
  }

  const handleDownloadOriginal = async (batchId: string) => {
    setDownloadingOriginalId(batchId)
    try {
      const saved = await downloadImportOriginal(batchId)
      if (saved) toast.success('Archivo original guardado')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'Error al descargar el archivo original')
    } finally {
      setDownloadingOriginalId(null)
    }
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Importar base de datos</h1>
        <p className="text-gray-500 text-sm mt-1">
          Sube archivos Excel o CSV con los clientes potenciales para migración
        </p>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
        }`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />
        <Upload
          size={40}
          className={`mx-auto mb-3 ${dragging ? 'text-blue-500' : 'text-gray-400'}`}
        />
        {mutation.isPending ? (
          <>
            <p className="font-medium text-blue-600">Procesando archivo...</p>
            <p className="text-sm text-gray-400 mt-1">Esto puede tomar unos segundos</p>
          </>
        ) : (
          <>
            <p className="font-medium text-gray-700">
              Arrastra tu archivo aquí, o <span className="text-blue-600">haz clic para seleccionar</span>
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Excel (.xlsx, .xls) con hoja &quot;Contactos&quot; (opcional: &quot;ProductosMovil&quot;, &quot;DetallePlan&quot;) · CSV (.csv) · Máximo 20 MB
            </p>
          </>
        )}
      </div>

      {importSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 sm:px-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
            <CheckCircle2 size={20} className="text-emerald-700" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-emerald-950">Importación completada</p>
            <p className="text-sm text-emerald-800 mt-0.5">
              {importSuccess.imported} empresa{importSuccess.imported !== 1 ? 's' : ''} en «{importSuccess.label}».
              El siguiente paso es asignarlas a los agentes.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/assignments"
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              Asignar a agentes
            </Link>
            <button
              type="button"
              onClick={() => setImportSuccess(null)}
              className="px-3 py-2 rounded-lg text-sm font-medium text-emerald-800 hover:bg-emerald-100 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <ImportSheetHeadersHelp />

      <DepuradoExportPanel />

      {/* History */}
      <div>
        <h2 className="font-semibold text-gray-900 mb-4">Historial de importaciones</h2>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : batches.length === 0 ? (
          <div className="card p-10 text-center text-gray-400">
            <FileSpreadsheet size={40} className="mx-auto mb-2" />
            <p>No hay importaciones todavía</p>
          </div>
        ) : (
          <div className="space-y-6">
            {quincenaGroups.map((group) => {
              const collapsed = collapsedQuincenas.has(group.key)
              const loteLabel = `${group.batches.length} lote${group.batches.length !== 1 ? 's' : ''}`
              const rucLabel = `${group.totalRucs} empresa${group.totalRucs !== 1 ? 's' : ''}`
              return (
                <section key={group.key} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => toggleQuincena(group.key)}
                    className="sticky top-0 z-10 w-full flex items-center gap-2 px-1 py-2 bg-gray-50/95 backdrop-blur-sm border-b border-gray-200 text-left hover:bg-gray-100/80 transition-colors rounded-t-lg"
                  >
                    {collapsed ? (
                      <ChevronRight size={16} className="text-gray-400 shrink-0" />
                    ) : (
                      <ChevronDown size={16} className="text-gray-400 shrink-0" />
                    )}
                    <span className="font-semibold text-gray-800 text-sm">{group.label}</span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-500">{loteLabel}</span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-500">{rucLabel}</span>
                  </button>

                  {!collapsed && (
                    <div className="space-y-2">
                      {group.batches.map((batch) => {
                        const usage = assignmentUsage(batch)
                        const tone = usageTone(usage.pct, usage.blocked)
                        return (
                          <div
                            key={batch.id}
                            className={`card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between hover:shadow-md hover:border-blue-200 transition-all ${
                              batch.blocked ? 'opacity-80' : ''
                            }`}
                          >
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                                batch.blocked ? 'bg-gray-100' : 'bg-green-100'
                              }`}>
                                <FileSpreadsheet
                                  size={20}
                                  className={batch.blocked ? 'text-gray-400' : 'text-green-600'}
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-medium text-gray-900 truncate">{batchLabel(batch)}</p>
                                  {batch.blocked && (
                                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                      Bloqueado
                                    </span>
                                  )}
                                </div>
                                {batch.displayName?.trim() && batch.displayName.trim() !== batch.filename && (
                                  <p className="text-xs text-gray-400 truncate max-w-md">{batch.filename}</p>
                                )}
                                <div className="flex items-center gap-3 text-xs text-gray-400 mt-1 flex-wrap">
                                  {batch.sourceRowCount != null && (
                                    <span className="flex items-center gap-1">
                                      <List size={12} />
                                      {registroLabel(batch.sourceRowCount)}
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Building2 size={12} />
                                    {batch.companyCount} empresa{batch.companyCount !== 1 ? 's' : ''}
                                  </span>
                                  {batch.fileSizeBytes != null && (
                                    <span>{formatFileSize(batch.fileSizeBytes)}</span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Clock size={12} />
                                    {format(new Date(batch.createdAt), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                                  </span>
                                  <span>por {batch.importedBy.name}</span>
                                </div>
                                <div className="mt-2.5 max-w-sm">
                                  <p className={`text-xs font-medium mb-1 ${tone.text}`}>
                                    {usage.pct}% usado · {usage.assigned} / {usage.companyCount} empresa
                                    {usage.companyCount !== 1 ? 's' : ''}
                                  </p>
                                  <div className={`h-1.5 rounded-full overflow-hidden ${tone.track}`}>
                                    <div
                                      className={`h-full rounded-full transition-all ${tone.bar}`}
                                      style={{ width: `${Math.min(100, usage.pct)}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 sm:gap-2 shrink-0 self-end sm:self-center">
                              {canDownloadOriginal && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleDownloadOriginal(batch.id)
                                  }}
                                  disabled={!batch.hasOriginalFile || downloadingOriginalId === batch.id}
                                  className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  title={
                                    batch.hasOriginalFile
                                      ? 'Descargar Excel original importado'
                                      : 'Archivo original no disponible'
                                  }
                                >
                                  <FileSpreadsheet size={16} />
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleExportBatch(batch.id)
                                }}
                                disabled={exportingBatchId === batch.id}
                                className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${
                                  batch.hasUpdates
                                    ? 'hover:bg-green-50 text-gray-400 hover:text-green-600'
                                    : 'text-gray-300 hover:bg-gray-50 hover:text-gray-400'
                                }`}
                                title={
                                  batch.hasUpdates
                                    ? 'Descargar Excel actualizado'
                                    : 'Descargar Excel actualizado (sin actividad de campaña registrada)'
                                }
                              >
                                <Download size={16} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setConfirmBlock({
                                    id: batch.id,
                                    label: batchLabel(batch),
                                    blocked: !batch.blocked,
                                  })
                                }}
                                className={`p-2 rounded-lg transition-colors ${
                                  batch.blocked
                                    ? 'hover:bg-green-50 text-red-500 hover:text-green-600'
                                    : 'hover:bg-amber-50 text-gray-400 hover:text-amber-600'
                                }`}
                                title={batch.blocked ? 'Desbloquear lote' : 'Bloquear lote'}
                              >
                                {batch.blocked ? <ShieldCheck size={16} /> : <Ban size={16} />}
                              </button>
                              <button
                                onClick={() => { setSelectedBatchId(batch.id); setDrawerSearch('') }}
                                className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                                title="Ver detalle"
                              >
                                <ChevronRight size={16} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setConfirmDelete({ id: batch.id, label: batchLabel(batch) })
                                }}
                                className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                                title="Eliminar importación"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>

    {/* ── Duplicate file warning modal ── */}
    {duplicateWarning && (() => {
      const { iconBg, iconColor } = duplicateWarningStyle(duplicateWarning.severity)
      const { title, subtitle, body } = duplicateWarningCopy(duplicateWarning.severity)
      return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
              <AlertTriangle size={20} className={iconColor} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-500">{subtitle}</p>
            </div>
          </div>

          <p className="text-sm text-gray-700 mb-3">{body}</p>

          <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm mb-4 space-y-1">
            <p className="font-medium text-gray-900 truncate">{duplicateWarning.file.name}</p>
            <p className="text-xs text-gray-500">
              Tamaño del archivo: {formatFileSize(duplicateWarning.file.size)}
            </p>
            <div className="border-t border-gray-200 pt-2 mt-2">
              <p className="text-xs font-semibold text-gray-600 mb-1">Importación anterior:</p>
              <p className="text-xs text-gray-700 truncate">{duplicateWarning.existingBatch.filename}</p>
              <p className="text-xs text-gray-500">
                {format(new Date(duplicateWarning.existingBatch.createdAt), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                {' · '}
                {batchMetricsText(duplicateWarning.existingBatch)}
                {' · '}
                {formatFileSize(duplicateWarning.existingBatch.fileSizeBytes)}
              </p>
            </div>
          </div>

          <label className="block text-xs font-medium text-gray-600 mb-1">
            Etiqueta del lote (opcional)
          </label>
          <input
            type="text"
            value={duplicateDisplayName}
            onChange={(e) => setDuplicateDisplayName(e.target.value)}
            placeholder={duplicateWarning.file.name.replace(/\.[^.]+$/, '')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-6 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />

          <div className="flex gap-3 justify-end">
            <button
              onClick={() => { setDuplicateWarning(null); setDuplicateDisplayName('') }}
              disabled={mutation.isPending}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmDuplicate}
              disabled={mutation.isPending}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {mutation.isPending ? 'Importando...' : 'Importar como nuevo lote'}
            </button>
          </div>
        </div>
      </div>
      )
    })()}

    {/* ── Confirm block/unblock modal ── */}
    {confirmBlock && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              confirmBlock.blocked ? 'bg-amber-100' : 'bg-green-100'
            }`}>
              {confirmBlock.blocked ? (
                <Ban size={20} className="text-amber-600" />
              ) : (
                <ShieldCheck size={20} className="text-green-600" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">
                {confirmBlock.blocked ? 'Bloquear importación' : 'Desbloquear importación'}
              </h3>
              <p className="text-sm text-gray-500">
                {confirmBlock.blocked
                  ? 'No se usará en nuevas asignaciones'
                  : 'Volverá a estar disponible para asignar'}
              </p>
            </div>
          </div>
          <p className="font-medium text-gray-900 bg-gray-50 rounded-lg px-3 py-2 text-sm mb-4 truncate">
            {confirmBlock.label}
          </p>
          <p className="text-xs text-gray-500 mb-6">
            {confirmBlock.blocked
              ? 'Las asignaciones, llamadas y contactos existentes no se modifican. Solo impide nuevas asignaciones desde este lote.'
              : 'El lote volverá a aparecer en el selector de asignaciones.'}
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setConfirmBlock(null)}
              disabled={blockMutation.isPending}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={() =>
                blockMutation.mutate({ id: confirmBlock.id, blocked: confirmBlock.blocked })
              }
              disabled={blockMutation.isPending}
              className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50 ${
                confirmBlock.blocked
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {blockMutation.isPending
                ? 'Guardando...'
                : confirmBlock.blocked
                  ? 'Sí, bloquear'
                  : 'Sí, desbloquear'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Confirm delete modal ── */}
    {confirmDelete && (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
              <AlertTriangle size={20} className="text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Eliminar importación</h3>
              <p className="text-sm text-gray-500">Esta acción no se puede deshacer</p>
            </div>
          </div>
          <p className="text-sm text-gray-700 mb-1">
            ¿Estás seguro que deseas eliminar el archivo:
          </p>
          <p className="font-medium text-gray-900 bg-gray-50 rounded-lg px-3 py-2 text-sm mb-4 truncate">
            {confirmDelete.label}
          </p>
          <p className="text-xs text-gray-500 mb-6">
            Solo se puede eliminar si ningún agente ha utilizado los registros de este lote (sin asignaciones ni llamadas registradas).
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setConfirmDelete(null)}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={() => deleteMutation.mutate(confirmDelete.id)}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'Eliminando...' : 'Sí, eliminar'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Drawer overlay ── */}
    {selectedBatchId && (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={() => setSelectedBatchId(null)}
        />

        {/* Panel */}
        <div className="fixed top-0 right-0 h-full w-[680px] max-w-full bg-white shadow-2xl z-50 flex flex-col">
          {/* Header */}
          <div className="bg-blue-700 text-white px-6 py-4 flex items-center justify-between shrink-0">
            <div className="min-w-0">
              <p className="font-semibold text-base truncate">
                {batchDetail ? batchLabel(batchDetail) : 'Cargando...'}
                {batchDetail?.blocked && (
                  <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-500/30 text-red-100 align-middle">
                    Bloqueado
                  </span>
                )}
              </p>
              {batchDetail?.displayName?.trim() && batchDetail.displayName.trim() !== batchDetail.filename && (
                <p className="text-blue-300 text-xs truncate">{batchDetail.filename}</p>
              )}
              {batchDetail && (
                <p className="text-blue-200 text-xs mt-0.5">
                  {batchMetricsText(batchDetail)} ·{' '}
                  {format(new Date(batchDetail.createdAt), "d MMM yyyy HH:mm", { locale: es })} ·{' '}
                  por {batchDetail.importedBy.name}
                </p>
              )}
            </div>
            <button
              onClick={() => setSelectedBatchId(null)}
              className="ml-4 p-1.5 hover:bg-blue-600 rounded-lg transition-colors shrink-0"
            >
              <X size={18} />
            </button>
          </div>

          {/* Stats bar */}
          {batchDetail && (() => {
            const companies: BatchCompany[] = batchDetail.companies ?? []
            const assigned = companies.reduce(
              (sum, c) => sum + c.contacts.filter((ct) => ct.assignment).length,
              0
            )
            const pending = companies.filter((c) => c.status === 'PENDING').length
            const interested = companies.filter((c) => c.status === 'INTERESTED').length
            const notInt = companies.filter((c) => c.status === 'NOT_INTERESTED').length
            return (
              <div className="grid grid-cols-4 divide-x divide-gray-200 border-b border-gray-200 shrink-0">
                {[
                  { label: 'Total', value: batchDetail.companyCount, color: 'text-gray-900' },
                  { label: 'Asignados', value: assigned, color: 'text-blue-600' },
                  { label: 'Pendientes', value: pending, color: 'text-amber-600' },
                  { label: 'Interesados', value: interested, color: 'text-green-600' },
                ].map((s) => (
                  <div key={s.label} className="px-4 py-3 text-center">
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">{s.label}</p>
                  </div>
                ))}
                <div className="hidden">{notInt}</div>
              </div>
            )
          })()}

          {/* Search */}
          <div className="px-4 py-3 border-b border-gray-100 shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                placeholder="Buscar por RUC, razón social o teléfono..."
                value={drawerSearch}
                onChange={(e) => setDrawerSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Client list */}
          <div className="flex-1 overflow-y-auto">
            {loadingDetail ? (
              <div className="space-y-2 p-4">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (() => {
              const companies: BatchCompany[] = (batchDetail?.companies ?? []).filter((c: BatchCompany) => {
                if (!drawerSearch) return true
                const q = drawerSearch.toLowerCase()
                const primaryPhone = c.contacts?.[0]?.telefono ?? ''
                return (
                  c.ruc.toLowerCase().includes(q) ||
                  (c.razonSocial ?? '').toLowerCase().includes(q) ||
                  primaryPhone.includes(q) ||
                  c.contacts.some((ct) => ct.nombre.toLowerCase().includes(q) || (ct.telefono ?? '').includes(q))
                )
              })
              if (companies.length === 0) return (
                <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                  Sin resultados
                </div>
              )
              return (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Empresa</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contacto</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Agente</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {companies.map((c) => {
                      const assignedContacts = c.contacts.filter((ct) => ct.assignment)
                      const primary = c.contacts?.[0]
                      const agentNames = [...new Set(assignedContacts.map((ct) => ct.assignment!.agent.name))]
                      return (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 leading-tight">{c.razonSocial || c.ruc}</p>
                          <p className="text-xs text-gray-400 font-mono mt-0.5">{c.ruc}</p>
                        </td>
                        <td className="px-3 py-3">
                          {primary ? (
                            <>
                              <p className="text-xs font-medium text-gray-800">{primary.nombre}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {primary.telefono && (
                                  <span className="flex items-center gap-1 text-xs text-gray-500">
                                    <Phone size={10} className="shrink-0" />{primary.telefono}
                                  </span>
                                )}
                                {primary.email && (
                                  <span className="flex items-center gap-1 text-xs text-gray-400 truncate max-w-[140px]">
                                    <Mail size={10} className="shrink-0" />{primary.email}
                                  </span>
                                )}
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-gray-400">Sin contactos</span>
                          )}
                          {c.plan && <p className="text-[10px] text-gray-400 truncate max-w-[120px] mt-0.5">{c.plan}</p>}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="px-3 py-3">
                          {agentNames.length > 0 ? (
                            <span className="flex items-center gap-1 text-xs text-blue-700">
                              <UserCheck size={12} />
                              {agentNames.join(', ')}
                              {assignedContacts.length < c.contacts.length && (
                                <span className="text-gray-400"> ({assignedContacts.length}/{c.contacts.length})</span>
                              )}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <UserX size={12} />Sin asignar
                            </span>
                          )}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              )
            })()}
            {batchDetail && batchDetail.companyCount > 200 && (
              <p className="text-xs text-gray-400 text-center py-3">
                Mostrando las primeras 200 de {batchDetail.companyCount} registros
              </p>
            )}
          </div>
        </div>
      </>
    )}
  </>
  )
}

interface BatchCompany {
  id: string
  ruc: string
  razonSocial?: string
  plan?: string
  status: string
  contacts: {
    nombre: string
    telefono?: string
    email?: string
    assignment?: { agent: { name: string } } | null
  }[]
}
