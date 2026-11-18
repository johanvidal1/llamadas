import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { OfferPlanColors } from '../api/client'
import { formatSoles, type ProposalBenefit } from '../lib/proposalPlans'
import {
  CLARO_LOGO_SRC,
  CLARO_NAVY,
  CLARO_RED,
  CLARO_ROAMING_ZONES_SRC,
  discountedUnit,
  displayBenefit,
  displayDatosBenefit,
  formatQuoteCel,
  formatQuoteDate,
  mixHasRoaming,
  mobileHeadline,
  quotePlanApps,
  quotePlanAppsShort,
  quotePlanData,
  quotePlanInternet,
  quotePlanMinutes,
  quotePlanNameWithOrigin,
  quotePlanRoaming,
  quoteTableHeaders,
  type QuotePlanOrigin,
} from '../lib/quoteSheet'

export type SheetRow = {
  id: string
  name: string
  lines: number
  priceSoles: number
  proposed: boolean
  benefits: ProposalBenefit[]
  colors?: OfferPlanColors | null
  origin?: QuotePlanOrigin
}

/** One portrait sheet. `panel` fills the quote panel; `wide` is the enlarged dialog. */
export default function QuoteSheetPreview({
  companyName,
  ruc,
  rows,
  discountPercent,
  extras,
  headlineSuffix,
  senderName,
  senderPhone,
  onExtras,
  size = 'panel',
}: {
  companyName: string
  ruc: string
  rows: SheetRow[]
  discountPercent: number
  extras: string
  headlineSuffix?: string | null
  senderName: string
  senderPhone: string
  onExtras: (value: string) => void
  size?: 'panel' | 'wide'
}) {
  const wide = size === 'wide'
  const accent = CLARO_RED
  const navy = CLARO_NAVY
  const sender = senderName.trim()
  const phone = senderPhone.trim()
  const extrasText = extras.trim()
  const totalLines = rows.reduce((sum, row) => sum + row.lines, 0)
  const discountedTotal = rows.reduce((sum, row) => {
    const unit = discountedUnit(row.priceSoles, discountPercent)
    const cents = Math.round(unit * 100)
    return sum + (cents * row.lines) / 100
  }, 0)
  const headers = quoteTableHeaders(discountPercent)
  const dateLabel = formatQuoteDate()

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white text-slate-900 shadow-md">
      <div className="flex items-stretch gap-4 px-5 py-4 text-white" style={{ backgroundColor: accent }}>
        <div className="flex h-16 w-[7.75rem] shrink-0 items-center justify-center rounded-xl bg-white p-1">
          <img src={CLARO_LOGO_SRC} alt="Claro empresas" className="max-h-full max-w-full object-contain" />
        </div>
        <div className="min-w-0 py-0.5">
          <p className={wide ? 'text-lg font-bold uppercase tracking-wide' : 'text-sm font-bold uppercase tracking-wide'}>
            Propuesta comercial
          </p>
          <p className={wide ? 'text-sm font-semibold uppercase' : 'text-xs font-semibold uppercase'}>Portabilidad móvil</p>
          <p className={wide ? 'text-sm font-semibold' : 'text-xs font-semibold'}>{companyName.trim() || '—'}</p>
          <p className={wide ? 'text-xs text-white/90' : 'text-[11px] text-white/90'}>
            RUC {ruc.trim() || '—'} | {dateLabel}
          </p>
        </div>
      </div>

      <div className={wide ? 'space-y-5 px-8 py-6' : 'space-y-4 px-5 py-5'}>
        <div>
          <p className={wide ? 'text-xl font-bold text-slate-900' : 'text-base font-bold text-slate-900'}>
            Conectividad y beneficios para tu empresa
          </p>
          <p className={wide ? 'mt-2 text-sm leading-snug text-slate-600' : 'mt-1.5 text-sm leading-snug text-slate-600'}>
            {mobileHeadline(totalLines, headlineSuffix)}
          </p>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-slate-100 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-700">Facturación mensual</p>
            <p className={wide ? 'text-3xl font-bold tabular-nums' : 'text-2xl font-bold tabular-nums'} style={{ color: accent }}>
              {formatSoles(discountedTotal)}
            </p>
          </div>
          {discountPercent > 0 ? (
            <div className="text-right">
              <p className={wide ? 'text-lg font-bold' : 'text-base font-bold'} style={{ color: accent }}>
                {discountPercent}% de descuento
              </p>
              <p className={wide ? 'text-sm text-slate-500' : 'text-xs text-slate-500'}>En cada línea de la propuesta</p>
            </div>
          ) : null}
        </div>

        <section>
          <SectionHeading n={1} accent={accent} wide={wide}>
            Planes, precios y beneficios incluidos
          </SectionHeading>
          <div className="mt-3 min-w-0 overflow-x-auto">
            <table className={wide ? 'w-full table-fixed border-collapse text-[13px] leading-snug' : 'w-full table-fixed border-collapse text-[11px] leading-snug'}>
              <thead>
                <tr>
                  {headers.map((header) => (
                    <th
                      key={header.key}
                      className="px-1.5 py-1 text-left align-bottom font-semibold uppercase first:rounded-l-md last:rounded-r-md"
                      style={{ backgroundColor: navy, color: '#FFFFFF' }}
                    >
                      {header.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="odd:bg-white even:bg-slate-50">
                    {headers.map((header) => (
                      <td key={`${row.id}:${header.key}`} className="px-1.5 py-1 align-top break-words text-slate-900">
                        <SheetTableCell row={row} column={header.key} percent={discountPercent} accent={accent} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <SectionHeading n={2} accent={accent} wide={wide}>
            Roaming internacional
          </SectionHeading>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {rows.map((row) => {
              const roam = quotePlanRoaming(row.benefits)
              return (
                <div key={`roam-${row.id}`} className="rounded-xl bg-slate-100 px-4 py-3">
                  <p className={wide ? 'text-sm font-bold' : 'text-xs font-bold'} style={{ color: accent }}>
                    {quotePlanNameWithOrigin(row.name, row.origin)}
                  </p>
                  <p className={wide ? 'mt-1 text-sm font-semibold text-slate-900' : 'mt-1 text-xs font-semibold text-slate-900'}>
                    {displayBenefit(roam.min)} | {displayBenefit(roam.internet)}
                  </p>
                  <p className={wide ? 'text-sm text-slate-500' : 'text-xs text-slate-500'}>{displayBenefit(roam.sms)}</p>
                </div>
              )
            })}
          </div>
        </section>

        <section>
          <SectionHeading n={3} accent={accent} wide={wide}>
            Aplicaciones ilimitadas por plan
          </SectionHeading>
          <div className="mt-3 space-y-1.5 rounded-xl bg-slate-100 px-4 py-3">
            {rows.map((row) => (
              <div key={`apps-${row.id}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <p className={wide ? 'w-44 shrink-0 text-sm font-bold' : 'w-36 shrink-0 text-xs font-bold'} style={{ color: accent }}>
                  {quotePlanNameWithOrigin(row.name, row.origin)}
                </p>
                <p className={wide ? 'min-w-0 flex-1 text-sm text-slate-800' : 'min-w-0 flex-1 text-xs text-slate-800'}>
                  {displayBenefit(quotePlanApps(row.benefits))}
                </p>
              </div>
            ))}
          </div>
        </section>

        {extrasText ? (
          <section className="border-t border-slate-200 pt-4">
            <p className={wide ? 'text-sm font-bold uppercase tracking-wide' : 'text-xs font-bold uppercase tracking-wide'} style={{ color: accent }}>
              Beneficios adicionales
            </p>
            <div className="mt-1">
              <SheetEditableBlock
                value={extras}
                display={extrasText}
                onCommit={onExtras}
                ariaLabel="Editar beneficios adicionales"
                className={wide ? 'text-sm leading-relaxed text-slate-800' : 'text-xs leading-relaxed text-slate-800'}
              />
            </div>
          </section>
        ) : null}

        {mixHasRoaming(rows) ? (
          <section>
            <h3 className={wide ? 'text-lg font-bold leading-snug text-slate-900' : 'text-sm font-bold leading-snug text-slate-900'}>
              Zonas de roaming internacional
            </h3>
            <img
              src={CLARO_ROAMING_ZONES_SRC}
              alt="Zonas de roaming internacional: Zona Andina, América, EE.UU. y Canadá, Europa x 18 meses"
              className="mt-2 w-full rounded-md"
            />
          </section>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 px-5 py-2.5 text-white" style={{ backgroundColor: navy }}>
        <p className={wide ? 'min-w-0 text-sm font-semibold uppercase' : 'min-w-0 text-[11px] font-semibold uppercase'}>
          Ejecutivo comercial: {sender || '—'}
        </p>
        {phone ? (
          <p className={wide ? 'text-sm font-semibold uppercase' : 'text-[11px] font-semibold uppercase'}>
            Cel. {formatQuoteCel(phone)}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function SectionHeading({
  n,
  accent,
  wide,
  children,
}: {
  n: number
  accent: string
  wide: boolean
  children: string
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-[12px] font-bold leading-none text-white"
        style={{ backgroundColor: accent }}
      >
        {n}
      </span>
      <h3 className={wide ? 'text-lg font-bold leading-snug text-slate-900' : 'text-sm font-bold leading-snug text-slate-900'}>
        {children}
      </h3>
    </div>
  )
}

function SheetTableCell({
  row,
  column,
  percent,
  accent,
}: {
  row: SheetRow
  column: string
  percent: number
  accent: string
}) {
  if (column === 'cant') return <span className="font-semibold">{row.lines}</span>
  if (column === 'plan') {
    return <span className="font-semibold">{quotePlanNameWithOrigin(row.name, row.origin)}</span>
  }
  if (column === 'precio') {
    return (
      <span className={percent > 0 ? 'text-slate-400 line-through' : undefined}>{formatSoles(row.priceSoles)}</span>
    )
  }
  if (column === 'dcto') {
    return (
      <span className="font-semibold" style={{ color: accent }}>
        {formatSoles(discountedUnit(row.priceSoles, percent))}
      </span>
    )
  }
  if (column === 'minutos') return <>{displayBenefit(quotePlanMinutes(row.benefits))}</>
  if (column === 'datos') return <>{displayDatosBenefit(quotePlanData(row.benefits, row.origin))}</>
  if (column === 'internet') return <>{displayBenefit(quotePlanInternet(row.benefits, row.origin))}</>
  if (column === 'apps') {
    return (
      <span style={{ color: accent }}>{displayBenefit(quotePlanAppsShort(row.benefits))}</span>
    )
  }
  return <>{'—'}</>
}

function SheetEditableBlock({
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
  const inputRef = useRef<HTMLTextAreaElement>(null)
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
        className={`inline-block w-full max-w-full cursor-text whitespace-pre-wrap break-words rounded-md border border-dashed border-amber-400/80 bg-amber-50/60 px-2 py-1.5 text-left outline-none hover:border-amber-500 focus-visible:ring-1 focus-visible:ring-amber-400 ${className}`}
      >
        {display}
      </button>
    )
  }

  return (
    <textarea
      ref={inputRef}
      aria-label={ariaLabel}
      value={draft}
      rows={3}
      autoComplete="off"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => commit(inputRef.current?.value ?? draft)}
      className={`w-full max-w-full rounded-md border border-amber-400 bg-white px-2 py-1.5 outline-none ring-1 ring-amber-400 ${className}`}
    />
  )
}
