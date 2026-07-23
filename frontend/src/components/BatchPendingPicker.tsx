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

/**
 * Queue urgency from pending ratio (pending/total).
 * Bar width = % done; bar/metric hue = remaining work (continuous HSL).
 * - ~100% pending: dark green → mid: pale green → few left: mid→intense red
 * - pending === 0: emerald “done”
 */
export type QueueTone = {
  /** CSS color for bar fill */
  fill: string
  /** CSS color for track */
  track: string
  /** CSS color for metric text */
  metric: string
}

type Hsl = { h: number; s: number; l: number }

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function clamp01(t: number) {
  return Math.max(0, Math.min(1, t))
}

function hsl({ h, s, l }: Hsl, alpha?: number) {
  if (alpha != null) return `hsl(${h} ${s}% ${l}% / ${alpha})`
  return `hsl(${h} ${s}% ${l}%)`
}

/**
 * Continuous green→red narrative by how much of the queue remains.
 * progress 0 = all pending (dark green); 1 = almost done (intense red).
 */
export function pendingQueueHsl(pending: number, total: number): Hsl {
  if (pending === 0) {
    return { h: 160, s: 84, l: 39 }
  }
  const ratio = total > 0 ? pending / total : 1
  const progress = clamp01(1 - ratio)

  if (progress <= 0.5) {
    // Dark green → light/pale green
    const u = progress / 0.5
    return {
      h: lerp(148, 132, u),
      s: lerp(72, 38, u),
      l: lerp(26, 56, u),
    }
  }

  // Pale green → mid-red → intense red (continuous hue via yellow-orange)
  const u = (progress - 0.5) / 0.5
  return {
    h: lerp(132, 2, u),
    s: lerp(38, 84, u),
    l: lerp(56, 44, u),
  }
}

/** Few left in a meaningful lote — soft pulse / one-shot shake. */
export function isLowPendingAlert(pending: number, total: number): boolean {
  return pending > 0 && pending <= 5 && total >= 20
}

/** Light surfaces (filter dropdown / list). */
export function queueTone(pending: number, total: number): QueueTone {
  const c = pendingQueueHsl(pending, total)
  if (pending === 0) {
    return {
      fill: hsl({ h: 160, s: 84, l: 39 }),
      track: hsl({ h: 152, s: 76, l: 94 }),
      metric: hsl({ h: 160, s: 84, l: 30 }),
    }
  }
  return {
    fill: hsl(c),
    track: hsl({ h: c.h, s: Math.min(c.s, 36), l: 94 }),
    metric: hsl({
      h: c.h,
      s: Math.min(90, c.s + 8),
      l: Math.max(22, Math.min(40, c.l - 16)),
    }),
  }
}

/** Dark blue detail header — same narrative, brighter for bg-blue-800. */
export function queueToneHeader(pending: number, total: number): QueueTone {
  const c = pendingQueueHsl(pending, total)
  if (pending === 0) {
    return {
      fill: hsl({ h: 160, s: 70, l: 55 }),
      track: 'rgb(255 255 255 / 0.2)',
      metric: hsl({ h: 152, s: 70, l: 78 }),
    }
  }
  return {
    fill: hsl({
      h: c.h,
      s: Math.min(88, c.s + 6),
      l: Math.min(68, Math.max(48, c.l + 14)),
    }),
    track: 'rgb(255 255 255 / 0.2)',
    metric: hsl({
      h: c.h,
      s: Math.min(72, c.s + 4),
      l: Math.min(90, Math.max(74, c.l + 30)),
    }),
  }
}

/** One-shot shake only when crossing into ≤5 (not on first mount / remount). */
function useLowPendingShake(pending: number, total: number) {
  const alert = isLowPendingAlert(pending, total)
  const prevAlert = useRef<boolean | null>(null)
  const [shake, setShake] = useState(false)

  useEffect(() => {
    const crossedIn = alert && prevAlert.current === false
    prevAlert.current = alert
    if (!crossedIn) return
    setShake(true)
    const t = window.setTimeout(() => setShake(false), 480)
    return () => window.clearTimeout(t)
  }, [alert])

  return { alert, shake }
}

export type BatchPendingCounts = {
  pending: number
  total: number
  done: number
}

/** Pending counts for selected batch (`''` = all clients). */
export function getBatchPendingCounts(
  clients: ClientForPending[],
  batchId: string
): BatchPendingCounts {
  const scoped = batchId
    ? clients.filter((c) => c.importBatch?.id === batchId)
    : clients
  const pending = scoped.filter(isCompanyPendingForBatchPicker).length
  const total = scoped.length
  return { pending, total, done: Math.max(0, total - pending) }
}

function ProgressBar({
  done,
  total,
  pending,
}: {
  done: number
  total: number
  pending: number
}) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  const tone = queueTone(pending, total)
  const { alert, shake } = useLowPendingShake(pending, total)
  return (
    <div
      className={`h-1 w-full rounded-full overflow-hidden transition-colors duration-300 ${
        alert ? 'motion-safe:animate-queue-soft-pulse' : ''
      } ${shake ? 'motion-safe:animate-queue-nudge-shake' : ''}`}
      style={{ backgroundColor: tone.track }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${pct}% completado`}
    >
      <div
        className="h-full rounded-full transition-[width,background-color] duration-300 ease-out"
        style={{ width: `${pct}%`, backgroundColor: tone.fill }}
      />
    </div>
  )
}

function metricLabel(pending: number, total: number) {
  if (total <= 0) return '0 pendientes'
  return `${pending} pendientes · ${total} total`
}

/**
 * Compact lote progress meter for the Detalle header (replaces nav arrows slot).
 * Bar width = % done; label shows remaining pendientes.
 */
export function BatchPendingThermometer({
  pending,
  total,
  done,
  className = '',
}: BatchPendingCounts & { className?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  const tone = queueToneHeader(pending, total)
  const { alert, shake } = useLowPendingShake(pending, total)
  const label =
    total <= 0 ? 'Sin empresas' : pending === 0 ? 'Lote completo' : `${pending} pend.`
  const alertMotion = alert ? 'motion-safe:animate-queue-soft-pulse' : ''
  const shakeMotion = shake ? 'motion-safe:animate-queue-nudge-shake' : ''

  return (
    <div
      className={`flex items-center gap-2 min-w-[7.5rem] max-w-[11rem] ${shakeMotion} ${className}`}
      title={
        total > 0
          ? `${done} de ${total} registradas (${pct}%) · ${pending} pendientes`
          : 'Sin empresas en el lote'
      }
    >
      <div className="flex-1 min-w-[3.5rem]">
        <div
          className={`h-1.5 w-full rounded-full overflow-hidden transition-colors duration-300 ${alertMotion}`}
          style={{ backgroundColor: tone.track }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${pct}% del lote completado`}
        >
          <div
            className="h-full rounded-full transition-[width,background-color] duration-300 ease-out"
            style={{ width: `${pct}%`, backgroundColor: tone.fill }}
          />
        </div>
      </div>
      <span
        className={`text-xs font-semibold tabular-nums whitespace-nowrap shrink-0 transition-colors duration-300 ${alertMotion}`}
        style={{ color: tone.metric }}
      >
        {label}
      </span>
    </div>
  )
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

  const selectedStats = useMemo(() => {
    if (!value) {
      return { pending: allPending, total: allTotal, done: Math.max(0, allTotal - allPending) }
    }
    const s = stats.find((b) => b.id === value)
    if (!s) return { pending: 0, total: 0, done: 0 }
    return { pending: s.pending, total: s.total, done: s.done }
  }, [value, stats, allPending, allTotal])

  const selectedTone = useMemo(
    () => queueTone(selectedStats.pending, selectedStats.total),
    [selectedStats]
  )

  const allTone = useMemo(() => queueTone(allPending, allTotal), [allPending, allTotal])

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

  const selectedDonePct =
    selectedStats.total > 0
      ? Math.min(100, Math.round((selectedStats.done / selectedStats.total) * 100))
      : 0

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
        <span className="truncate min-w-0 flex-1">{selectedLabel}</span>
        {!isHeader && selectedStats.total > 0 && (
          <span
            className={`h-1 w-8 shrink-0 rounded-full overflow-hidden transition-colors duration-300 ${
              isLowPendingAlert(selectedStats.pending, selectedStats.total)
                ? 'motion-safe:animate-queue-soft-pulse'
                : ''
            }`}
            style={{ backgroundColor: selectedTone.track }}
            aria-hidden
          >
            <span
              className="block h-full rounded-full transition-[width,background-color] duration-300 ease-out"
              style={{ width: `${selectedDonePct}%`, backgroundColor: selectedTone.fill }}
            />
          </span>
        )}
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
                  ? 'border-blue-400 bg-blue-50/50'
                  : activeIdx === 0
                    ? 'border-slate-200 bg-slate-50'
                    : 'border-transparent hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-sm font-medium text-gray-900 truncate">Todos los lotes</span>
                <span
                  className={`text-xs tabular-nums shrink-0 font-medium transition-colors duration-300 ${
                    isLowPendingAlert(allPending, allTotal)
                      ? 'motion-safe:animate-queue-soft-pulse'
                      : ''
                  }`}
                  style={{ color: allTone.metric }}
                >
                  {metricLabel(allPending, allTotal)}
                </span>
              </div>
              <ProgressBar
                done={Math.max(0, allTotal - allPending)}
                total={allTotal}
                pending={allPending}
              />
            </li>

            {visibleBatches.map((s, i) => {
              const rowIdx = i + 1
              const selected = value === s.id
              const active = activeIdx === rowIdx
              const tone = queueTone(s.pending, s.total)
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
                      ? 'border-blue-400 bg-blue-50/50'
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
                      className={`text-xs tabular-nums shrink-0 font-medium transition-colors duration-300 ${
                        isLowPendingAlert(s.pending, s.total)
                          ? 'motion-safe:animate-queue-soft-pulse'
                          : ''
                      }`}
                      style={{ color: tone.metric }}
                    >
                      {metricLabel(s.pending, s.total)}
                    </span>
                  </div>
                  <ProgressBar done={s.done} total={s.total} pending={s.pending} />
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
