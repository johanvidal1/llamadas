import { useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import {
  COMPANY_STATUS_AGGREGATE_NOTE,
  STATUS_HELP,
  type StatusHelpKey,
} from '../config/statusHelp'

type StatusHelpPopoverProps = {
  helpKey: StatusHelpKey
  companyLevel?: boolean
}

export function StatusHelpPopover({ helpKey, companyLevel = false }: StatusHelpPopoverProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const help = STATUS_HELP[helpKey]

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (window.matchMedia('(max-width: 767px)').matches) {
      setOpen((v) => !v)
    }
  }

  return (
    <span ref={rootRef} className="relative inline-flex items-center group/help shrink-0">
      <button
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
        className={`absolute z-50 top-full right-0 left-auto mt-1.5 w-56 max-w-[min(14rem,calc(100vw-1.5rem))] rounded-lg border border-gray-200 bg-white p-3 shadow-lg text-left pointer-events-none max-md:bottom-full max-md:top-auto max-md:mb-1.5 max-md:mt-0 ${
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
