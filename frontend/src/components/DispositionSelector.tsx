import { useMemo } from 'react'
import {
  SALES_FUNNEL_STAGES,
  DISPOSITION_COLORS,
  OPERATIONAL_SELECT_OPTIONS,
  getDispositionLabel,
  getFunnelChipLabel,
  isFunnelDisposition,
  isKnownResponseDisposition,
} from '../config/responseOptions'

interface DispositionSelectorProps {
  disposition: string
  onChange: (disposition: string) => void
  error?: boolean
}

export default function DispositionSelector({
  disposition,
  onChange,
  error = false,
}: DispositionSelectorProps) {
  const operationalSelectOptions = useMemo(() => {
    if (disposition && !isKnownResponseDisposition(disposition)) {
      return [
        ...OPERATIONAL_SELECT_OPTIONS,
        { value: disposition, label: `${getDispositionLabel(disposition)} (histórico)` },
      ]
    }
    return OPERATIONAL_SELECT_OPTIONS
  }, [disposition])

  const operationalValue = isFunnelDisposition(disposition) ? '' : disposition
  const selectedFunnel = isFunnelDisposition(disposition) ? disposition : ''

  const handleFunnelClick = (code: string) => {
    if (code === 'VENTA_CERRADA') {
      const confirmed = window.confirm(
        '¿Confirmás VENTA CERRADA? El lead se marcará como convertido (100%).'
      )
      if (!confirmed) return
    }
    onChange(code)
  }

  const selectBorder = error
    ? 'border-red-500 ring-1 ring-red-500'
    : 'border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'

  return (
    <div className="space-y-3" aria-invalid={error || undefined}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-1 sm:w-52 shrink-0">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Operacional (0%)
          </span>
          <select
            className={`w-full border rounded px-3 py-2 text-sm bg-white text-gray-900 outline-none ${selectBorder}`}
            value={operationalValue}
            onChange={(e) => onChange(e.target.value)}
          >
            {operationalSelectOptions.map((o) => (
              <option key={o.value || 'none'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {error && (
            <span className="text-xs text-red-600">Seleccioná una disposición</span>
          )}
        </div>

        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Embudo comercial
          </span>
          <div className="flex flex-wrap gap-2">
            {SALES_FUNNEL_STAGES.map((stage) => {
              const isActive = selectedFunnel === stage.code
              const dispClasses = DISPOSITION_COLORS[stage.code]
              return (
                <button
                  key={stage.code}
                  type="button"
                  title={stage.label}
                  onClick={() => handleFunnelClick(stage.code)}
                  className={`flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-[5.5rem] text-center rounded-lg text-xs font-medium transition-colors border shrink-0 ${
                    isActive
                      ? dispClasses
                        ? `${dispClasses.split(' border-l-')[0]} border-current`
                        : 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-xs leading-tight max-w-[8rem] text-balance">
                    {getFunnelChipLabel(stage)}
                  </span>
                  <span className="text-[10px] font-semibold opacity-80">{stage.aclaracion}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
