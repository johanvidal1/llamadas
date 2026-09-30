import { Info } from 'lucide-react'
import { operatorLabelEs, type ImportOperator } from '../lib/operator'

type Props = {
  operator: ImportOperator
}

export default function OtherOperatorRucBanner({ operator }: Props) {
  const label = operatorLabelEs(operator)
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <Info size={15} className="text-slate-500 shrink-0 mt-0.5" />
      <p className="text-xs text-slate-700">
        Este RUC también figura en lotes <span className="font-semibold">{label}</span>.
        Las fichas no se unen: trabaja solo la de este operador.
      </p>
    </div>
  )
}
