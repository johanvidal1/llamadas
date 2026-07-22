import { useState } from 'react'
import { Lock } from 'lucide-react'
import { elevateAdmin } from '../api/client'
import { storeElevation } from '../lib/adminElevation'

type Props = {
  open: boolean
  title?: string
  description?: string
  onClose: () => void
  onSuccess: () => void
}

export default function AdminElevationModal({
  open,
  title = 'Autorización de administrador',
  description = 'Ingresa el email y contraseña de un administrador activo de este espacio para continuar.',
  onClose,
  onSuccess,
}: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const data = await elevateAdmin(email.trim(), password)
      storeElevation({
        token: data.elevationToken,
        expiresAt: data.expiresAt,
        adminName: data.admin.name,
        adminEmail: data.admin.email,
      })
      setEmail('')
      setPassword('')
      onSuccess()
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'No se pudo autorizar'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (submitting) return
    setError(null)
    setPassword('')
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={handleClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
              <Lock size={18} className="text-amber-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
              <p className="text-sm text-gray-500 mt-1">{description}</p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Email administrador</span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="admin@empresa.com"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Contraseña</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <button type="submit" disabled={submitting} className="btn-primary justify-center flex-1">
              {submitting ? 'Verificando…' : 'Autorizar'}
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
    </>
  )
}
