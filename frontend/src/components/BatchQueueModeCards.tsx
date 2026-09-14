import type { BatchQueueMode } from '../lib/batchQueuePolicy'

export const BATCH_QUEUE_MODE_CARDS: {
  value: BatchQueueMode
  title: string
  description: string
  chip: string
  badge?: string
}[] = [
  {
    value: 'FIFO',
    title: 'Más antiguo primero',
    badge: 'Defecto',
    description: 'Termina el lote que ya tiene encima antes de abrir el nuevo.',
    chip: 'Antiguo primero',
  },
  {
    value: 'LIFO',
    title: 'Más reciente primero',
    description: 'El último lote asignado pasa al frente cuando acabe el actual.',
    chip: 'Reciente primero',
  },
  {
    value: 'ALL',
    title: 'Todos los lotes',
    description: 'Ve todo mezclado; él elige el lote.',
    chip: 'Todos',
  },
]

export function batchQueueModeChip(mode: BatchQueueMode | string | null | undefined): string {
  const card = BATCH_QUEUE_MODE_CARDS.find((c) => c.value === mode)
  return card?.chip ?? 'Antiguo primero'
}

export function batchQueueModeChipClass(mode: BatchQueueMode | string | null | undefined): string {
  if (mode === 'LIFO') return 'bg-indigo-100 text-indigo-800'
  if (mode === 'ALL') return 'bg-slate-100 text-slate-700'
  return 'bg-blue-100 text-blue-800'
}

interface Props {
  value: BatchQueueMode
  onChange: (mode: BatchQueueMode) => void
  disabled?: boolean
  name?: string
}

export default function BatchQueueModeCards({ value, onChange, disabled, name = 'batchQueueMode' }: Props) {
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="text-sm font-medium text-gray-700 mb-2">Cola de lotes</legend>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {BATCH_QUEUE_MODE_CARDS.map((card) => {
          const selected = value === card.value
          return (
            <label
              key={card.value}
              className={`relative flex flex-col gap-1 rounded-xl border-2 p-3.5 cursor-pointer transition-colors ${
                selected
                  ? 'border-blue-500 bg-blue-50/70 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-slate-50'
              } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <input
                type="radio"
                name={name}
                value={card.value}
                checked={selected}
                onChange={() => onChange(card.value)}
                className="sr-only"
              />
              <span className="flex items-center gap-2 min-h-[1.25rem]">
                <span className="text-sm font-semibold text-gray-900 leading-tight">{card.title}</span>
                {card.badge && (
                  <span className="badge bg-blue-600 text-white shrink-0">{card.badge}</span>
                )}
              </span>
              <span className="text-xs text-gray-500 leading-snug">{card.description}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
