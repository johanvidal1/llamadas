import { useEffect, useState } from 'react'
import { Lock, ShieldAlert } from 'lucide-react'
import { elevateAdmin } from '../api/client'
import { storeElevation } from '../lib/adminElevation'

type Props = {
  open: boolean
  /** Optional context under the password step (defaults kept minimal). */
  passwordHint?: string
  onClose: () => void
  onSuccess: () => void
}

type Step = 'confirm' | 'password'

export default function AdminElevationModal({
  open,
  passwordHint = 'Ingresa la contraseña de un administrador activo de este espacio.',
  onClose,
  onSuccess,
}: Props) {
  const [step, setStep] = useState<Step>('confirm')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setStep('confirm')
      setPassword('')
      setError(null)
      setSubmitting(false)
    }
  }, [open])

  if (!open) return null

  const handleClose = () => {
    if (submitting) return
    setError(null)
    setPassword('')
    setStep('confirm')
    onClose()
  }

  const handleConfirmContinue = () => {
    setError(null)
    setStep('password')
  }

  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const data = await elevateAdmin(password)
      storeElevation({
        token: data.elevationToken,
        expiresAt: data.expiresAt,
        adminName: data.admin.name,
        adminEmail: data.admin.email,
      })
      setPassword('')
      setStep('confirm')
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

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={handleClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {step === 'confirm' ? (
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                <ShieldAlert size={18} className="text-amber-700" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Solo administrador</h2>
                <p className="text-sm text-gray-500 mt-1">¿Desea continuar?</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <button
                type="button"
                onClick={handleConfirmContinue}
                className="btn-primary justify-center flex-1"
              >
                Continuar
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="btn-secondary justify-center flex-1"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={handleSubmitPassword}
            className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                <Lock size={18} className="text-amber-700" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Contraseña de administrador</h2>
                <p className="text-sm text-gray-500 mt-1">{passwordHint}</p>
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-gray-600">Contraseña</span>
              <input
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>

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
        )}
      </div>
    </>
  )
}
