import { useCallback, useEffect, useId, useRef, useState } from 'react'

type HelpTooltipProps = {
  text: string
  /** Extra class on the trigger button */
  className?: string
}

const SHOW_DELAY_MS = 300

/**
 * Floating help tooltip: hover/focus with delay, click toggle for touch.
 * White card + soft shadow; short Spanish copy expected from caller.
 */
export default function HelpTooltip({ text, className = '' }: HelpTooltipProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipId = useId()

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current)
      showTimerRef.current = null
    }
  }, [])

  const scheduleShow = useCallback(() => {
    clearShowTimer()
    showTimerRef.current = setTimeout(() => setOpen(true), SHOW_DELAY_MS)
  }, [clearShowTimer])

  const hide = useCallback(() => {
    clearShowTimer()
    setOpen(false)
  }, [clearShowTimer])

  useEffect(() => () => clearShowTimer(), [clearShowTimer])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) hide()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, hide])

  return (
    <span
      ref={rootRef}
      className={`relative inline-flex items-center shrink-0 ${className}`}
      onMouseEnter={scheduleShow}
      onMouseLeave={hide}
    >
      <button
        type="button"
        aria-label="Más información"
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          clearShowTimer()
          setOpen((v) => !v)
        }}
        onFocus={scheduleShow}
        onBlur={(e) => {
          if (!rootRef.current?.contains(e.relatedTarget as Node)) hide()
        }}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 text-[10px] font-semibold leading-none text-gray-400 hover:border-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 bg-white/80"
      >
        ?
      </button>
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 max-w-[min(13rem,calc(100vw-2rem))] rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs leading-snug text-gray-600 shadow-lg pointer-events-none"
        >
          {text}
        </span>
      ) : null}
    </span>
  )
}
