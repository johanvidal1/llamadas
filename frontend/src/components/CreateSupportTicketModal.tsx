import { useState } from 'react'
import { LifeBuoy } from 'lucide-react'
import { createSupportTicket } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { hasValidElevation } from '../lib/adminElevation'
import AdminElevationModal from './AdminElevationModal'

type Props = {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

function buildTicketContext(): Record<string, unknown> {
  return {
    url: window.location.href,
    pathname: window.location.pathname,
    search: window.location.search,
    view: window.location.pathname,
    userAgent: navigator.userAgent,
    batchId: new URLSearchParams(window.location.search).get('batchId') || undefined,
    companyId: new URLSearchParams(window.location.search).get('companyId') || undefined,
    filter: new URLSearchParams(window.location.search).get('filter') || undefined,
  }
}

export default function CreateSupportTicketModal({ open, onClose, onCreated }: Props) {
  const { isAdmin } = useAuth()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [needsElevation, setNeedsElevation] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  if (!open) return null

  const resetForm = () => {
    setSubject('')
    setBody('')
    setError(null)
    setSuccessMsg(null)
    setNeedsElevation(false)
  }

  const handleClose = () => {
    if (submitting) return
    resetForm()
    onClose()
  }

  const submitTicket = async () => {
    setError(null)
    setSubmitting(true)
    try {
      await createSupportTicket({
        subject: subject.trim(),
        body: body.trim(),
        context: buildTicketContext(),
      })
      setSuccessMsg('Ticket enviado. El administrador lo verá en Soporte.')
      setSubject('')
      setBody('')
      onCreated?.()
      window.setTimeout(() => {
        resetForm()
        onClose()
      }, 1200)
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code
      if (code === 'ADMIN_ELEVATION_REQUIRED') {
        setNeedsElevation(true)
        setError('Se requiere autorización de administrador.')
      } else {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'No se pudo crear el ticket'
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin && !hasValidElevation()) {
      setNeedsElevation(true)
      return
    }
    await submitTicket()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={handleClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
              <LifeBuoy size={18} className="text-blue-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Ticket de soporte</h2>
              <p className="text-sm text-gray-500 mt-1">
                {isAdmin
                  ? 'Describe el problema. Se incluirá el contexto de la pantalla actual.'
                  : 'Requiere autorización de un administrador. Se incluirá el contexto de la pantalla.'}
              </p>
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">Asunto</span>
            <input
              type="text"
              required
              minLength={3}
              maxLength={200}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Resumen breve"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">Detalle</span>
            <textarea
              required
              minLength={5}
              maxLength={5000}
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              placeholder="Qué ocurrió, qué esperabas, pasos para reproducir…"
            />
          </label>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          {successMsg && (
            <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{successMsg}</p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <button type="submit" disabled={submitting} className="btn-primary justify-center flex-1">
              {submitting ? 'Enviando…' : 'Enviar ticket'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="btn-secondary justify-center flex-1"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>

      <AdminElevationModal
        open={needsElevation}
        title="Autorización para soporte"
        description="Un administrador debe autorizar la creación del ticket con su email y contraseña."
        onClose={() => setNeedsElevation(false)}
        onSuccess={() => {
          setNeedsElevation(false)
          void submitTicket()
        }}
      />
    </>
  )
}
