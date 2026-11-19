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
  patchMe,
  type CommercialQuoteDraft,
  type OfferPlan,
} from '../api/client'
import { Button } from './ui/button'
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
  totalCurrentLines,
  type CurrentPlanGroup,
} from '../lib/proposalPlans'
import {
  addMixItem,
  addOtherOriginMixItem,
  applyOriginChip,
  CLARO_RED,
  commitMixItemLines,
  compactOriginShortLabel,
  defaultQuotePlanOrigin,
  discountLabel,
  discountedLineTotal,
  MAX_MIX_UNIQUE_PLANS,
  mixOfferHeader,
  normalizeQuoteDiscountPercent,
  otherQuotePlanOrigin,
  planMixLayout,
  uniqueMixPlanCount,
  QUOTE_EXTRAS_PLACEHOLDER,
  QUOTE_HEADLINE_SUFFIX_DEFAULT,
  QUOTE_MIX_ORIGIN_DISPLAY_ORDER,
  quoteDiscountPercentsFromSettings,
  quotePlanOriginLabel,
  sortQuoteMixRows,
  type MixDraftItem,
  type QuotePlanOrigin,
} from '../lib/quoteSheet'
import { FILE_IN_USE_TOAST, isFileInUseError } from '../lib/downloadFile'
import QuoteSheetPreview from './QuoteSheetPreview'

const NO_PLANS: OfferPlan[] = []

type Line = {
  id: string
  numeroTelefono?: string
  plan?: string
  rentaBasica?: string
  rentaBasicaConDesc?: string
}

type MixItem = MixDraftItem

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

function parseLines(value: string): number {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(999, n)
}

function defaultLineCount(mobileCount: number): number {
  return Math.min(999, Math.max(1, mobileCount || 1))
}

function contractedLinesLabel(count: number): string {
  const lines = formatLineCount(count)
  return count === 1 ? `${lines} contratada` : `${lines} contratadas`
}

function OriginSegment({
  value,
  otherTaken,
  onPick,
}: {
  value: QuotePlanOrigin
  otherTaken: boolean
  onPick: (origin: QuotePlanOrigin) => void
}) {
  const options: { origin: QuotePlanOrigin; label: string }[] = [
    { origin: 'nueva', label: 'Línea nueva' },
    { origin: 'portabilidad', label: 'Portabilidad' },
  ]
  return (
    <div
      role="group"
      aria-label="Modalidad de la fila"
      className="inline-flex h-7 shrink-0 rounded-md border border-border/60 bg-muted/30 p-0.5"
    >
      {options.map((option) => {
        const selected = value === option.origin
        const disabled = !selected && otherTaken
        return (
          <button
            key={option.origin}
            type="button"
            aria-pressed={selected}
            aria-label={selected ? option.label : `Añadir ${option.label}`}
            disabled={disabled}
            onClick={() => {
              if (selected) return
              onPick(option.origin)
            }}
            className={`rounded px-2 text-[10px] font-medium leading-none tracking-tight transition-colors ${
              selected ? 'text-white shadow-sm' : 'text-foreground hover:bg-background disabled:opacity-40'
            }`}
            style={selected ? { backgroundColor: CLARO_RED } : undefined}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function MixLinesInput({
  id,
  value,
  ariaLabel = 'Líneas',
  onValue,
  onCommit,
}: {
  id: string
  value: string
  ariaLabel?: string
  onValue: (value: string) => void
  onCommit: (value: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      el.blur()
      const scroller = el.closest('[data-offer-scroll]')
      if (scroller) scroller.scrollTop += event.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  return (
    <input
      ref={ref}
      id={id}
      type="number"
      min={1}
      max={999}
      inputMode="numeric"
      aria-label={ariaLabel}
      className={`${inputClass} h-7 w-[3.75rem] px-2 tabular-nums`}
      value={value}
      onChange={(e) => onValue(e.target.value)}
      onBlur={() => onCommit(ref.current?.value ?? value)}
    />
  )
}

function PlanActualList({ groups }: { groups: CurrentPlanGroup[] }) {
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin líneas móviles registradas</p>
  }
  return (
    <ul className="max-h-[13rem] overflow-y-auto overscroll-contain">
      {groups.map((group) => {
        const renta = formatCurrentPlanRenta(group)
        const name = group.plan || '—'
        return (
          <li
            key={currentPlanGroupKey(group)}
            className="flex items-start justify-between gap-3 border-b border-stone-200/80 py-1.5 last:border-b-0"
          >
            <span className="min-w-0 flex-1 break-words text-xs leading-snug font-medium text-foreground">
              {name}
              {renta ? <span className="font-normal text-muted-foreground"> · {renta}</span> : null}
            </span>
            <span className="shrink-0 text-right text-xs tabular-nums text-foreground">
              {formatLineCount(group.count)}
            </span>
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
  const { user, updateUser } = useAuth()
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
  const allowedDiscounts = quoteDiscountPercentsFromSettings(quoteSettings?.discountPercents)
  const [tableId, setTableId] = useState('')
  const [items, setItems] = useState<MixItem[]>([])
  const [discountPercent, setDiscountPercent] = useState(0)
  const [mixNotice, setMixNotice] = useState('')
  const [extras, setExtras] = useState('')
  const [headlineSuffix, setHeadlineSuffix] = useState(QUOTE_HEADLINE_SUFFIX_DEFAULT)
  const [seededFor, setSeededFor] = useState('')
  const [phoneModalOpen, setPhoneModalOpen] = useState(false)
  const [phoneDraft, setPhoneDraft] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)
  const [phoneSkipped, setPhoneSkipped] = useState(false)
  const pendingAction = useRef<'sheet' | 'preview' | 'register' | null>(null)
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
  const phoneModalOpenRef = useRef(false)
  const onCloseRef = useRef(onClose)
  const tableSeed = useRef('')
  onRegisteredRef.current = onQuoteRegistered
  sheetOpenRef.current = sheetOpen
  sheetWideRef.current = sheetWide
  phoneModalOpenRef.current = phoneModalOpen
  onCloseRef.current = onClose

  function dismissTop() {
    if (escapeLock.current) return
    escapeLock.current = true
    window.setTimeout(() => {
      escapeLock.current = false
    }, 0)
    if (phoneModalOpenRef.current) {
      setPhoneModalOpen(false)
      pendingAction.current = null
      return
    }
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
    setExtras('')
    setHeadlineSuffix(QUOTE_HEADLINE_SUFFIX_DEFAULT)
    setDiscountPercent(0)
    setPhoneSkipped(false)
    setSeededFor(companyId)
  }, [quoteSettings, companyId, seededFor])

  const allowedDiscountKey = allowedDiscounts.join(',')
  useEffect(() => {
    const allowed = allowedDiscountKey
      ? allowedDiscountKey.split(',').map((item) => Number(item))
      : []
    setDiscountPercent((current) => normalizeQuoteDiscountPercent(current, allowed))
  }, [allowedDiscountKey])

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
    if (!table) {
      if (!tables.length) {
        setItems([])
        tableSeed.current = ''
      }
      return
    }
    const seedLines = String(defaultLineCount(mobileLines.length))
    const seedOrigin = defaultQuotePlanOrigin(mobileLines.length)
    if (tableSeed.current !== table.id) {
      tableSeed.current = table.id
      const first = table.plans[0]
      setItems(first ? [{ planId: first.id, linesInput: seedLines, origin: seedOrigin }] : [])
      setMixNotice('')
      return
    }
    const allowed = new Set(table.plans.map((plan) => plan.id))
    setItems((current) => {
      const next = current.filter((item) => allowed.has(item.planId))
      if (next.length === current.length) return current
      if (next.length === 0) {
        const first = table.plans[0]
        return first ? [{ planId: first.id, linesInput: seedLines, origin: seedOrigin }] : []
      }
      return next
    })
  }, [table, tables.length, mobileLines.length])

  const mixRows = useMemo(() => {
    const planById = new Map(plans.map((plan) => [plan.id, plan]))
    return items.flatMap((item) => {
      const plan = planById.get(item.planId)
      if (!plan) return []
      const lines = parseLines(item.linesInput)
      return [
        {
          id: `${plan.id}:${item.origin}`,
          planId: plan.id,
          origin: item.origin,
          name: plan.name,
          lines,
          priceSoles: plan.priceSoles,
          subtotal: lineTotal(plan.priceSoles, lines),
          benefits: plan.benefits,
          colors: plan.colors,
        },
      ]
    })
  }, [plans, items])

  const hasOffer = mixRows.length > 0
  const listTotal = mixRows.reduce((sum, row) => sum + row.subtotal, 0)
  const total = mixRows.reduce(
    (sum, row) => sum + discountedLineTotal(row.priceSoles, row.lines, discountPercent),
    0,
  )
  const totalLines = mixRows.reduce((sum, row) => sum + row.lines, 0)

  useEffect(() => {
    if (hasOffer) return
    setSheetOpen(false)
    setSheetWide(false)
  }, [hasOffer])

  const groups = useMemo(() => groupCurrentPlans(mobileLines), [mobileLines])
  const currentKey = groups
    .map((group) => `${group.plan}\u0001${group.rentaBasica}\u0001${group.rentaConDesc}\u0001${group.count}`)
    .join('\u0002')
  const mixKey = mixRows.map((row) => `${row.planId}:${row.origin}:${row.lines}`).join('|')

  const draft = useMemo<CommercialQuoteDraft | null>(() => {
    if (!tableId || mixRows.length === 0) return null
    return {
      tableId,
      items: mixRows.map((row) => ({ planId: row.planId, lines: row.lines, origin: row.origin })),
      companyId,
      companyName: razonSocial.trim(),
      contactName: contactName.trim(),
      ruc: ruc.trim(),
      phone: phone.trim(),
      email: email.trim(),
      currentPlans: groups,
      extras,
      headlineSuffix,
      senderName: user?.name?.trim() ?? '',
      discountPercent,
    }
    // currentKey / mixKey are the contents of groups and mixRows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tableId,
    mixKey,
    companyId,
    razonSocial,
    contactName,
    ruc,
    phone,
    email,
    currentKey,
    extras,
    headlineSuffix,
    user?.name,
    discountPercent,
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
  const canOpenSheet = hasOffer

  const previewRows = sortQuoteMixRows(
    mixRows.map((row) => ({
      id: row.id,
      name: row.name,
      lines: row.lines,
      priceSoles: row.priceSoles,
      proposed: false,
      benefits: row.benefits,
      colors: row.colors,
      origin: row.origin,
    })),
  )
  const defaultOrigin = defaultQuotePlanOrigin(mobileLines.length)
  const uniquePlansInMix = uniqueMixPlanCount(items)

  function togglePlan(id: string, checked: boolean) {
    if (!checked) {
      setMixNotice('')
      setItems((current) => current.filter((item) => item.planId !== id))
      return
    }
    setItems((current) => {
      const result = addMixItem(current, id, defaultOrigin)
      setMixNotice(result.notice)
      return result.items
    })
  }

  function setItemLines(planId: string, origin: QuotePlanOrigin, value: string) {
    setItems((current) =>
      current.map((item) =>
        item.planId === planId && item.origin === origin ? { ...item, linesInput: value } : item,
      ),
    )
  }

  function commitItemLines(planId: string, origin: QuotePlanOrigin, value: string) {
    setItems((current) => commitMixItemLines(current, planId, origin, value))
  }

  function pickOriginChip(planId: string, rowOrigin: QuotePlanOrigin, clicked: QuotePlanOrigin) {
    setItems((current) => {
      const result = applyOriginChip(current, planId, rowOrigin, clicked)
      setMixNotice(result.notice)
      return result.items
    })
  }

  function addOtherOrigin(planId: string) {
    setItems((current) => {
      const result = addOtherOriginMixItem(current, planId)
      setMixNotice(result.notice)
      return result.items
    })
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

  async function toastPdfError(err: unknown) {
    if (isFileInUseError(err)) {
      toast.error(FILE_IN_USE_TOAST)
      return
    }
    toast.error(await readApiError(err, 'No se pudo descargar el PDF'))
  }

  async function onPreview() {
    if (!canPreview || !draft) return
    setPreviewing(true)
    try {
      const saved = await downloadCommercialQuotePreview(draft)
      if (saved) toast.success('PDF descargado')
    } catch (err: unknown) {
      await toastPdfError(err)
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
      await toastPdfError(err)
      await refreshCompanyQuotes()
    } finally {
      setDownloading(false)
    }
  }

  function runPendingQuoteAction(action: 'sheet' | 'preview' | 'register') {
    if (action === 'sheet') {
      setSheetOpen(true)
      return
    }
    if (action === 'preview') {
      void onPreview()
      return
    }
    void onDownload()
  }

  function withPhoneGate(action: 'sheet' | 'preview' | 'register') {
    if (user?.phone?.trim() || phoneSkipped) {
      runPendingQuoteAction(action)
      return
    }
    pendingAction.current = action
    setPhoneDraft('')
    setPhoneError('')
    setPhoneModalOpen(true)
  }

  async function savePhoneAndContinue() {
    const digits = peruMobileDigits(phoneDraft)
    if (!digits) {
      setPhoneError('Ingresa un celular de Perú (9 dígitos).')
      return
    }
    setSavingPhone(true)
    try {
      const next = await patchMe({ phone: digits })
      updateUser({ phone: next.phone ?? digits })
      setPhoneModalOpen(false)
      const action = pendingAction.current
      pendingAction.current = null
      if (action) runPendingQuoteAction(action)
    } catch (err: unknown) {
      toast.error(apiError(err, 'No se pudo guardar el celular'))
    } finally {
      setSavingPhone(false)
    }
  }

  function continueWithoutPhone() {
    setPhoneSkipped(true)
    setPhoneModalOpen(false)
    const action = pendingAction.current
    pendingAction.current = null
    if (action) runPendingQuoteAction(action)
  }

  function downloadActions() {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          onClick={() => withPhoneGate('preview')}
          disabled={!canPreview}
          className={outlineActionClass}
        >
          <Download />
          Descargar prueba
        </Button>
        <Button type="button" onClick={() => withPhoneGate('register')} disabled={!canRegister} className={registerActionClass}>
          <Download />
          Descargar y registrar
        </Button>
      </>
    )
  }

  function renderSheet(size: 'panel' | 'wide') {
    if (!hasOffer) return null
    return (
      <QuoteSheetPreview
        size={size}
        companyName={razonSocial}
        ruc={ruc}
        rows={previewRows}
        discountPercent={discountPercent}
        extras={extras}
        headlineSuffix={headlineSuffix}
        senderName={user?.name?.trim() ?? ''}
        senderPhone={senderPhone}
        onExtras={setExtras}
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
          <div className="min-w-0 flex-1 space-y-0.5">
            {hasOffer ? (
              <>
                <p className="text-sm font-semibold leading-snug text-foreground">
                  {mixOfferHeader(uniquePlansInMix, totalLines)}
                </p>
                <p className="text-2xl font-bold tabular-nums tracking-tight text-primary">{formatSoles(total)}</p>
                {discountPercent > 0 ? (
                  <p className="text-xs tabular-nums text-muted-foreground">lista {formatSoles(listTotal)}</p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Elige planes para armar la oferta.</p>
            )}
          </div>
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
              <div className="flex items-baseline justify-between gap-3">
                <p className={labelClass}>Plan actual</p>
                {groups.length > 0 ? (
                  <p className="text-xs tabular-nums text-muted-foreground">
                    {contractedLinesLabel(totalCurrentLines(groups))}
                  </p>
                ) : null}
              </div>
              <PlanActualList groups={groups} />
            </div>
          </div>

          <div className="mt-3 min-w-0 space-y-3">
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
            ) : table && table.plans.length === 0 ? (
              <p className="text-sm text-amber-800">Esta tabla no tiene planes.</p>
            ) : (
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
            )}
          </div>
        </div>

        <div className="min-h-0 min-w-0 space-y-4 overflow-y-auto overscroll-contain p-4" data-offer-scroll>
          <div className="space-y-1.5">
            <div className="flex items-center gap-0.5">
              <p className={labelClass}>Oferta</p>
              <div className="group relative shrink-0">
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Hasta 16 planes, cada uno con sus líneas. Los GB de datos e internet salen solo del grupo elegido (nueva o porta)."
                  aria-label="Información sobre la oferta"
                >
                  <CircleHelp size={16} />
                </button>
                <span
                  role="tooltip"
                  className="pointer-events-none absolute top-full left-0 z-20 mt-1 hidden w-64 rounded-lg border border-border/60 bg-background px-2.5 py-2 text-left text-xs font-normal normal-case tracking-normal leading-snug text-muted-foreground shadow-md group-hover:block group-focus-within:block"
                >
                  Hasta 16 planes, cada uno con sus líneas.
                  <br />
                  Los GB de datos e internet salen solo del grupo elegido (nueva o porta).
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <label className={labelClass} htmlFor="proposal-discount">
                Descuento
              </label>
              <Select
                value={String(discountPercent)}
                onValueChange={(value) => setDiscountPercent(Number(value) || 0)}
                onOpenChange={(open) => onMenuOpenChange('discount', open)}
              >
                <SelectTrigger id="proposal-discount" className={selectTriggerClass}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="z-[70]">
                  <SelectItem value="0">{discountLabel(0)}</SelectItem>
                  {allowedDiscounts.map((pct) => (
                    <SelectItem key={pct} value={String(pct)}>
                      {discountLabel(pct)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {mixNotice ? <p className="text-xs text-amber-800">{mixNotice}</p> : null}
            {plans.length === 0 ? (
              <p className={`text-xs ${mutedClass}`}>Elige una tabla para armar la oferta.</p>
            ) : (
              <ul className="space-y-0.5 rounded-xl border border-border/40 bg-muted/20 p-2">
                {plans.map((plan) => {
                  const planItems = items.filter((row) => row.planId === plan.id)
                  const checked = planItems.length > 0
                  return (
                    <li
                      key={plan.id}
                      className={`rounded-lg p-1.5 text-sm text-foreground transition-colors ${checked ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
                    >
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-primary"
                          checked={checked}
                          disabled={!checked && uniquePlansInMix >= MAX_MIX_UNIQUE_PLANS}
                          onChange={(e) => togglePlan(plan.id, e.target.checked)}
                        />
                        <span className="min-w-0 leading-snug">
                          {plan.name}
                          <span className="font-normal text-muted-foreground"> · {formatSoles(plan.priceSoles)}</span>
                        </span>
                      </label>
                      {checked && planMixLayout(planItems.map((row) => row.origin)) === 'dual' ? (
                        <div className="mt-1.5 ml-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          {QUOTE_MIX_ORIGIN_DISPLAY_ORDER.map((origin, index) => {
                            const item = planItems.find((row) => row.origin === origin)
                            if (!item) return null
                            const subtotal = lineTotal(plan.priceSoles, parseLines(item.linesInput))
                            return (
                              <span key={origin} className="inline-flex items-center gap-1.5">
                                {index > 0 ? (
                                  <span className="text-muted-foreground" aria-hidden="true">
                                    ·
                                  </span>
                                ) : null}
                                <span className="font-semibold tracking-tight text-foreground">
                                  {compactOriginShortLabel(origin)}
                                </span>
                                <MixLinesInput
                                  id={`proposal-lines-${plan.id}-${origin}`}
                                  value={item.linesInput}
                                  ariaLabel={`Líneas ${quotePlanOriginLabel(origin)}`}
                                  onValue={(value) => setItemLines(plan.id, origin, value)}
                                  onCommit={(value) => commitItemLines(plan.id, origin, value)}
                                />
                                <span className="tabular-nums text-muted-foreground">{formatSoles(subtotal)}</span>
                              </span>
                            )
                          })}
                        </div>
                      ) : (
                        planItems.map((item) => {
                          const subtotal = lineTotal(plan.priceSoles, parseLines(item.linesInput))
                          return (
                            <div key={item.origin}>
                              <div className="mt-1.5 ml-6 flex flex-wrap items-center gap-2">
                                <OriginSegment
                                  value={item.origin}
                                  otherTaken={false}
                                  onPick={(origin) => pickOriginChip(plan.id, item.origin, origin)}
                                />
                                <MixLinesInput
                                  id={`proposal-lines-${plan.id}-${item.origin}`}
                                  value={item.linesInput}
                                  onValue={(value) => setItemLines(plan.id, item.origin, value)}
                                  onCommit={(value) => commitItemLines(plan.id, item.origin, value)}
                                />
                                <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                                  {formatSoles(subtotal)}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="ml-6 mt-1 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                                onClick={() => addOtherOrigin(plan.id)}
                              >
                                + {quotePlanOriginLabel(otherQuotePlanOrigin(item.origin))}
                              </button>
                            </div>
                          )
                        })
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="space-y-1 pt-2">
              <label className={labelClass} htmlFor="proposal-headline-suffix">
                Subtítulo
              </label>
              <textarea
                id="proposal-headline-suffix"
                rows={2}
                value={headlineSuffix}
                onChange={(e) => setHeadlineSuffix(e.target.value)}
                placeholder={QUOTE_HEADLINE_SUFFIX_DEFAULT}
                className={`${inputClass} h-auto min-h-[3.5rem] resize-y py-2`}
              />
              <p className={`text-xs ${mutedClass}`}>
                N sale de la oferta. Vacío: solo se imprime N líneas móviles.
              </p>
            </div>
            <div className="space-y-1 pt-2">
              <label className={labelClass} htmlFor="proposal-extras">
                Beneficios adicionales
              </label>
              <textarea
                id="proposal-extras"
                rows={2}
                value={extras}
                onChange={(e) => setExtras(e.target.value)}
                placeholder={QUOTE_EXTRAS_PLACEHOLDER}
                className={`${inputClass} h-auto min-h-[3.5rem] resize-y py-2`}
              />
              <p className={`text-xs ${mutedClass}`}>Vacío: no se imprime este bloque.</p>
            </div>
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
              onClick={() => withPhoneGate('sheet')}
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

      {sheetOpen && hasOffer ? (
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

      {sheetWide && hasOffer
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

      {phoneModalOpen
        ? createPortal(
            <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40" onMouseDown={() => dismissTop()}>
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="quote-phone-title"
                className="w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-border/60 bg-background p-5 text-foreground shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <h2 id="quote-phone-title" className="text-base font-semibold">
                  ¿Agregar tu celular?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Se muestra en el pie como CEL. Si no, la propuesta se genera sin celular.
                </p>
                <label className={`${labelClass} mt-4 block`} htmlFor="quote-agent-phone">
                  Celular
                </label>
                <input
                  id="quote-agent-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={phoneDraft}
                  onChange={(e) => {
                    setPhoneDraft(e.target.value)
                    setPhoneError('')
                  }}
                  placeholder="9 dígitos"
                  className={`${inputClass} mt-1`}
                />
                {phoneError ? <p className="mt-1 text-xs text-red-700">{phoneError}</p> : null}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" onClick={continueWithoutPhone} disabled={savingPhone}>
                    Continuar sin celular
                  </Button>
                  <Button type="button" onClick={() => void savePhoneAndContinue()} disabled={savingPhone}>
                    {savingPhone ? 'Guardando…' : 'Guardar y continuar'}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </aside>
  )
}
