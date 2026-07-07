import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export type FilterDropdownProps<T extends string> = {
  value: T
  onChange: (v: T) => void
  id?: string
  options: readonly { value: T; label: string }[]
  getDescription: (value: T) => string
}

export function FilterDropdown<T extends string>({
  value,
  onChange,
  id,
  options,
  getDescription,
}: FilterDropdownProps<T>) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState<T | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const activeValue = hovered ?? value
  const displayedDescription = getDescription(activeValue)
  const currentLabel = options.find((o) => o.value === value)?.label ?? value

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
    if (open) {
      setHovered(null)
      listRef.current?.focus()
    }
  }, [open])

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (open) return
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
    }
  }

  const handleListKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const currentIdx = options.findIndex((o) => o.value === activeValue)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHovered(options[Math.min(currentIdx + 1, options.length - 1)].value)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHovered(options[Math.max(currentIdx - 1, 0)].value)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onChange(activeValue)
      setOpen(false)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        id={id}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
        className="input text-sm h-9 py-1.5 w-full flex items-center justify-between gap-2 text-left bg-white"
      >
        <span className="truncate">{currentLabel}</span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden min-w-full sm:min-w-0">
          <div className="flex flex-col sm:flex-row">
            <ul
              ref={listRef}
              role="listbox"
              tabIndex={-1}
              aria-activedescendant={`filter-option-${activeValue}`}
              onKeyDown={handleListKeyDown}
              onMouseLeave={() => setHovered(null)}
              className="w-full sm:w-44 py-1 shrink-0 outline-none"
            >
              {options.map((opt) => {
                const isSelected = opt.value === value
                const isActive = opt.value === activeValue
                return (
                  <li
                    key={opt.value || 'all'}
                    id={`filter-option-${opt.value}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHovered(opt.value)}
                    onClick={() => {
                      onChange(opt.value)
                      setOpen(false)
                    }}
                    className={`px-3 py-2 text-sm cursor-pointer ${
                      isSelected
                        ? 'bg-gray-100 font-medium text-gray-900'
                        : 'text-gray-700 hover:bg-gray-50'
                    } ${isActive && !isSelected ? 'bg-gray-50' : ''}`}
                  >
                    {opt.label}
                  </li>
                )
              })}
            </ul>
            <div
              className="w-full sm:w-56 bg-gray-50 p-3 text-xs leading-relaxed text-gray-600 border-t sm:border-t-0 sm:border-l border-gray-200"
              aria-live="polite"
            >
              {displayedDescription}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
