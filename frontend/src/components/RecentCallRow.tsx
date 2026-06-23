import { format } from 'date-fns'
import { DispositionBadge } from './StatusBadge'

export type RecentCallRowData = {
  id: string
  disposition: string
  calledAt: string
  company: { id: string; ruc: string; razonSocial?: string | null }
  contact?: { id?: string; nombre: string; tipoContacto?: string | null } | null
  agent?: { name: string }
}

export function RecentCallRow({
  call,
  showAgent = false,
  title,
  onClick,
}: {
  call: RecentCallRowData
  showAgent?: boolean
  title?: string
  onClick?: () => void
}) {
  const rowClass =
    'flex items-center justify-between py-2 border-b border-gray-50 last:border-0' +
    (onClick ? ' cursor-pointer hover:bg-gray-50 rounded-md px-1 -mx-1 transition-colors' : '')

  const content = (
    <>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {call.company.razonSocial || call.company.ruc}
        </p>
        <p className="text-xs text-gray-400 truncate">
          {call.contact ? call.contact.nombre : call.company.ruc}
          {showAgent && call.agent ? ` · ${call.agent.name}` : ''}
        </p>
      </div>
      <div className="text-right shrink-0 ml-3">
        <DispositionBadge disposition={call.disposition} />
        <p className="text-xs text-gray-400 mt-1">{format(new Date(call.calledAt), 'dd/MM HH:mm')}</p>
      </div>
    </>
  )

  if (onClick) {
    return (
      <button type="button" title={title} onClick={onClick} className={`w-full text-left ${rowClass}`}>
        {content}
      </button>
    )
  }

  return <div className={rowClass}>{content}</div>
}
