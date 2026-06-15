import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { logCall } from '../api/client'
import toast from 'react-hot-toast'
import { X, Phone } from 'lucide-react'

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

const DISPOSITIONS = [
  { value: 'INTERESTED', label: '✅ Interesado en migrar', color: 'border-green-500 bg-green-50 text-green-800' },
  { value: 'NOT_INTERESTED', label: '❌ No interesado', color: 'border-red-500 bg-red-50 text-red-800' },
  { value: 'NO_ANSWER', label: '📵 Sin respuesta', color: 'border-gray-500 bg-gray-50 text-gray-800' },
  { value: 'BUSY', label: '⏳ Ocupado / Volver a llamar', color: 'border-yellow-500 bg-yellow-50 text-yellow-800' },
  { value: 'CALLBACK', label: '📅 Agendar llamada posterior', color: 'border-blue-500 bg-blue-50 text-blue-800' },
  { value: 'DO_NOT_CALL', label: '🚫 No llamar (lista negra)', color: 'border-red-800 bg-red-100 text-red-900' },
  { value: 'OTHER', label: '📝 Otro resultado', color: 'border-purple-500 bg-purple-50 text-purple-800' },
]

export default function CallModal({ client, onClose }: Props) {
  const [disposition, setDisposition] = useState('')
  const [notes, setNotes] = useState('')
  const [contactId, setContactId] = useState(client.contacts?.[0]?.id ?? '')
  const [callbackDate, setCallbackDate] = useState('')
  const [callbackTime, setCallbackTime] = useState('09:00')
  const [callbackNotes, setCallbackNotes] = useState('')

  const qc = useQueryClient()

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
    if (disposition === 'CALLBACK' && !callbackDate) {
      toast.error('Selecciona la fecha del callback')
      return
    }

    const payload: Record<string, unknown> = {
      clientId: client.id,
      contactId: contactId || undefined,
      disposition,
      notes,
    }

    if (disposition === 'CALLBACK') {
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
          {/* Disposition selection */}
          {/* Contact selector */}
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

          <div>
            <label className="label">Resultado de la llamada *</label>
            <div className="space-y-2 mt-2">
              {DISPOSITIONS.map((d) => (
                <label
                  key={d.value}
                  className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    disposition === d.value ? d.color : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="disposition"
                    value={d.value}
                    checked={disposition === d.value}
                    onChange={(e) => setDisposition(e.target.value)}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium">{d.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Callback date (only when CALLBACK selected) */}
          {disposition === 'CALLBACK' && (
            <div className="bg-blue-50 rounded-lg p-4 space-y-3 border border-blue-200">
              <p className="text-sm font-semibold text-blue-800">📅 Programar llamada de seguimiento</p>
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

          {/* General notes */}
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

          {/* Actions */}
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
