import {
  operatorChipClassName,
  operatorLabelEs,
  type ImportOperator,
} from '../lib/operator'

export default function OperatorChip({
  operator,
  className = '',
}: {
  operator: ImportOperator
  className?: string
}) {
  return (
    <span
      className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${operatorChipClassName(operator)} ${className}`}
    >
      {operatorLabelEs(operator)}
    </span>
  )
}
