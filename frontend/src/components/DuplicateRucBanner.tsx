import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ArrowRight } from 'lucide-react'

const POPOVER_WIDTH = 288
const VIEWPORT_PADDING = 16

type HorizontalAlign = 'start' | 'end'

export type DuplicateRucSibling = {
  id: string
  razonSocial?: string
  importBatch?: { id: string; filename: string; createdAt: string }
}

type DuplicateRucBannerProps = {
  ruc: string
  siblings: DuplicateRucSibling[]
  currentCompanyId: string
  onSwitchBatch: (batchId: string) => void
}

function batchLabelShort(batch: { filename: string }) {
  return batch.filename.replace(/\.[^.]+$/, '')
}

function truncate(text: string | undefined, max = 42) {
  if (!text) return 'Sin razón social'
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function computeHorizontalAlign(rect: DOMRect): HorizontalAlign {
  if (rect.left + POPOVER_WIDTH > window.innerWidth - VIEWPORT_PADDING) {
    return 'end'
  }
  if (rect.right - POPOVER_WIDTH < VIEWPORT_PADDING) {
    return 'start'
  }
  return 'start'
}

export function DuplicateRucBanner({
  ruc,
  siblings,
  currentCompanyId,
  onSwitchBatch,
}: DuplicateRucBannerProps) {
  const [open, setOpen] = useState(false)
  const [horizontalAlign, setHorizontalAlign] = useState<HorizontalAlign>('start')
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  const currentRecord = siblings.find((s) => s.id === currentCompanyId)
  const otherRecords = siblings.filter((s) => s.id !== currentCompanyId)

  const othersByBatch = useMemo(() => {
    const groups = new Map<string, DuplicateRucSibling[]>()
    for (const record of otherRecords) {
      const batchId = record.importBatch?.id ?? '__none__'
      const list = groups.get(batchId) ?? []
      list.push(record)
      groups.set(batchId, list)
    }
    return Array.from(groups.entries()).map(([batchId, records]) => ({
      batchId,
      batch: records[0]?.importBatch,
      records,
    }))
  }, [otherRecords])

  const updateHorizontalAlign = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    setHorizontalAlign(computeHorizontalAlign(trigger.getBoundingClientRect()))
  }, [])

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
    updateHorizontalAlign()
    window.addEventListener('resize', updateHorizontalAlign)
    return () => window.removeEventListener('resize', updateHorizontalAlign)
  }, [open, updateHorizontalAlign])

  if (siblings.length <= 1) return null

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.matchMedia('(max-width: 767px)').matches) {
      setOpen((v) => !v)
    }
  }

  const horizontalClasses =
    horizontalAlign === 'end' ? 'right-0 left-auto' : 'left-0 right-auto'

  const currentBatchId = currentRecord?.importBatch?.id

  return (
    <div
      ref={rootRef}
      className="relative mb-3 group/dup"
      onMouseEnter={updateHorizontalAlign}
    >
      <div
        ref={triggerRef}
        role="button"
        tabIndex={0}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleToggle(e as unknown as React.MouseEvent)
          }
        }}
        aria-expanded={open}
        aria-label={`RUC duplicado: ${siblings.length} registros en tus asignaciones`}
        className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 cursor-default max-md:cursor-pointer"
      >
        <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          RUC duplicado — apuntá para ver en qué lotes aparece
        </p>
      </div>

      <div
        role="tooltip"
        className={`absolute z-50 top-full ${horizontalClasses} mt-1.5 w-72 max-w-[min(18rem,calc(100vw-1.5rem))] rounded-lg border border-gray-200 bg-white p-3.5 shadow-lg text-left pointer-events-none max-md:bottom-full max-md:top-auto max-md:mb-1.5 max-md:mt-0 ${
          open ? 'block' : 'hidden'
        } max-md:pointer-events-auto md:group-hover/dup:block md:group-focus-within/dup:block`}
      >
        <p className="text-xs font-semibold text-gray-900">RUC duplicado en tus asignaciones</p>
        <p className="text-[11px] text-gray-500 mt-0.5 font-mono">{ruc}</p>
        <p className="text-[11px] text-amber-700 mt-1">
          {siblings.length} registros con este RUC
        </p>

        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            Lote actual
          </p>
          <div className="rounded-md bg-gray-50 border border-gray-100 px-2.5 py-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-medium text-gray-800 truncate">
                {currentRecord?.importBatch
                  ? batchLabelShort(currentRecord.importBatch)
                  : 'Sin lote'}
              </span>
              <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                Actual
              </span>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5 truncate">
              {truncate(currentRecord?.razonSocial)}
            </p>
          </div>
        </div>

        {othersByBatch.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              También en
            </p>
            <ul className="space-y-2">
              {othersByBatch.map(({ batchId, batch, records }) => (
                <li key={batchId}>
                  {records.map((record) => (
                    <div
                      key={record.id}
                      className="rounded-md border border-gray-100 px-2.5 py-2 not-first:mt-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-800 truncate">
                            {batch ? batchLabelShort(batch) : 'Sin lote'}
                          </p>
                          <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                            {truncate(record.razonSocial)}
                          </p>
                        </div>
                        {batch?.id && batch.id !== currentBatchId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onSwitchBatch(batch.id)
                              setOpen(false)
                            }}
                            className="shrink-0 inline-flex items-center gap-0.5 text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline pointer-events-auto"
                          >
                            Ir al lote
                            <ArrowRight size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
