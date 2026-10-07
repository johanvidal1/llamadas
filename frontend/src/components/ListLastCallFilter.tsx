import type { ListLastCallPreset } from '../lib/listLastCallRange'

const SEGMENT =
  'h-9 px-2.5 rounded-lg text-xs font-medium transition-colors border shrink-0'

function segmentClass(active: boolean): string {
  return `${SEGMENT} ${
    active
      ? 'bg-gray-100 text-gray-700 border-gray-300 ring-2 ring-offset-1 ring-green-500'
      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
  }`
}

export type ListLastCallFilterProps = {
  preset: ListLastCallPreset | null
  from: string
  to: string
  onPreset: (preset: ListLastCallPreset) => void
  onRangeChange: (from: string, to: string) => void
}

export function ListLastCallFilter({
  preset,
  from,
  to,
  onPreset,
  onRangeChange,
}: ListLastCallFilterProps) {
  return (
    <div className="flex flex-col gap-1 shrink-0 w-full sm:w-auto">
      <label className="text-xs text-gray-500 font-medium" htmlFor="list-last-call-hoy">
        Última llamada
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          id="list-last-call-hoy"
          aria-pressed={preset === 'today'}
          onClick={() => onPreset('today')}
          className={segmentClass(preset === 'today')}
        >
          Hoy
        </button>
        <button
          type="button"
          aria-pressed={preset === 'last7'}
          onClick={() => onPreset('last7')}
          className={segmentClass(preset === 'last7')}
        >
          Últimos 7 días
        </button>
        <button
          type="button"
          aria-pressed={preset === 'range'}
          onClick={() => onPreset('range')}
          className={segmentClass(preset === 'range')}
        >
          Rango
        </button>
        {preset === 'range' && (
          <>
            <input
              type="date"
              aria-label="Desde"
              value={from}
              onChange={(e) => onRangeChange(e.target.value, to)}
              className="input h-9 py-1 text-sm w-[10.5rem]"
            />
            <span className="text-xs text-gray-400" aria-hidden>
              –
            </span>
            <input
              type="date"
              aria-label="Hasta"
              value={to}
              onChange={(e) => onRangeChange(from, e.target.value)}
              className="input h-9 py-1 text-sm w-[10.5rem]"
            />
          </>
        )}
      </div>
      <p className="text-[10px] text-gray-400 leading-snug max-w-xs">
        Filtra por la fecha del último registro, no cambia el orden de la cola.
      </p>
    </div>
  )
}
