import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CircleHelp, Download, Eye, Mail, Maximize2, MessageCircle, X } from 'lucide-react'
import {
  commercialQuotePublicUrl,
  createCommercialQuote,
  downloadCommercialQuote,
  downloadCommercialQuotePreview,
  getOfferPlanTables,
  getQuoteSettings,
  markCommercialQuoteShared,
  type CommercialQuoteDraft,
  type OfferPlan,
} from '../api/client'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { useAuth } from '../contexts/AuthContext'
import { peruMobileDigits } from '../lib/mobileLine'
import {
  buildProposalShareText,
  currentPlanGroupKey,
  formatCurrentPlanRenta,
  formatLineCount,
  formatSoles,
  groupCurrentPlans,
  lineTotal,
  splitPortabilityBenefits,
  type CurrentPlanGroup,
} from '../lib/proposalPlans'
import { currentPlanSentence, MAX_COMPARE_PLANS, offerSentence } from '../lib/quoteSheet'
import QuoteSheetPreview from './QuoteSheetPreview'

const NO_PLANS: OfferPlan[] = []

type Line = {
  id: string
  numeroTelefono?: string
  plan?: string
  rentaBasica?: string
  rentaBasicaConDesc?: string
}

const labelClass = 'text-[10px] font-medium uppercase tracking-widest text-muted-foreground'
const mutedClass = 'text-muted-foreground'
const inputClass =
  'h-8 w-full rounded-lg border border-border/60 bg-background px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20'
const selectTriggerClass =
  'h-9 rounded-lg border-border/60 bg-background text-sm shadow-sm focus:ring-2 focus:ring-primary/20'
const secondaryBtn =
  'inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-xl border border-primary bg-background px-3 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50'
const slimBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted'
const slimViewBtn =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-primary bg-background px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/5'
const outlineActionClass =
  'h-11 min-w-0 rounded-xl border-primary bg-background px-2 text-primary shadow-sm transition-colors hover:bg-primary/5 hover:text-primary disabled:pointer-events-auto disabled:cursor-not-allowed'
const registerActionClass =
  'h-11 min-w-0 rounded-xl bg-green-600 px-2 text-white shadow-sm transition-colors hover:bg-green-700 disabled:pointer-events-auto disabled:cursor-not-allowed'

function identityLine(razonSocial: string, ruc: string, contactName: string): string {
  const who = razonSocial.trim() || ruc.trim()
  const contact = contactName.trim()
  if (who && contact) return `${who} · ${contact}`
  return who || contact || '—'
}

function apiError(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
  return msg ?? fallback
}

async function readApiError(err: unknown, fallback: string): Promise<string> {
  const data = (err as { response?: { data?: unknown } })?.response?.data
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { error?: string }
      if (parsed.error) return parsed.error
    } catch {
      /* the body was not JSON */
    }
  }
  return apiError(err, fallback)
}

function BenefitRows({ benefits }: { benefits: { label: string; value: string }[] }) {
  return (
    <dl className="divide-y divide-border/30 border-t border-border/30">
      {benefits.map((benefit, index) => (
        <div
          key={`${benefit.label}:${index}`}
          className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
        >
          <dt className="min-w-0 break-words text-muted-foreground">{benefit.label}</dt>
          <dd className="min-w-0 break-words text-right font-medium text-foreground">{benefit.value.trim() || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

function QuotedPlanTitle({ plan, lines }: { plan: OfferPlan; lines: number }) {
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <p className={labelClass}>Plan cotizado</p>
      <p className="break-words text-base font-semibold leading-snug text-foreground">{plan.name}</p>
      <p className="text-sm tabular-nums text-foreground">
        {formatSoles(plan.priceSoles)} por línea · {formatLineCount(lines)}
      </p>
    </div>
  )
}

function QuotedPlanFacts({ plan }: { plan: OfferPlan }) {
  const { portability, rest } = splitPortabilityBenefits(plan.benefits)
  return (
    <Card className="border-border/60 shadow-sm">
      <div className="space-y-1.5 p-4">
        <p className={labelClass}>Portabilidad</p>
        {portability.length === 0 ? (
          <p className="rounded-xl border border-primary/10 bg-primary/5 p-3 text-sm text-foreground">
            Sin portabilidad en este plan
          </p>
        ) : (
          <div className="space-y-2">
            {portability.map((benefit, index) => (
              <div
                key={`${benefit.label}:${index}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-primary/10 bg-primary/5 p-3"
              >
                <span className="min-w-0 break-words text-sm text-foreground">{benefit.label}</span>
                <span className="shrink-0 text-right text-sm font-bold text-primary">
                  {benefit.value.trim() || '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {rest.length > 0 ? (
        <CardContent className="p-0 pb-1">
          <BenefitRows benefits={rest} />
        </CardContent>
      ) : null}
    </Card>
  )
}

function PlanActualList({ groups }: { groups: CurrentPlanGroup[] }) {
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin líneas móviles registradas</p>
  }
  const twoCols = groups.length >= 5
  return (
    <ul className={twoCols ? 'grid grid-cols-2 gap-1.5' : 'space-y-1'}>
      {groups.map((group) => {
        const renta = formatCurrentPlanRenta(group)
        const name = group.plan || '—'
        const label = renta ? `${name} · ${renta}` : name
        return (
          <li
            key={currentPlanGroupKey(group)}
            className="flex min-w-0 items-center justify-between gap-1.5 rounded-lg border border-border/50 bg-card px-2 py-1 text-xs shadow-sm"
          >
            <span className="min-w-0 truncate font-medium text-foreground" title={label}>
              {name}
              {renta ? <span className="font-normal text-muted-foreground"> · {renta}</span> : null}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{formatLineCount(group.count)}</span>
          </li>
        )
      })}
    </ul>
  )
}

export default function ProposalPanel({
  isAdmin,
  companyId,
  ruc,
  razonSocial,
  contactName,
  phone,
  email,
  mobileLines,
  onClose,
  onQuoteRegistered,
}: {
  /** Both Mis clientes skins mount this same light panel. */
  nuevo?: boolean
  isAdmin: boolean
  companyId: string
  ruc: string
  razonSocial: string
  contactName: string
  phone: string
  email: string
  mobileLines: Line[]
  onClose: () => void
  onQuoteRegistered?: () => void
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { data: tables = [], isLoading, isError } = useQuery({
    queryKey: ['offer-plan-tables'],
    queryFn: () => getOfferPlanTables(),
  })
  const { data: quoteSettings, isSuccess: settingsReady, isError: settingsError } = useQuery({
    queryKey: ['quote-settings'],
    queryFn: getQuoteSettings,
  })
  const shareEnabled = quoteSettings?.shareEnabled === true
  const settingsSettled = settingsReady || settingsError
  const [tableId, setTableId] = useState('')
  const [planId, setPlanId] = useState('')
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [compareNotice, setCompareNotice] = useState('')
  const [linesInput, setLinesInput] = useState('1')
  const [greeting, setGreeting] = useState('')
  const [farewell, setFarewell] = useState('')
  const [addressee, setAddressee] = useState(() => contactName.trim())
  const [senderName, setSenderName] = useState('')
  const [seededFor, setSeededFor] = useState('')
  const [share, setShare] = useState<{ key: string; id: string; url: string } | null>(null)
  const [shareError, setShareError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [sharing, setSharing] = useState<'whatsapp' | 'email' | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetWide, setSheetWide] = useState(false)
  const requestSeq = useRef(0)
  const onRegisteredRef = useRef(onQuoteRegistered)
  const panelRef = useRef<HTMLElement>(null)
  const wideRef = useRef<HTMLDivElement>(null)
  const previewCloseRef = useRef<HTMLButtonElement>(null)
  const ampliarRef = useRef<HTMLButtonElement>(null)
  const escapeLock = useRef(false)
  const openMenus = useRef(new Set<string>())
  const escapeMenuRef = useRef(false)
  const sheetOpenRef = useRef(false)
  const sheetWideRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onRegisteredRef.current = onQuoteRegistered
  sheetOpenRef.current = sheetOpen
  sheetWideRef.current = sheetWide
  onCloseRef.current = onClose

  function dismissTop() {
    if (escapeLock.current) return
    escapeLock.current = true
    window.setTimeout(() => {
      escapeLock.current = false
    }, 0)
    if (sheetWideRef.current) {
      setSheetWide(false)
      return
    }
    if (sheetOpenRef.current) {
      setSheetOpen(false)
      return
    }
    onCloseRef.current()
  }

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!sheetOpen) return
    if (sheetWide) {
      wideRef.current?.focus()
      return
    }
    previewCloseRef.current?.focus()
  }, [sheetOpen, sheetWide])

  function onMenuOpenChange(id: string, open: boolean) {
    if (open) openMenus.current.add(id)
    else openMenus.current.delete(id)
  }

  useEffect(() => {
    const mark = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      escapeMenuRef.current = openMenus.current.size > 0
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (escapeMenuRef.current) {
        escapeMenuRef.current = false
        return
      }
      e.preventDefault()
      e.stopPropagation()
      dismissTop()
    }
    window.addEventListener('keydown', mark, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', mark, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    if (!quoteSettings || seededFor === companyId) return
    setGreeting(quoteSettings.greeting ?? '')
    setFarewell(quoteSettings.farewell ?? '')
    setAddressee(contactName.trim())
    setSenderName(user?.name?.trim() ?? '')
    setSeededFor(companyId)
  }, [quoteSettings, companyId, seededFor, contactName, user?.name])

  useEffect(() => {
    if (seededFor !== companyId) return
    setSenderName((current) => current || user?.name?.trim() || '')
  }, [user?.name, seededFor, companyId])

  useEffect(() => {
    const principal = tables.find((table) => table.isPrincipal) ?? tables[0]
    if (!principal) {
      if (tableId) setTableId('')
      return
    }
    if (!tables.some((table) => table.id === tableId)) setTableId(principal.id)
  }, [tables, tableId])

  const table = tables.find((item) => item.id === tableId) ?? null
  const plans = table?.plans ?? NO_PLANS

  useEffect(() => {
    if (!table) return
    if (!table.plans.some((plan) => plan.id === planId)) {
      const next = table.plans[0]?.id ?? ''
      setPlanId(next)
      if (next) setCompareIds((current) => current.filter((id) => id !== next))
    }
  }, [table, planId])

  function selectQuotedPlan(nextId: string) {
    setPlanId(nextId)
    setCompareNotice('')
    setCompareIds((current) => current.filter((id) => id !== nextId))
  }

  const selected = plans.find((plan) => plan.id === planId) ?? null

  useEffect(() => {
    if (selected) return
    setSheetOpen(false)
    setSheetWide(false)
  }, [selected])
  const comparePlanIds = useMemo(() => {
    const allowed = new Set(plans.map((plan) => plan.id))
    return compareIds.filter((id) => id !== planId && allowed.has(id)).slice(0, MAX_COMPARE_PLANS)
  }, [compareIds, plans, planId])

  const lines = (() => {
    const n = Number.parseInt(linesInput, 10)
    if (!Number.isFinite(n) || n < 1) return 1
    return Math.min(999, n)
  })()

  const groups = useMemo(() => groupCurrentPlans(mobileLines), [mobileLines])
  const currentKey = groups
    .map((group) => `${group.plan}\u0001${group.rentaBasica}\u0001${group.rentaConDesc}\u0001${group.count}`)
    .join('\u0002')

  const draft = useMemo<CommercialQuoteDraft | null>(() => {
    if (!tableId || !planId) return null
    return {
      tableId,
      planId,
      comparePlanIds,
      lines,
      companyId,
      companyName: razonSocial.trim(),
      contactName: addressee.trim(),
      ruc: ruc.trim(),
      phone: phone.trim(),
      email: email.trim(),
      currentPlans: groups,
      greeting,
      farewell,
      senderName: senderName.trim(),
    }
    // currentKey is the contents of groups, so a fresh array with the same lines does not create another PDF.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tableId,
    planId,
    comparePlanIds,
    lines,
    companyId,
    razonSocial,
    addressee,
    ruc,
    phone,
    email,
    currentKey,
    greeting,
    farewell,
    senderName,
  ])

  const draftKey = draft ? JSON.stringify(draft) : ''

  useEffect(() => {
    if (!shareEnabled || !draft || !draftKey) {
      setShare(null)
      setShareError('')
      return
    }
    const seq = ++requestSeq.current
    const payload = draft
    setShare(null)
    setShareError('')
    const timer = window.setTimeout(() => {
      createCommercialQuote(payload)
        .then((quote) => {
          if (requestSeq.current !== seq) return
          setShare({ key: draftKey, id: quote.id, url: commercialQuotePublicUrl(quote.token) })
        })
        .catch((err: unknown) => {
          if (requestSeq.current !== seq) return
          setShare(null)
          setShareError(apiError(err, 'No se pudo preparar el PDF.'))
        })
    }, 450)
    return () => {
      window.clearTimeout(timer)
      requestSeq.current += 1
    }
  }, [draft, draftKey, shareEnabled])

  const ready = share && share.key === draftKey ? share : null
  const shareText = shareEnabled && ready ? buildProposalShareText(contactName, ready.url) : ''
  const total = selected ? lineTotal(selected.priceSoles, lines) : 0
  const mobile = peruMobileDigits(phone)
  const mail = email.trim()
  const waHref =
    shareEnabled && ready && mobile
      ? `https://wa.me/51${mobile}?text=${encodeURIComponent(shareText)}`
      : null
  const mailHref =
    shareEnabled && ready && mail
      ? `mailto:${mail}?subject=${encodeURIComponent('Propuesta comercial')}&body=${encodeURIComponent(shareText)}`
      : null
  const onLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  const deliveryHint = shareEnabled
    ? 'El archivo viaja como un enlace.'
    : 'Por ahora la propuesta se entrega descargando el PDF.'
  const proposalHint = onLocalhost
    ? `${deliveryHint} ${
        shareEnabled
          ? 'En localhost el teléfono no abre el enlace; la descarga sí funciona en este equipo.'
          : 'En localhost la descarga funciona en este equipo.'
      }`
    : deliveryHint

  const identity = identityLine(razonSocial, ruc, contactName)
  const contactLine = [phone.trim(), email.trim()].filter(Boolean).join(' · ')
  const senderPhone = user?.phone?.trim() ?? ''
  const busy = downloading || previewing
  const canPreview = Boolean(draft) && !busy
  const canRegister = Boolean(draft) && settingsSettled && !busy && !(shareEnabled && !ready)
  const canOpenSheet = Boolean(selected)

  const previewRows = useMemo(() => {
    if (!selected) return []
    const chosen = new Set([selected.id, ...comparePlanIds])
    return plans
      .filter((plan) => chosen.has(plan.id))
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es'))
      .map((plan) => ({
        id: plan.id,
        name: plan.name,
        proposed: plan.id === selected.id,
        benefits: plan.benefits,
        colors: plan.colors,
      }))
  }, [plans, selected, comparePlanIds])

  function toggleCompare(id: string, checked: boolean) {
    if (!checked) {
      setCompareNotice('')
      setCompareIds((current) => current.filter((item) => item !== id))
      return
    }
    if (comparePlanIds.length >= MAX_COMPARE_PLANS && !comparePlanIds.includes(id)) {
      setCompareNotice('Puedes comparar hasta 3 planes.')
      return
    }
    setCompareNotice('')
    setCompareIds((current) => (current.includes(id) ? current : [...current, id]))
  }

  async function refreshCompanyQuotes() {
    if (!companyId) return
    await qc.invalidateQueries({ queryKey: ['company-quotes', companyId] })
  }

  async function onShare(channel: 'whatsapp' | 'email', href: string) {
    if (!shareEnabled || !ready || sharing) return
    setSharing(channel)
    try {
      await markCommercialQuoteShared(ready.id, channel)
      await refreshCompanyQuotes()
      if (channel === 'whatsapp') window.open(href, '_blank', 'noopener,noreferrer')
      else window.location.href = href
    } catch (err: unknown) {
      toast.error(apiError(err, 'No se pudo registrar el envío'))
    } finally {
      setSharing(null)
    }
  }

  async function onPreview() {
    if (!canPreview || !draft) return
    setPreviewing(true)
    try {
      const saved = await downloadCommercialQuotePreview(draft)
      if (saved) toast.success('PDF descargado')
    } catch (err: unknown) {
      toast.error(await readApiError(err, 'No se pudo descargar el PDF'))
    } finally {
      setPreviewing(false)
    }
  }

  async function onDownload() {
    if (!canRegister || !draft) return
    setDownloading(true)
    try {
      const id = shareEnabled && ready ? ready.id : (await createCommercialQuote(draft)).id
      const saved = await downloadCommercialQuote(id)
      await refreshCompanyQuotes()
      onRegisteredRef.current?.()
      if (saved) toast.success('PDF guardado')
    } catch (err: unknown) {
      toast.error(await readApiError(err, 'No se pudo descargar el PDF'))
      await refreshCompanyQuotes()
    } finally {
      setDownloading(false)
    }
  }

  function downloadActions() {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          onClick={() => void onPreview()}
          disabled={!canPreview}
          className={outlineActionClass}
        >
          <Download />
          Descargar prueba
        </Button>
        <Button type="button" onClick={() => void onDownload()} disabled={!canRegister} className={registerActionClass}>
          <Download />
          Descargar y registrar
        </Button>
      </>
    )
  }

  function renderSheet(size: 'panel' | 'wide') {
    if (!selected) return null
    return (
      <QuoteSheetPreview
        size={size}
        tableName={table?.name ?? ''}
        rows={previewRows}
        currentLine={currentPlanSentence(groups)}
        offerLine={offerSentence(selected.name, lines, total)}
        greeting={greeting}
        farewell={farewell}
        addressee={addressee}
        senderName={senderName}
        senderPhone={senderPhone}
        onGreeting={setGreeting}
        onFarewell={setFarewell}
        onAddressee={setAddressee}
        onSenderName={setSenderName}
      />
    )
  }

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-label="Generar propuesta"
      className="absolute inset-y-0 right-0 z-[25] flex w-[min(62rem,calc(100%-12rem))] min-w-0 flex-col overflow-hidden border border-border/60 bg-background text-foreground shadow-xl outline-none lg:w-[min(62rem,calc(100%-26rem))]"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          if (escapeMenuRef.current) return
          e.preventDefault()
          e.stopPropagation()
          dismissTop()
          return
        }
        if (
          e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight' ||
          e.key === 'Home' ||
          e.key === 'End' ||
          (e.key === 'Enter' && (e.ctrlKey || e.metaKey || e.shiftKey))
        ) {
          e.stopPropagation()
        }
      }}
    >
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start border-b border-border/60 bg-background">
        <div className="min-w-0 border-r border-border/40 px-4 py-3">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Generar propuesta</h2>
          <p className="truncate text-xs text-muted-foreground" title={identity}>
            {identity}
          </p>
        </div>
        <div className="flex min-w-0 items-start gap-3 px-4 py-3">
          {selected ? <QuotedPlanTitle plan={selected} lines={lines} /> : <div className="min-w-0 flex-1" />}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Cerrar propuesta"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-r border-border/40 p-4">
          <div className="shrink-0 space-y-3 rounded-xl border border-stone-200/60 bg-amber-50 p-3">
            <div className="space-y-1.5">
              <p className={labelClass}>Contacto</p>
              <p className="break-words text-sm font-semibold leading-snug text-foreground">{razonSocial.trim() || '—'}</p>
              <p className="break-words text-sm text-foreground">{contactName.trim() || '—'}</p>
              <p className={`text-xs ${mutedClass}`}>RUC {ruc.trim() || '—'}</p>
              {contactLine ? <p className={`text-xs ${mutedClass}`}>{contactLine}</p> : null}
            </div>
            <div className="space-y-1.5">
              <p className={labelClass}>Plan actual</p>
              <PlanActualList groups={groups} />
            </div>
          </div>

          <div className="mt-3 flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="shrink-0 space-y-3">
            {isLoading ? (
              <p className={`text-sm ${mutedClass}`}>Cargando planes…</p>
            ) : isError ? (
              <p className="text-sm text-red-700">No se pudo cargar el catálogo de planes.</p>
            ) : tables.length === 0 ? (
              <p className="text-sm text-amber-800">
                {isAdmin ? (
                  <>
                    No hay tablas de planes activas.{' '}
                    <Link to="/imports" className="font-medium text-primary underline">
                      Cargar el catálogo en Importar Datos
                    </Link>
                    .
                  </>
                ) : (
                  'No hay planes de propuesta. Pide a un administrador que active una tabla.'
                )}
              </p>
            ) : !selected ? (
              table && table.plans.length === 0 ? (
                <p className="text-sm text-amber-800">Esta tabla no tiene planes.</p>
              ) : (
                <p className={`text-sm ${mutedClass}`}>Cargando planes…</p>
              )
            ) : (
              <>
                <div className="space-y-1">
                  <label className={labelClass} htmlFor="proposal-table">
                    Tabla de planes
                  </label>
                  <Select
                    value={table?.id ?? ''}
                    onValueChange={setTableId}
                    onOpenChange={(open) => onMenuOpenChange('table', open)}
                  >
                    <SelectTrigger id="proposal-table" className={selectTriggerClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" className="z-[70]">
                      {tables.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                          {item.isPrincipal ? ' · Principal' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className={labelClass} htmlFor="proposal-plan">
                    Plan
                  </label>
                  <Select
                    value={selected.id}
                    onValueChange={selectQuotedPlan}
                    onOpenChange={(open) => onMenuOpenChange('plan', open)}
                  >
                    <SelectTrigger id="proposal-plan" className={selectTriggerClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" className="z-[70]">
                      {plans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name} · {formatSoles(plan.priceSoles)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            </div>

            <div className="mt-auto shrink-0">
              <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 rounded-xl border border-border/60 bg-muted/50 px-3 py-2">
                <div className="space-y-1">
                  <label className={labelClass} htmlFor="proposal-lines">
                    Líneas
                  </label>
                  <input
                    id="proposal-lines"
                    type="number"
                    min={1}
                    max={999}
                    inputMode="numeric"
                    className={`${inputClass} tabular-nums`}
                    value={linesInput}
                    onChange={(e) => setLinesInput(e.target.value)}
                    onBlur={() => setLinesInput(String(lines))}
                  />
                </div>
                <div className="min-w-0 text-right">
                  <p className={labelClass}>Total mensual</p>
                  <p className="text-2xl font-bold tabular-nums tracking-tight text-primary">
                    {selected ? formatSoles(total) : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 min-w-0 space-y-4 overflow-y-auto p-4">
          {selected ? (
            <QuotedPlanFacts key={selected.id} plan={selected} />
          ) : (
            <p className={`text-sm ${mutedClass}`}>Elige un plan para ver la oferta.</p>
          )}

          <div className="space-y-1.5">
            <p className={labelClass}>Comparar planes en PDF</p>
            <p className={`text-xs ${mutedClass}`}>Hasta 3 planes de esta tabla, en el orden del catálogo.</p>
            {compareNotice ? <p className="text-xs text-amber-800">{compareNotice}</p> : null}
            {!selected ? (
              <p className={`text-xs ${mutedClass}`}>Elige un plan para comparar.</p>
            ) : plans.filter((plan) => plan.id !== selected.id).length === 0 ? (
              <p className={`text-xs ${mutedClass}`}>Esta tabla no tiene otros planes para comparar.</p>
            ) : (
              <ul className="max-h-64 space-y-0.5 overflow-y-auto overscroll-contain rounded-xl border border-border/40 bg-muted/20 p-2">
                {plans
                  .filter((plan) => plan.id !== selected.id)
                  .map((plan) => {
                    const checked = comparePlanIds.includes(plan.id)
                    return (
                      <li key={plan.id}>
                        <label
                          className={`flex items-start gap-2 rounded-lg p-1.5 text-sm text-foreground transition-colors hover:bg-muted/50 ${checked ? 'bg-primary/5' : ''}`}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 accent-primary"
                            checked={checked}
                            onChange={(e) => toggleCompare(plan.id, e.target.checked)}
                          />
                          <span className="min-w-0 leading-snug">
                            {plan.name}
                            <span className="font-normal text-muted-foreground"> · {formatSoles(plan.priceSoles)}</span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-border/60 bg-background px-4 py-3">
        {shareEnabled && shareError ? <p className="text-xs text-red-700">{shareError}</p> : null}
        {shareEnabled && !ready && !shareError && draft ? (
          <p className="text-xs text-muted-foreground">Preparando el enlace del PDF…</p>
        ) : null}
        {shareEnabled ? (
          <div className="grid grid-cols-2 gap-2">
            {waHref ? (
              <a
                href={waHref}
                onClick={(e) => {
                  e.preventDefault()
                  void onShare('whatsapp', waHref)
                }}
                className={secondaryBtn}
              >
                <MessageCircle size={15} />
                {sharing === 'whatsapp' ? 'Abriendo…' : 'WhatsApp'}
              </a>
            ) : (
              <button
                type="button"
                disabled
                title={mobile ? 'Preparando el enlace del PDF' : 'El teléfono no es un celular de Perú'}
                className={secondaryBtn}
              >
                <MessageCircle size={15} />
                WhatsApp
              </button>
            )}
            {mailHref ? (
              <a
                href={mailHref}
                onClick={(e) => {
                  e.preventDefault()
                  void onShare('email', mailHref)
                }}
                className={secondaryBtn}
              >
                <Mail size={15} />
                {sharing === 'email' ? 'Abriendo…' : 'Correo'}
              </a>
            ) : (
              <button
                type="button"
                disabled
                title={mail ? 'Preparando el enlace del PDF' : 'Sin correo del contacto'}
                className={secondaryBtn}
              >
                <Mail size={15} />
                Correo
              </button>
            )}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <div className="group relative shrink-0">
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={proposalHint}
              aria-label="Información sobre la entrega de la propuesta"
            >
              <CircleHelp size={16} />
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden w-64 rounded-lg border border-border/60 bg-background px-2.5 py-2 text-left text-xs leading-snug text-muted-foreground shadow-md group-hover:block group-focus-within:block"
            >
              {proposalHint}
            </span>
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSheetOpen(true)}
              disabled={!canOpenSheet}
              className={outlineActionClass}
            >
              <Eye />
              Vista previa
            </Button>
            {downloadActions()}
          </div>
        </div>
      </div>

      {sheetOpen && selected ? (
        <div className="absolute inset-0 z-30 flex min-h-0 flex-col bg-slate-100" role="region" aria-label="Vista previa">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2">
            <button
              ref={previewCloseRef}
              type="button"
              onClick={() => {
                setSheetWide(false)
                setSheetOpen(false)
              }}
              className={slimBtn}
            >
              Cerrar
            </button>
            <button ref={ampliarRef} type="button" onClick={() => setSheetWide(true)} className={slimViewBtn}>
              <Maximize2 size={14} />
              Ampliar
            </button>
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3">{renderSheet('panel')}</div>
          <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 bg-white px-4 py-3">{downloadActions()}</div>
        </div>
      ) : null}

      {sheetWide && selected
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40"
              onMouseDown={() => setSheetWide(false)}
            >
              <div
                ref={wideRef}
                role="dialog"
                aria-modal="true"
                aria-label="Vista previa ampliada"
                tabIndex={-1}
                className="flex h-[min(90vh,calc(100vh-3rem))] w-[min(1100px,calc(100vw-3rem))] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl outline-none"
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key !== 'Escape') return
                  e.preventDefault()
                  e.stopPropagation()
                  dismissTop()
                }}
              >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2">
                  <p className="text-sm font-medium text-slate-800">Vista previa</p>
                  <button type="button" onClick={() => setSheetWide(false)} className={slimBtn} aria-label="Cerrar ampliación">
                    Cerrar
                  </button>
                </div>
                <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-slate-100 p-4">{renderSheet('wide')}</div>
                <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 bg-white px-4 py-3">{downloadActions()}</div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </aside>
  )
}
