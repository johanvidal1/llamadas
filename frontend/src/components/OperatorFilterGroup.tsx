import type { ImportOperator } from '../lib/operator'

export type OperatorFilterValue = ImportOperator | ''

const OPTIONS: { id: OperatorFilterValue; label: string }[] = [
  { id: '', label: 'Todos' },
  { id: 'CLARO', label: 'Claro' },
  { id: 'MOVISTAR', label: 'Movistar' },
]

export default function OperatorFilterGroup({
  value,
  onChange,
  className = '',
}: {
  value: OperatorFilterValue
  onChange: (value: OperatorFilterValue) => void
  className?: string
}) {
  return (
    <div
      className={`flex items-center gap-1 rounded-lg border border-gray-200 p-0.5 bg-gray-50 shrink-0 ${className}`}
      role="group"
      aria-label="Filtrar por operador"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.id || 'all'}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            value === opt.id
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
