import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteCall, getClient } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  X,
  Phone,
  User,
  CalendarClock,
  AlertCircle,
  History,
  Trash2,
} from 'lucide-react'
import { format, isPast, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  DISPOSITION_CONFIG,
  getDispositionBorderColor,
} from './StatusBadge'
import { getDispositionLabel } from '../config/responseOptions'

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

function callLogDisplayTime(log: Pick<CallLogEntry, 'calledAt' | 'updatedAt'>): Date {
  return new Date(log.updatedAt ?? log.calledAt)
}

function callLogWasEdited(log: Pick<CallLogEntry, 'calledAt' | 'updatedAt'>): boolean {
  if (!log.updatedAt) return false
  return new Date(log.updatedAt).getTime() > new Date(log.calledAt).getTime()
}

interface CallbackEntry {
  id: string
  agentId: string
  callLogId?: string
  scheduledAt: string
  notes?: string
  completed: boolean
  agent?: { name: string }
}

interface ClientDetail {
  id: string
  ruc: string
  razonSocial?: string
  status: string
  contacts: {
    id: string
    nombre: string
    tipoContacto?: string
    telefono?: string
    email?: string
    assignment?: { agent?: { name: string } }
  }[]
  callLogs: CallLogEntry[]
  callbacks: CallbackEntry[]
}

interface Props {
  clientId: string
  agentFilterId?: string
  onClose: () => void
  initialFocus?: 'summary' | 'history'
  highlightCallbackId?: string
}

function callbackStyle(dt: string): string {
  const d = new Date(dt)
  if (isPast(d)) return 'text-red-600 bg-red-50 border-red-200'
  if (isToday(d)) return 'text-amber-700 bg-amber-50 border-amber-200'
  return 'text-blue-700 bg-blue-50 border-blue-200'
}

export default function ClientRecordModal({
  clientId,
  agentFilterId,
  onClose,
  initialFocus = 'summary',
  highlightCallbackId,
}: Props) {
  const historyRef = useRef<HTMLDivElement>(null)
  const callbackRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [deleteTarget, setDeleteTarget] = useState<CallLogEntry | null>(null)
  const { user } = useAuth()
  const qc = useQueryClient()
  const canDeleteCallLog = user?.isSuperAdmin === true || user?.isSystemOwner === true

  const deleteMutation = useMutation({
    mutationFn: (callLogId: string) => deleteCall(callLogId),
    onSuccess: () => {
      toast.success('Registro de llamada eliminado')
      qc.invalidateQueries({ queryKey: ['client', clientId] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setDeleteTarget(null)
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Error al eliminar el registro')
    },
  })

  const { data: client, isLoading, isError } = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => getClient(clientId) as Promise<ClientDetail>,
    enabled: !!clientId,
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!client || initialFocus !== 'history') return
    const t = setTimeout(() => {
      historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
    return () => clearTimeout(t)
  }, [client, initialFocus])

  useEffect(() => {
    if (!client || !highlightCallbackId) return
    const t = setTimeout(() => {
      callbackRefs.current.get(highlightCallbackId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 150)
    return () => clearTimeout(t)
  }, [client, highlightCallbackId])

  const callLogs = (client?.callLogs ?? [])
    .filter((l) => !agentFilterId || l.agentId === agentFilterId)
    .sort((a, b) => callLogDisplayTime(b).getTime() - callLogDisplayTime(a).getTime())
  const latestLog = callLogs[0]
  const registeredContactId = latestLog?.contact?.id
  const registeredContact = registeredContactId
    ? client?.contacts.find((c) => c.id === registeredContactId)
    : undefined

  const callLogById = new Map((client?.callLogs ?? []).map((l) => [l.id, l]))
  const callbacks = (client?.callbacks ?? []).filter((cb) => {
    if (highlightCallbackId && cb.id === highlightCallbackId) return true
    if (cb.completed) return false
    if (agentFilterId && cb.agentId !== agentFilterId) return false
    if (!registeredContactId) return true
    if (!cb.callLogId) return true
    const log = callLogById.get(cb.callLogId)
    if (!log?.contact?.id) return true
    return log.contact.id === registeredContactId
  })

  const agentNames = [
    ...new Set(
      (client?.contacts ?? [])
        .filter((ct) => ct.assignment?.agent?.name)
        .map((ct) => ct.assignment!.agent!.name)
    ),
  ]

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
              <User size={20} className="text-blue-600" />
            </div>
            <div className="min-w-0">
              {isLoading ? (
                <p className="text-sm text-gray-400">Cargando...</p>
              ) : (
                <>
                  <h2 className="font-semibold text-gray-900 truncate">
                    {client?.razonSocial || client?.ruc || 'Cliente'}
                  </h2>
                  <p className="text-sm text-gray-500 font-mono">{client?.ruc}</p>
                </>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Cargando registro...</div>
        ) : isError || !client ? (
          <div className="p-8 text-center text-red-500">No se pudo cargar el registro</div>
        ) : (
          <div className="overflow-y-auto flex-1 p-5 space-y-5">
            {/* Company info */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Información
              </h3>
              <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <span className="text-gray-500">Agente{agentNames.length !== 1 ? 's' : ''}:</span>
                  <span className="text-gray-800 font-medium">
                    {agentNames.length > 0 ? agentNames.join(', ') : 'Sin asignar'}
                  </span>
                </div>
                {agentFilterId && (
                  <p className="text-xs text-blue-600">
                    Mostrando actividad del agente filtrado
                  </p>
                )}
              </div>
            </section>

            {/* Registered contact (from latest call) */}
            {latestLog?.contact ? (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Contacto registrado
                </h3>
                <div className="flex items-start gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
                  <User size={14} className="text-gray-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">
                      {registeredContact?.nombre ?? latestLog.contact.nombre}
                      {(registeredContact?.tipoContacto ?? latestLog.contact.tipoContacto) ? (
                        <span className="text-gray-400 font-normal ml-1">
                          ({registeredContact?.tipoContacto ?? latestLog.contact.tipoContacto})
                        </span>
                      ) : null}
                    </p>
                    {registeredContact?.telefono && (
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Phone size={11} />
                        {registeredContact.telefono}
                      </p>
                    )}
                    {registeredContact?.email && (
                      <p className="text-xs text-gray-500">{registeredContact.email}</p>
                    )}
                  </div>
                </div>
              </section>
            ) : latestLog ? (
              <p className="text-xs text-gray-400 italic">Sin contacto en la última llamada</p>
            ) : null}

            {/* Pending callbacks (reference) */}
            {callbacks.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <CalendarClock size={13} />
                  Agendas (referencia) ({callbacks.length})
                </h3>
                <div className="space-y-1.5">
                  {callbacks.map((cb) => (
                    <div
                      key={cb.id}
                      ref={(el) => {
                        if (el) callbackRefs.current.set(cb.id, el)
                        else callbackRefs.current.delete(cb.id)
                      }}
                      className={`rounded-lg border px-3 py-2 text-sm ${callbackStyle(cb.scheduledAt)} ${
                        cb.id === highlightCallbackId
                          ? 'ring-2 ring-blue-400 ring-offset-1 shadow-sm'
                          : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 font-medium">
                        <CalendarClock size={13} />
                        {format(new Date(cb.scheduledAt), "dd/MM/yyyy HH:mm", { locale: es })}
                        {cb.completed && (
                          <span className="text-xs font-semibold text-green-700">Completado</span>
                        )}
                        {cb.agent?.name && (
                          <span className="text-xs font-normal opacity-75">
                            · {cb.agent.name}
                          </span>
                        )}
                      </div>
                      {cb.notes && (
                        <p className="text-xs mt-1 opacity-90 whitespace-pre-wrap">{cb.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Call history */}
            <section ref={historyRef} className="space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <History size={13} />
                Historial de llamadas ({callLogs.length})
              </h3>
              {callLogs.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-gray-400 bg-gray-50 rounded-lg">
                  <div className="text-center">
                    <AlertCircle size={22} className="mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Sin llamadas registradas</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 bg-gray-50 rounded-lg p-3">
                  {callLogs.map((log) => {
                    const cfg =
                      DISPOSITION_CONFIG[log.disposition] ?? {
                        label: getDispositionLabel(log.disposition),
                        classes: 'bg-gray-100 text-gray-600',
                      }
                    const linkedCb = client.callbacks?.find((c) => c.callLogId === log.id)
                    return (
                      <div
                        key={log.id}
                        className={`bg-white rounded-lg border border-gray-200 border-l-4 ${getDispositionBorderColor(log.disposition)} p-2.5 shadow-sm`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className={`badge text-[10px] ${cfg.classes}`}>{cfg.label}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {canDeleteCallLog && (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(log)}
                                className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                                title="Eliminar registro"
                                disabled={deleteMutation.isPending}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
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
                          <p className="text-[10px] text-blue-600 mb-1 font-medium">
                            {log.contact.nombre}
                            {log.contact.tipoContacto ? ` · ${log.contact.tipoContacto}` : ''}
                          </p>
                        )}
                        {log.aclaracion && (
                          <p className="text-[11px] text-gray-500 italic mb-1">{log.aclaracion}</p>
                        )}
                        {log.notes && (
                          <p className="text-xs text-gray-700 leading-snug mb-1 bg-gray-50 rounded px-2 py-1 whitespace-pre-wrap">
                            {log.notes}
                          </p>
                        )}
                        {linkedCb && (
                          <div className="mt-1 pt-1 border-t border-dashed border-blue-200 space-y-0.5">
                            <div className="flex items-center gap-1 text-[10px] text-blue-600">
                              <CalendarClock size={9} />
                              <span className="font-semibold">Agendado:</span>
                              <span className="font-mono">
                                {format(new Date(linkedCb.scheduledAt), 'dd/MM/yy HH:mm')}
                              </span>
                              {linkedCb.completed && (
                                <span className="ml-1 text-green-600 font-semibold">✓</span>
                              )}
                            </div>
                            {linkedCb.notes && (
                              <p className="text-[10px] text-blue-500 italic pl-3 leading-snug whitespace-pre-wrap">
                                {linkedCb.notes}
                              </p>
                            )}
                          </div>
                        )}
                        <p className="text-[10px] text-gray-400 mt-1.5 pt-1 border-t border-gray-100">
                          — {log.agent.name}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        <div className="border-t p-4 flex justify-end shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cerrar
          </button>
        </div>
      </div>

      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4"
          onClick={() => !deleteMutation.isPending && setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Eliminar registro de llamada</h3>
                <p className="text-sm text-gray-600 mt-1">
                  ¿Eliminar el registro del{' '}
                  {format(callLogDisplayTime(deleteTarget), 'dd/MM/yyyy HH:mm', { locale: es })}
                  {deleteTarget.contact ? ` (${deleteTarget.contact.nombre})` : ''}? Esta acción no
                  se puede deshacer.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
