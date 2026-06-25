import { format, isPast, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarClock } from 'lucide-react'

export type CallbackScheduleInfo = {
  scheduledAt: string
  notes?: string
}

export function CallbackScheduleBadge({ callback }: { callback: CallbackScheduleInfo }) {
  const cbDate = new Date(callback.scheduledAt)
  const cbStyle = isPast(cbDate)
    ? 'text-red-600 bg-red-50 border border-red-200'
    : isToday(cbDate)
      ? 'text-amber-700 bg-amber-50 border border-amber-200'
      : 'text-blue-700 bg-blue-50 border border-blue-200'

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${cbStyle}`}
      title={callback.notes ?? ''}
    >
      <CalendarClock size={11} />
      {format(cbDate, 'dd/MM HH:mm', { locale: es })}
    </span>
  )
}
