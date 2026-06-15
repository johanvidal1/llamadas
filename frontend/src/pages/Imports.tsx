import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getImports, getImport, uploadImport, deleteImport } from '../api/client'
import toast from 'react-hot-toast'
import {
  Upload, FileSpreadsheet, ChevronRight, Clock, Users, X,
  Phone, Mail, UserCheck, UserX, Search, Trash2, AlertTriangle,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { StatusBadge } from '../components/StatusBadge'

export default function Imports() {
  const [dragging, setDragging] = useState(false)
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [drawerSearch, setDrawerSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; filename: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['imports'],
    queryFn: getImports,
  })

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
      toast.error(err?.response?.data?.error ?? 'Error al eliminar la importación')
      setConfirmDelete(null)
    },
  })

  const mutation = useMutation({
    mutationFn: (file: File) => uploadImport(file),
    onSuccess: (data) => {
      toast.success(`✅ Importados ${data.imported} registros de "${data.filename}"`)
      if (data.withoutPhone && data.withoutPhone > 0) {
        toast(`⚠️ ${data.withoutPhone} registro(s) sin teléfono`, { icon: '⚠️' })
      }
      if (data.withoutContacts && data.withoutContacts > 0) {
        toast(`⚠️ ${data.withoutContacts} registro(s) sin contactos`, { icon: '⚠️' })
      }
      qc.invalidateQueries({ queryKey: ['imports'] })
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Error al importar el archivo')
    },
  })

  const handleFile = (file: File) => {
    if (!file.name.match(/\.(xlsx?|csv)$/i)) {
      toast.error('Solo se permiten archivos Excel (.xlsx, .xls) o CSV (.csv)')
      return
    }
    mutation.mutate(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
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
            <p className="text-sm text-gray-400 mt-1">Excel (.xlsx, .xls) · CSV (.csv) · Máximo 20 MB</p>
          </>
        )}
      </div>

      {/* Columns hint */}
      <div className="card p-5">
        <p className="text-sm font-semibold text-gray-700 mb-2">
          📋 Columnas reconocidas automáticamente:
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-500">
          <span><strong>RUC:</strong> ruc</span>
          <span><strong>Razón social:</strong> razon_social, razonsocial</span>
          <span><strong>Contacto:</strong> nombre, name, contacto, cliente</span>
          <span><strong>Teléfono:</strong> telefono, tel, phone, celular, móvil</span>
          <span><strong>2º teléfono:</strong> telefono2, tel2, celular2, phone2</span>
          <span><strong>Email:</strong> email, correo</span>
          <span><strong>DNI:</strong> dni, documento</span>
          <span><strong>Tipo contacto:</strong> tipo_contacto, tipo, cargo</span>
          <span><strong>Estado:</strong> estado</span>
          <span><strong>Fecha consulta:</strong> fecha_consulta, fecha</span>
        </div>
      </div>

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
          <div className="space-y-3">
            {batches.map(
              (batch: {
                id: string
                filename: string
                totalRecords: number
                createdAt: string
                importedBy: { name: string }
                _count: { companies: number }
              }) => (
                <div key={batch.id}
                  className="card p-5 flex items-center justify-between hover:shadow-md hover:border-blue-200 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <FileSpreadsheet size={20} className="text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{batch.filename}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Users size={12} />
                          {batch._count.companies} registros
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {format(new Date(batch.createdAt), "d MMM yyyy 'a las' HH:mm", { locale: es })}
                        </span>
                        <span>por {batch.importedBy.name}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setSelectedBatchId(batch.id); setDrawerSearch('') }}
                      className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                      title="Ver detalle"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: batch.id, filename: batch.filename }) }}
                      className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                      title="Eliminar importación"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>

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
            {confirmDelete.filename}
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
                {batchDetail?.filename ?? 'Cargando...'}
              </p>
              {batchDetail && (
                <p className="text-blue-200 text-xs mt-0.5">
                  {batchDetail._count.companies} empresas ·{' '}
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
                  { label: 'Total', value: batchDetail._count.companies, color: 'text-gray-900' },
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
            {batchDetail && batchDetail._count.companies > 200 && (
              <p className="text-xs text-gray-400 text-center py-3">
                Mostrando las primeras 200 de {batchDetail._count.companies} registros
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
