import { CheckCircle2 } from 'lucide-react'
import { format } from 'date-fns'

export type CompleteConfirm = {
  id: string
  label: string
  scheduledAt: string
  companyId: string
}

export function formatAgendaDateTime(date: string): string {
  return format(new Date(date), 'dd/MM/yy HH:mm')
}

type Props = {
  confirm: CompleteConfirm | null
  onClose: () => void
  onConfirm: () => void
  isPending: boolean
}

export default function CompleteCallbackModal({ confirm, onClose, onConfirm, isPending }: Props) {
  if (!confirm) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0">
              <CheckCircle2 size={20} className="text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Completar agenda</h2>
              <p className="text-sm text-gray-500 mt-1">
                <span className="font-medium text-gray-700">{confirm.label}</span>
                {' — '}programado para el{' '}
                <span className="font-medium text-gray-700">
                  {formatAgendaDateTime(confirm.scheduledAt)}
                </span>
                .
              </p>
              <p className="text-sm text-gray-500 mt-2">
                Ya no aparecerá en su agenda.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <button
              type="button"
              onClick={onConfirm}
              disabled={isPending}
              className="btn-success justify-center flex-1"
            >
              Sí, completar
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="btn-secondary justify-center flex-1"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
