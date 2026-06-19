import { useCallback, useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import {
  COMPANY_STATUS_AGGREGATE_NOTE,
  STATUS_HELP,
  type StatusHelpKey,
} from '../config/statusHelp'

const TOOLTIP_WIDTH = 224
const VIEWPORT_PADDING = 16

type HorizontalAlign = 'start' | 'end'

type StatusHelpPopoverProps = {
  helpKey: StatusHelpKey
  companyLevel?: boolean
}

function computeHorizontalAlign(rect: DOMRect): HorizontalAlign {
  if (rect.left + TOOLTIP_WIDTH > window.innerWidth - VIEWPORT_PADDING) {
    return 'end'
  }
  if (rect.right - TOOLTIP_WIDTH < VIEWPORT_PADDING) {
    return 'start'
  }
  return 'start'
}

export function StatusHelpPopover({ helpKey, companyLevel = false }: StatusHelpPopoverProps) {
  const [open, setOpen] = useState(false)
  const [horizontalAlign, setHorizontalAlign] = useState<HorizontalAlign>('start')
  const rootRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const help = STATUS_HELP[helpKey]

  const updateHorizontalAlign = useCallback(() => {
    const button = buttonRef.current
    if (!button) return
    setHorizontalAlign(computeHorizontalAlign(button.getBoundingClientRect()))
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

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.matchMedia('(max-width: 767px)').matches) {
      setOpen((v) => !v)
    }
  }

  const horizontalClasses =
    horizontalAlign === 'end' ? 'right-0 left-auto' : 'left-0 right-auto'

  return (
    <span
      ref={rootRef}
      className="relative inline-flex items-center group/help shrink-0"
      onMouseEnter={updateHorizontalAlign}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        aria-label={`Ayuda: ${help.title}`}
        aria-expanded={open}
        className="p-0.5 rounded text-gray-400 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        <Info size={13} strokeWidth={2.25} />
      </button>

      <div
        role="tooltip"
        className={`absolute z-50 top-full ${horizontalClasses} mt-1.5 w-56 max-w-[min(14rem,calc(100vw-1.5rem))] rounded-lg border border-gray-200 bg-white p-3 shadow-lg text-left pointer-events-none max-md:bottom-full max-md:top-auto max-md:mb-1.5 max-md:mt-0 ${
          open ? 'block' : 'hidden'
        } max-md:pointer-events-auto md:group-hover/help:block md:group-focus-within/help:block`}
      >
        <p className="text-xs font-semibold text-gray-900">{help.title}</p>
        <p className="text-xs text-gray-600 mt-1">{help.meaning}</p>
        <p className="text-xs text-gray-500 mt-1.5">
          <span className="font-medium text-gray-600">Se activa cuando: </span>
          {help.activatesWhen}
        </p>
        {companyLevel && (
          <p className="text-[11px] text-gray-400 mt-2 pt-2 border-t border-gray-100 leading-snug">
            {COMPANY_STATUS_AGGREGATE_NOTE}
          </p>
        )}
      </div>
    </span>
  )
}
