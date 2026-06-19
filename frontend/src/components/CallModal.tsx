import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { logCall } from '../api/client'
import toast from 'react-hot-toast'
import { X, Phone } from 'lucide-react'
import { getResponseOption } from '../config/responseOptions'
import DispositionSelector from './DispositionSelector'

interface Client {
  id: string
  ruc: string
  razonSocial?: string
  contacts?: { id?: string; nombre: string; tipoContacto?: string; telefono?: string }[]
}

interface Props {
  client: Client
  onClose: () => void
}

export default function CallModal({ client, onClose }: Props) {
  const [disposition, setDisposition] = useState('')
  const [notes, setNotes] = useState('')
  const [contactId, setContactId] = useState(client.contacts?.[0]?.id ?? '')
  const [callbackDate, setCallbackDate] = useState('')
  const [callbackTime, setCallbackTime] = useState('09:00')
  const [callbackNotes, setCallbackNotes] = useState('')

  const qc = useQueryClient()
  const selectedResponse = disposition ? getResponseOption(disposition) : undefined

  const handleDispositionChange = (next: string) => {
    setDisposition(next)
    const opt = getResponseOption(next)
    if (opt?.disableAgendar) {
      setCallbackDate('')
      setCallbackTime('')
      setCallbackNotes('')
    }
  }

  const mutation = useMutation({
    mutationFn: (data: object) => logCall(data),
    onSuccess: () => {
      toast.success('Llamada registrada correctamente')
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['callbacks'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      onClose()
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Error al registrar la llamada')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!disposition) {
      toast.error('Selecciona un resultado de la llamada')
      return
    }
    if (disposition === 'VOLVER_A_LLAMAR' && !callbackDate) {
      toast.error('Selecciona la fecha del callback')
      return
    }

    const payload: Record<string, unknown> = {
      clientId: client.id,
      contactId: contactId || undefined,
      disposition,
      notes,
    }

    if (disposition === 'VOLVER_A_LLAMAR') {
      payload.callbackDate = new Date(`${callbackDate}T${callbackTime}:00`).toISOString()
      payload.callbackNotes = callbackNotes
    }

    mutation.mutate(payload)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <Phone size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">{client.razonSocial || client.ruc}</h2>
              <p className="text-sm text-gray-500 font-mono">{client.ruc}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {client.contacts && client.contacts.length > 0 && (
            <div>
              <label className="label">Contacto al que llamaste</label>
              <select
                className="input mt-1"
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
              >
                <option value="">— Sin especificar —</option>
                {client.contacts.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.nombre}{ct.tipoContacto ? ` (${ct.tipoContacto})` : ''}{ct.telefono ? ` · ${ct.telefono}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="label">Respuesta *</label>
              <div className="mt-1">
                <DispositionSelector
                  disposition={disposition}
                  onChange={handleDispositionChange}
                />
              </div>
            </div>
            <div>
              <label className="label">Aclaración</label>
              <div className="mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-700 min-h-[42px] flex items-center">
                {selectedResponse?.aclaracion ? (
                  <span className="badge bg-slate-200 text-slate-800">{selectedResponse.aclaracion}</span>
                ) : (
                  <span className="text-gray-400 italic text-xs">Según respuesta</span>
                )}
              </div>
            </div>
          </div>

          {disposition === 'VOLVER_A_LLAMAR' && (
            <div className="bg-blue-50 rounded-lg p-4 space-y-3 border border-blue-200">
              <p className="text-sm font-semibold text-blue-800">Programar llamada de seguimiento</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Fecha *</label>
                  <input
                    type="date"
                    className="input"
                    value={callbackDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setCallbackDate(e.target.value)}
                    required
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

          <div className="flex justify-end gap-3 pt-2">
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
