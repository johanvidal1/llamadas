import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  SALES_FUNNEL_STAGES,
  DISPOSITION_COLORS,
  OPERATIONAL_SELECT_OPTIONS,
  getDispositionLabel,
  getFunnelChipLabel,
  isAgentSelectableDisposition,
  isFunnelDisposition,
  isKnownResponseDisposition,
  type ResponseOption,
} from '../config/responseOptions'

/** Radix Select rejects an empty item value. Maps to the native select's "". */
const OPERATIONAL_NONE = '__operational_none__'

interface DispositionSelectorProps {
  disposition: string
  onChange: (disposition: string) => void
  error?: boolean
  /** Visual only. Classic is the default and must not pick up Nuevo styles. */
  appearance?: 'classic' | 'new'
  /** Mis clientes only. Opens the proposal panel; does not change the disposition. */
  onOpenProposal?: () => void
}

function ProposalButton({
  appearance,
  onOpen,
}: {
  appearance: 'classic' | 'new'
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={
        appearance === 'new'
          ? 'shrink-0 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90'
          : 'shrink-0 rounded-md border border-blue-600 bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700'
      }
    >
      Generar propuesta
    </button>
  )
}

export default function DispositionSelector({
  disposition,
  onChange,
  error = false,
  appearance = 'classic',
  onOpenProposal,
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

  const selectedFunnel = isFunnelDisposition(disposition) ? disposition : ''
  const operationalValue =
    isFunnelDisposition(disposition) || !isAgentSelectableDisposition(disposition) ? '' : disposition

  const handleFunnelClick = (code: string) => {
    if (code === 'VENTA_CERRADA') {
      const confirmed = window.confirm(
        '¿Confirmás VENTA CERRADA? El lead se marcará como convertido (100%).'
      )
      if (!confirmed) return
    }
    onChange(code)
  }

  if (appearance === 'new') {
    return (
      <div className="space-y-3" aria-invalid={error || undefined}>
        <div className="flex flex-col gap-3">
          <div className="flex max-w-sm flex-col gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Operacional (0%)</span>
            <Select
              value={operationalValue || OPERATIONAL_NONE}
              onValueChange={(next) => onChange(next === OPERATIONAL_NONE ? '' : next)}
            >
              <SelectTrigger
                className={cn(
                  'bg-background transition-colors duration-200',
                  error && 'border-destructive ring-1 ring-destructive'
                )}
                aria-invalid={error || undefined}
              >
                <SelectValue placeholder="— Seleccionar —" />
              </SelectTrigger>
              <SelectContent>
                {operationalSelectOptions.map((o) => (
                  <SelectItem key={o.value || 'none'} value={o.value || OPERATIONAL_NONE}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error && <span className="text-xs text-destructive">Seleccioná una disposición</span>}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted-foreground">Embudo comercial</span>
              {onOpenProposal ? (
                <ProposalButton appearance="new" onOpen={onOpenProposal} />
              ) : null}
            </div>
            <FunnelStepper
              stages={SALES_FUNNEL_STAGES}
              selected={selectedFunnel}
              onPick={handleFunnelClick}
            />
          </div>
        </div>
      </div>
    )
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
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Embudo comercial
            </span>
            {onOpenProposal ? (
              <ProposalButton appearance="classic" onOpen={onOpenProposal} />
            ) : null}
          </div>
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

function FunnelStepper({
  stages,
  selected,
  onPick,
}: {
  stages: ResponseOption[]
  selected: string
  onPick: (code: string) => void
}) {
  return (
    <div className="flex w-full min-w-0 flex-wrap gap-1.5" role="group" aria-label="Embudo comercial">
      {stages.map((stage) => {
        const isActive = selected === stage.code
        return (
          <button
            key={stage.code}
            type="button"
            title={stage.label}
            aria-pressed={isActive}
            onClick={() => onPick(stage.code)}
            className={cn(
              'flex min-w-[6.75rem] max-w-[calc(50%-0.375rem)] flex-1 basis-[6.75rem] flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-1.5 text-center transition-colors duration-200',
              isActive
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-transparent bg-muted/60 text-muted-foreground hover:bg-muted'
            )}
          >
            <span className="text-[11px] font-medium leading-tight text-balance">
              {getFunnelChipLabel(stage)}
            </span>
            <span
              className={cn(
                'text-[10px] font-semibold tabular-nums',
                isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'
              )}
            >
              {stage.aclaracion}
            </span>
          </button>
        )
      })}
    </div>
  )
}
