import { Info } from 'lucide-react'
import { operatorLabelEs, type ImportOperator } from '../lib/operator'

type Props = {
  operator: ImportOperator
  compact?: boolean
}

export default function OtherOperatorRucBanner({ operator, compact = false }: Props) {
  const label = operatorLabelEs(operator)
  const message = (
    <p className={compact ? 'text-[11px] text-slate-700' : 'text-xs text-slate-700'}>
      Este RUC también figura en lotes <span className="font-semibold">{label}</span>.
      Las fichas no se unen: trabaja solo la de este operador.
    </p>
  )

  if (compact) {
    return (
      <div className="relative group/oop shrink-0">
        <span
          role="note"
          title={`Este RUC también figura en lotes ${label}. Las fichas no se unen: trabaja solo la de este operador.`}
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-700"
        >
          <Info size={12} className="text-slate-500 shrink-0" />
          <span className="whitespace-nowrap">También {label}</span>
        </span>
        <div
          role="tooltip"
          className="absolute z-50 top-full right-0 mt-1.5 w-64 max-w-[min(16rem,calc(100vw-1.5rem))] rounded-lg border border-gray-200 bg-white p-2.5 shadow-lg text-left hidden group-hover/oop:block group-focus-within/oop:block"
        >
          {message}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <Info size={15} className="text-slate-500 shrink-0 mt-0.5" />
      {message}
    </div>
  )
}
