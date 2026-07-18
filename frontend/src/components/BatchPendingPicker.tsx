import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export type BatchPendingOption = {
  id: string
  filename: string
  createdAt: string
}

type ClientForPending = {
  lastDisposition?: string | null
  importBatch?: { id: string } | null
}

export type BatchPendingPickerProps = {
  batches: BatchPendingOption[]
  clients: ClientForPending[]
  value: string
  onChange: (batchId: string) => void
  /** `header` = dark bar on detail view; `filter` = light filter row (grid/list). */
  variant?: 'header' | 'filter'
  id?: string
  className?: string
  label?: string
}

/**
 * Pending = company has no `lastDisposition` on list/summary data.
 * Same spirit as agent “siguiente pendiente” / empty work queue; we use
 * `lastDisposition` (not contact-level agent logs) so counts work from
 * already-loaded `allClients` without extra API/detail cache.
 */
export function isCompanyPendingForBatchPicker(c: ClientForPending): boolean {
  return !c.lastDisposition
}

function batchLabelShort(batch: { filename: string }) {
  return batch.filename.replace(/\.[^.]+$/, '')
}

type BatchStats = {
  id: string
  label: string
  total: number
  pending: number
  done: number
  isNewest: boolean
}

function buildBatchStats(
  batches: BatchPendingOption[],
  clients: ClientForPending[]
): BatchStats[] {
  return batches.map((b, i) => {
    const inBatch = clients.filter((c) => c.importBatch?.id === b.id)
    const pending = inBatch.filter(isCompanyPendingForBatchPicker).length
    const total = inBatch.length
    return {
      id: b.id,
      label: batchLabelShort(b),
      total,
      pending,
      done: Math.max(0, total - pending),
      isNewest: i === 0,
    }
  })
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  return (
    <div
      className="h-1 w-full rounded-full bg-slate-200 overflow-hidden"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${pct}% completado`}
    >
      <div
        className="h-full rounded-full bg-slate-500 transition-[width] duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function metricLabel(pending: number, total: number) {
  if (total <= 0) return '0 pendientes'
  return `${pending} pendientes · ${total} total`
}

export function BatchPendingPicker({
  batches,
  clients,
  value,
  onChange,
  variant = 'filter',
  id,
  className = '',
  label,
}: BatchPendingPickerProps) {
  const [open, setOpen] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const reactId = useId()
  const listboxId = `${reactId}-listbox`

  const stats = useMemo(() => buildBatchStats(batches, clients), [batches, clients])

  const allPending = useMemo(
    () => clients.filter(isCompanyPendingForBatchPicker).length,
    [clients]
  )
  const allTotal = clients.length

  const completedHidden = useMemo(
    () => stats.filter((s) => s.pending === 0 && s.id !== value),
    [stats, value]
  )

  const visibleBatches = useMemo(() => {
    if (showCompleted) return stats
    return stats.filter((s) => s.pending > 0 || s.id === value)
  }, [stats, showCompleted, value])

  /** Rows in listbox order: "all" first, then visible batches */
  const rows = useMemo(
    () => [{ kind: 'all' as const }, ...visibleBatches.map((s) => ({ kind: 'batch' as const, stats: s }))],
    [visibleBatches]
  )

  const selectedLabel = useMemo(() => {
    if (!value) {
      return `Todos los lotes · ${allPending} pend.`
    }
    const s = stats.find((b) => b.id === value)
    if (!s) return 'Lote'
    return `${s.isNewest ? '★ ' : ''}${s.label} · ${s.pending} pend.`
  }, [value, stats, allPending])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const idx = value
      ? Math.max(
          0,
          rows.findIndex((r) => r.kind === 'batch' && r.stats.id === value)
        )
      : 0
    setActiveIdx(idx)
    listRef.current?.focus()
  }, [open, value, rows])

  const selectRow = (idx: number) => {
    const row = rows[idx]
    if (!row) return
    if (row.kind === 'all') onChange('')
    else onChange(row.stats.id)
    setOpen(false)
  }

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (open) return
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
    }
  }

  const handleListKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      selectRow(activeIdx)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveIdx(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActiveIdx(rows.length - 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  const isHeader = variant === 'header'
  const triggerClass = isHeader
    ? 'bg-blue-700 border border-blue-500 text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-300 max-w-[260px] hover:bg-blue-600'
    : 'input text-sm h-9 py-1.5 w-full bg-white'

  if (batches.length === 0) return null

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label && variant === 'filter' && (
        <label htmlFor={id} className="text-xs text-gray-500 font-medium block mb-1">
          {label}
        </label>
      )}
      <button
        type="button"
        id={id}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-label="Seleccionar lote"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
        className={`${triggerClass} flex items-center justify-between gap-2 text-left min-w-0`}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          size={isHeader ? 13 : 15}
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${
            isHeader ? 'text-blue-200' : 'text-gray-500'
          }`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden ${
            isHeader ? 'left-0 min-w-[280px] w-[min(320px,90vw)]' : 'left-0 right-0 min-w-[260px] sm:min-w-[280px]'
          }`}
        >
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            aria-label="Lotes"
            aria-activedescendant={`${reactId}-opt-${activeIdx}`}
            onKeyDown={handleListKeyDown}
            className="max-h-72 overflow-y-auto py-1 outline-none"
          >
            {/* Todos los lotes */}
            <li
              id={`${reactId}-opt-0`}
              role="option"
              aria-selected={!value}
              onMouseEnter={() => setActiveIdx(0)}
              onClick={() => selectRow(0)}
              className={`mx-1 my-0.5 px-2.5 py-2 rounded cursor-pointer border ${
                !value
                  ? 'border-blue-300 bg-blue-50'
                  : activeIdx === 0
                    ? 'border-slate-200 bg-slate-50'
                    : 'border-transparent hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-sm font-medium text-gray-900 truncate">Todos los lotes</span>
                <span className="text-xs tabular-nums text-slate-600 shrink-0">
                  {metricLabel(allPending, allTotal)}
                </span>
              </div>
              <ProgressBar done={Math.max(0, allTotal - allPending)} total={allTotal} />
            </li>

            {visibleBatches.map((s, i) => {
              const rowIdx = i + 1
              const selected = value === s.id
              const active = activeIdx === rowIdx
              return (
                <li
                  key={s.id}
                  id={`${reactId}-opt-${rowIdx}`}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActiveIdx(rowIdx)}
                  onClick={() => selectRow(rowIdx)}
                  className={`mx-1 my-0.5 px-2.5 py-2 rounded cursor-pointer border ${
                    selected
                      ? 'border-blue-300 bg-blue-50'
                      : active
                        ? 'border-slate-200 bg-slate-50'
                        : 'border-transparent hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {s.isNewest ? '★ ' : ''}
                      {s.label}
                    </span>
                    <span
                      className={`text-xs tabular-nums shrink-0 ${
                        s.pending > 0 ? 'text-slate-700 font-medium' : 'text-slate-400'
                      }`}
                    >
                      {metricLabel(s.pending, s.total)}
                    </span>
                  </div>
                  <ProgressBar done={s.done} total={s.total} />
                </li>
              )
            })}
          </ul>

          {completedHidden.length > 0 && (
            <div className="border-t border-gray-100 px-2.5 py-1.5">
              <button
                type="button"
                className="w-full text-left text-xs text-blue-600 hover:text-blue-800 hover:underline py-1"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowCompleted((v) => !v)
                }}
              >
                {showCompleted
                  ? 'Ocultar lotes completados'
                  : `Ver lotes completados (${completedHidden.length})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
