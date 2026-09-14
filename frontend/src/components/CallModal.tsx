import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getClient, logCall } from '../api/client'
import toast from 'react-hot-toast'
import { X, Phone, CalendarClock, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { getResponseOption, requiresCallbackDate } from '../config/responseOptions'
import DispositionSelector from './DispositionSelector'

interface Client {
  id: string
  ruc: string
  razonSocial?: string
  contacts?: { id?: string; nombre: string; tipoContacto?: string; telefono?: string }[]
}

export type CallModalCallbackContext = {
  kind: 'callback'
  scheduledAt: string
  notes?: string
}

interface Props {
  client: Client
  onClose: () => void
  initialContactId?: string
  context?: CallModalCallbackContext
  onViewFullRecord?: () => void
}

function isAgendarDisabled(disposition: string): boolean {
  if (!disposition) return false
  const opt = getResponseOption(disposition)
  return (
    !!opt?.disableAgendar ||
    disposition === 'DO_NOT_CALL' ||
    disposition === 'NOT_INTERESTED'
  )
}

function toCallbackIso(date: string, time: string): string {
  return new Date(`${date}T${time || '09:00'}:00`).toISOString()
}

export default function CallModal({
  client,
  onClose,
  initialContactId,
  context,
  onViewFullRecord,
}: Props) {
  const isCallback = context?.kind === 'callback'
  const { data: fetched } = useQuery({
    queryKey: ['client-detail', client.id],
    queryFn: () => getClient(client.id),
    enabled: isCallback,
    staleTime: 30_000,
  })
  const fetchedClient = fetched as
    | {
        contacts?: { id?: string; nombre: string; tipoContacto?: string; telefono?: string }[]
        razonSocial?: string
        ruc?: string
      }
    | undefined

  const contacts =
    (fetchedClient?.contacts?.length ? fetchedClient.contacts : client.contacts) ?? []
  const titleName = fetchedClient?.razonSocial || client.razonSocial || client.ruc
  const titleRuc = fetchedClient?.ruc || client.ruc

  const [disposition, setDisposition] = useState('')
  const [notes, setNotes] = useState('')
  const [contactId, setContactId] = useState(initialContactId || client.contacts?.[0]?.id || '')
  const [callbackDate, setCallbackDate] = useState('')
  const [callbackTime, setCallbackTime] = useState('09:00')
  const [callbackNotes, setCallbackNotes] = useState('')

  useEffect(() => {
    if (initialContactId) {
      setContactId(initialContactId)
      return
    }
    const firstId = contacts.find((ct) => ct.id)?.id
    if (firstId) setContactId((prev) => prev || firstId)
  }, [initialContactId, contacts])

  const qc = useQueryClient()

  const agendarDisabled = isAgendarDisabled(disposition)
  const dateRequired = requiresCallbackDate(disposition)
  const showAgenda = !!disposition && !agendarDisabled

  const handleDispositionChange = (next: string) => {
    setDisposition(next)
    if (isAgendarDisabled(next)) {
      setCallbackDate('')
      setCallbackTime('')
      setCallbackNotes('')
    } else {
      setCallbackTime((prev) => prev || '09:00')
    }
  }

  const mutation = useMutation({
    mutationFn: (data: object) => logCall(data),
    onSuccess: () => {
      toast.success('Llamada registrada correctamente')
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['callbacks'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['client-detail', client.id] })
      onClose()
    },
    onError: (err: { response?: { status?: number; data?: { error?: string; message?: string } } }) => {
      if (
        err?.response?.status === 409 &&
        err?.response?.data?.error === 'duplicate_call_log'
      ) {
        toast(err.response.data.message ?? 'Registro duplicado', { icon: '⚠️' })
        return
      }
      toast.error(err?.response?.data?.error ?? 'Error al registrar la llamada')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!disposition) {
      toast.error('Selecciona un resultado de la llamada')
      return
    }
    if (requiresCallbackDate(disposition) && !callbackDate) {
      toast.error('Selecciona la fecha del callback')
      return
    }

    const payload: Record<string, unknown> = {
      clientId: client.id,
      contactId: contactId || undefined,
      disposition,
      notes,
    }

    if (isAgendarDisabled(disposition)) {
      if (isCallback) payload.cancelPendingCallbacks = true
    } else if (callbackDate) {
      payload.callbackDate = toCallbackIso(callbackDate, callbackTime)
      payload.callbackNotes = callbackNotes
    } else if (isCallback) {
      payload.cancelPendingCallbacks = true
    }

    mutation.mutate(payload)
  }

  const scheduledLabel =
    isCallback && context.scheduledAt
      ? format(new Date(context.scheduledAt), "dd/MM/yy HH:mm", { locale: es })
      : null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className={`bg-white shadow-xl w-full overflow-hidden flex flex-col ${
          isCallback
            ? 'h-[96vh] max-h-[96vh] rounded-t-2xl sm:h-auto sm:min-h-[70vh] sm:max-h-[92vh] sm:rounded-xl sm:max-w-3xl'
            : 'rounded-xl max-w-lg max-h-[90vh] m-4 sm:m-0'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="call-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
              <Phone size={20} className="text-blue-600" />
            </div>
            <div className="min-w-0">
              <h2 id="call-modal-title" className="font-semibold text-gray-900 truncate">
                {isCallback ? 'Registrar resultado' : titleName}
              </h2>
              {isCallback ? (
                <p className="text-sm text-gray-700 truncate">{titleName}</p>
              ) : null}
              <p className="text-sm text-gray-500 font-mono">{titleRuc}</p>
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

        {isCallback && (
          <div className="px-5 pt-4 shrink-0 space-y-2">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-sm text-blue-900 flex items-start gap-2">
              <CalendarClock size={16} className="mt-0.5 shrink-0 text-blue-600" />
              <div className="min-w-0">
                <p className="font-medium">Agendado {scheduledLabel}</p>
                {context.notes ? (
                  <p className="text-blue-800/80 italic truncate mt-0.5">{context.notes}</p>
                ) : null}
              </div>
            </div>
            {onViewFullRecord && (
              <button
                type="button"
                onClick={onViewFullRecord}
                className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline inline-flex items-center gap-1"
              >
                <ExternalLink size={12} />
                Ver ficha completa
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {contacts.length > 0 && (
              <div>
                <label className="label">Contacto al que llamaste</label>
                <select
                  className="input mt-1"
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                >
                  <option value="">— Sin especificar —</option>
                  {contacts.map((ct, idx) => (
                    <option key={ct.id ?? `ct-${idx}`} value={ct.id ?? ''}>
                      {ct.nombre}
                      {ct.tipoContacto ? ` (${ct.tipoContacto})` : ''}
                      {ct.telefono ? ` · ${ct.telefono}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="label">Respuesta *</label>
              <div className="mt-1">
                <DispositionSelector
                  disposition={disposition}
                  onChange={handleDispositionChange}
                />
              </div>
            </div>

            {showAgenda && (
              <div className="bg-blue-50 rounded-lg p-4 space-y-3 border border-blue-200">
                <p className="text-sm font-semibold text-blue-800">
                  Programar llamada de seguimiento
                  {dateRequired ? (
                    <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wide bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                      Requerido
                    </span>
                  ) : (
                    <span className="ml-2 font-normal text-xs text-blue-700/70">(opcional)</span>
                  )}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Fecha {dateRequired ? '*' : ''}</label>
                    <input
                      type="date"
                      className="input"
                      value={callbackDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setCallbackDate(e.target.value)}
                      required={dateRequired}
                    />
                  </div>
                  <div>
                    <label className="label">Hora</label>
                    <input
                      type="time"
                      className="input"
                      value={callbackTime}
                      onChange={(e) => setCallbackTime(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Nota para el callback</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Ej: Cliente pide llamar por la tarde..."
                    value={callbackNotes}
                    onChange={(e) => setCallbackNotes(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="label">Notas de la llamada</label>
              <textarea
                className="input resize-none"
                rows={3}
                placeholder="Observaciones, comentarios del cliente, detalles importantes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="shrink-0 flex justify-end gap-3 px-5 py-4 border-t bg-white pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={mutation.isPending || !disposition}
            >
              {mutation.isPending ? 'Guardando...' : 'Guardar resultado'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
