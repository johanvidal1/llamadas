import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { getBillingStatus, type BillingStatus } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

function dismissKey(status: BillingStatus): string {
  return `billing-banner-dismiss:${status.today}:${status.phase}`
}

function isDismissedToday(status: BillingStatus): boolean {
  try {
    return localStorage.getItem(dismissKey(status)) === '1'
  } catch {
    return false
  }
}

function dismissForToday(status: BillingStatus) {
  try {
    localStorage.setItem(dismissKey(status), '1')
  } catch {
    /* ignore quota / private mode */
  }
}

const severityStyles: Record<
  NonNullable<BillingStatus['severity']>,
  { bar: string; text: string; button: string }
> = {
  none: {
    bar: 'bg-gray-100 border-gray-200',
    text: 'text-gray-800',
    button: 'text-gray-600 hover:bg-gray-200/80',
  },
  amber: {
    bar: 'bg-amber-50 border-amber-300',
    text: 'text-amber-950',
    button: 'text-amber-800 hover:bg-amber-100',
  },
  orange: {
    bar: 'bg-orange-50 border-orange-400',
    text: 'text-orange-950',
    button: 'text-orange-800 hover:bg-orange-100',
  },
  red: {
    bar: 'bg-red-50 border-red-400',
    text: 'text-red-950',
    button: 'text-red-800 hover:bg-red-100',
  },
}

/**
 * Persistent cobranza strip for tenant ADMINs.
 * Dismisses for the current calendar day only (localStorage keyed by date+phase).
 * Does not auto-hide after a few seconds.
 */
export default function BillingBanner() {
  const { isAdmin } = useAuth()
  const [dismissed, setDismissed] = useState(false)

  const query = useQuery({
    queryKey: ['billing-status'],
    queryFn: getBillingStatus,
    enabled: isAdmin,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  })

  const status = query.data

  useEffect(() => {
    if (!status?.showBanner) {
      setDismissed(false)
      return
    }
    setDismissed(isDismissedToday(status))
  }, [status])

  if (!isAdmin || !status?.showBanner || dismissed) return null

  const styles = severityStyles[status.severity] ?? severityStyles.amber

  return (
    <div
      role="status"
      className={`shrink-0 border-b px-3 py-2.5 sm:px-4 ${styles.bar}`}
    >
      <div className="flex items-start gap-3 max-w-5xl mx-auto">
        <div className={`flex-1 min-w-0 text-sm ${styles.text}`}>
          <p className="font-semibold leading-snug">{status.message}</p>
          {status.detail && (
            <p className="mt-0.5 text-xs sm:text-sm opacity-90 leading-snug">
              {status.detail}
            </p>
          )}
        </div>
        <button
          type="button"
          className={`shrink-0 inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${styles.button}`}
          onClick={() => {
            dismissForToday(status)
            setDismissed(true)
          }}
          aria-label="Entendido — ocultar aviso por hoy"
        >
          <X size={14} />
          Entendido
        </button>
      </div>
    </div>
  )
}
