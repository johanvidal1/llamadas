import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { OfferPlanColors } from '../api/client'
import type { ProposalBenefit } from '../lib/proposalPlans'
import {
  inkOnFill,
  priceHeaderOf,
  sheetCellFill,
  sheetCellValue,
  sheetHeaders,
} from '../lib/quoteSheet'

export type SheetRow = {
  id: string
  name: string
  proposed: boolean
  benefits: ProposalBenefit[]
  colors?: OfferPlanColors | null
}

const GREETING_FALLBACK = 'Estimado/a,'
const FAREWELL_FALLBACK = 'Quedamos atentos.'

/** One portrait sheet. `panel` fills the quote panel; `wide` is the enlarged dialog. */
export default function QuoteSheetPreview({
  tableName,
  rows,
  currentLine,
  offerLine,
  greeting,
  farewell,
  addressee,
  senderName,
  senderPhone,
  onGreeting,
  onFarewell,
  onAddressee,
  onSenderName,
  size = 'panel',
}: {
  tableName: string
  rows: SheetRow[]
  currentLine: string
  offerLine: string
  greeting: string
  farewell: string
  addressee: string
  senderName: string
  senderPhone: string
  onGreeting: (value: string) => void
  onFarewell: (value: string) => void
  onAddressee: (value: string) => void
  onSenderName: (value: string) => void
  size?: 'panel' | 'wide'
}) {
  const wide = size === 'wide'
  const headers = sheetHeaders(rows)
  const priceHeader = headers[0] || priceHeaderOf(rows[0]?.colors)
  const band = rows.find((row) => row.colors?.title || row.colors?.header)?.colors
  const titleFill = band?.title || '#B9280B'
  const headerFill = band?.header || '#182333'
  const headerInk = band?.headerText || inkOnFill(headerFill)
  const restCount = Math.max(1, headers.length - 1)
  const firstWidth = headers.length > 1 ? 18 : 100
  const restWidth = headers.length > 1 ? 82 / restCount : 100
  const greetingText = greeting.trim() || GREETING_FALLBACK
  const farewellText = farewell.trim() || FAREWELL_FALLBACK
  const who = addressee.trim() || '—'
  const sender = senderName.trim()
  const phone = senderPhone.trim()
  const body = wide ? 'text-sm leading-snug' : 'text-xs leading-snug'
  const strong = wide ? 'text-base font-semibold leading-snug' : 'text-sm font-semibold leading-snug'
  const senderType = wide ? 'text-sm font-semibold leading-snug' : 'text-xs font-semibold leading-snug'

  return (
    <div
      className={
        wide
          ? 'w-full min-w-0 rounded-md border border-slate-200 bg-white px-8 py-6 text-slate-900 shadow-md'
          : 'w-full min-w-0 rounded-md border border-slate-200 bg-white px-4 py-4 text-slate-900 shadow-md'
      }
    >
      <div
        className={wide ? 'mb-4 rounded-sm px-3 py-2 text-base font-semibold' : 'mb-3 rounded-sm px-2 py-1.5 text-sm font-semibold'}
        style={{ backgroundColor: titleFill, color: inkOnFill(titleFill) }}
      >
        {tableName.trim() || 'Propuesta'}
      </div>

      <SheetEditableLine
        value={greeting}
        display={greetingText}
        onCommit={onGreeting}
        ariaLabel="Editar saludo"
        className={`${body} text-slate-900`}
      />
      <div className="mt-1">
        <SheetEditableLine
          value={addressee}
          display={who}
          onCommit={onAddressee}
          ariaLabel="Editar destinatario"
          className={`${strong} text-slate-900`}
        />
      </div>
      <p className={wide ? 'mt-3 text-sm leading-snug text-slate-800' : 'mt-2 text-xs leading-snug text-slate-800'}>{currentLine}</p>

      <div className={wide ? 'mt-3 min-w-0 pl-20' : 'mt-2 min-w-0 pl-16'}>
        <table className={wide ? 'w-full table-fixed border-collapse text-[12px] leading-tight' : 'w-full table-fixed border-collapse text-[9px] leading-tight'}>
          <colgroup>
            {headers.map((header, index) => (
              <col key={header} style={{ width: `${index === 0 ? firstWidth : restWidth}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  className="border border-white/20 px-1 py-1 text-left align-bottom font-semibold break-words"
                  style={{ backgroundColor: headerFill, color: headerInk }}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.proposed ? 'outline outline-2 outline-[#B9280B]' : undefined}>
                {headers.map((header) => {
                  const fill = sheetCellFill(row.colors, header)
                  return (
                    <td
                      key={`${row.id}:${header}`}
                      className="relative border border-slate-200 px-1 py-1 align-top break-words"
                      style={{ backgroundColor: fill, color: inkOnFill(fill) }}
                    >
                      {row.proposed && header === priceHeader ? (
                        <span
                          className={
                            wide
                              ? 'absolute right-full top-1 mr-1 whitespace-nowrap text-[11px] font-semibold text-[#B9280B]'
                              : 'absolute right-full top-0.5 mr-1 whitespace-nowrap text-[9px] font-semibold text-[#B9280B]'
                          }
                        >
                          Propuesta
                        </span>
                      ) : null}
                      {sheetCellValue(row, header, priceHeader)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={wide ? 'mt-3 text-sm font-semibold text-slate-900' : 'mt-2 text-xs font-semibold text-slate-900'}>{offerLine}</p>
      <div className={wide ? 'mt-4' : 'mt-3'}>
        <SheetEditableLine
          value={farewell}
          display={farewellText}
          onCommit={onFarewell}
          ariaLabel="Editar despedida"
          className={`${body} text-slate-900`}
        />
      </div>
      <div className={wide ? 'mt-3' : 'mt-2'}>
        <SheetEditableLine
          value={senderName}
          display={sender || '—'}
          onCommit={onSenderName}
          ariaLabel="Editar remitente"
          className={`${senderType} text-slate-900`}
        />
        {phone ? <p className={wide ? 'text-sm text-slate-600' : 'text-xs text-slate-600'}>{phone}</p> : null}
      </div>
    </div>
  )
}

function SheetEditableLine({
  value,
  display,
  onCommit,
  ariaLabel,
  className,
}: {
  value: string
  display: string
  onCommit: (next: string) => void
  ariaLabel: string
  className: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const closed = useRef(false)

  useLayoutEffect(() => {
    if (!editing) return
    inputRef.current?.focus({ preventScroll: true })
  }, [editing])

  useEffect(() => {
    if (!editing) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      closed.current = true
      setEditing(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [editing])

  function open() {
    closed.current = false
    setDraft(value)
    setEditing(true)
  }

  function commit(next: string) {
    if (closed.current) return
    closed.current = true
    setEditing(false)
    if (next !== value) onCommit(next)
  }

  if (!editing) {
    return (
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={open}
        className={`inline-block w-fit max-w-full cursor-text whitespace-pre-wrap break-words rounded-sm text-left underline decoration-dotted decoration-blue-400/70 underline-offset-2 outline-none hover:decoration-blue-500 focus-visible:ring-1 focus-visible:ring-blue-300 ${className}`}
      >
        {display}
      </button>
    )
  }

  return (
    <span className="inline-grid max-w-full align-top">
      <span aria-hidden="true" className={`invisible col-start-1 row-start-1 whitespace-pre px-px ${className}`}>
        {draft || ' '}
      </span>
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        value={draft}
        autoComplete="off"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commit(inputRef.current?.value ?? draft)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          commit(event.currentTarget.value)
        }}
        className={`col-start-1 row-start-1 w-full min-w-[8ch] max-w-full rounded-sm border-0 bg-white px-px text-inherit outline-none ring-1 ring-blue-400 ${className}`}
      />
    </span>
  )
}
