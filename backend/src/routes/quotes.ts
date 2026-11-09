import { existsSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { randomBytes } from 'crypto'
import { Router, Response } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { requireTenantIdFromContext } from '../lib/tenantContext'
import { AuthRequest, requireAdmin, requireAuth } from '../middleware/auth'
import { normalizeOfferPlanBenefits, normalizeOfferPlanColors } from '../lib/offerPlanWorkbook'
import {
  normalizeQuotePlanRows,
  quoteLineTotal,
  quotePdfFilename,
  renderQuotePdf,
  type QuotePdfBenefit,
  type QuotePdfCurrentPlan,
  type QuotePdfPlanRow,
} from '../lib/quotePdf'
import { resolveQuoteFile, toStoredPath } from '../lib/quoteFiles'
import { getDefaultQuoteTemplate } from '../lib/quoteTemplates'

const router = Router()

const currentPlanSchema = z.object({
  plan: z.string().trim().max(200).optional().default(''),
  rentaBasica: z.string().trim().max(80).optional().default(''),
  rentaConDesc: z.string().trim().max(80).optional().default(''),
  count: z.number().int().min(1).max(9999),
})

const createSchema = z.object({
  tableId: z.string().trim().min(1, 'Elige una tabla de planes.'),
  planId: z.string().trim().min(1, 'Elige un plan.'),
  comparePlanIds: z.array(z.string().trim().min(1).max(64)).max(3).optional().default([]),
  lines: z.number().int().min(1).max(999),
  companyId: z.string().trim().max(64).optional().default(''),
  companyName: z.string().trim().max(300).optional().default(''),
  contactName: z.string().trim().max(200).optional().default(''),
  ruc: z.string().trim().max(20).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  email: z.string().trim().max(200).optional().default(''),
  currentPlans: z.array(currentPlanSchema).max(40).optional().default([]),
  greeting: z.string().trim().max(2000).optional(),
  farewell: z.string().trim().max(2000).optional(),
  senderName: z.string().trim().max(120).optional(),
})

const settingsSchema = z
  .object({
    shareEnabled: z.boolean(),
  })
  .strict()

const shareSchema = z.object({
  channel: z.enum(['whatsapp', 'email']),
})

const TOKEN_RE = /^[A-Za-z0-9_-]{20,200}$/
const VISIBLE_STATUSES = ['GENERADA', 'COMPARTIDA', 'VISTA'] as const

function quoteStatusLabel(status: string): string {
  if (status === 'COMPARTIDA') return 'Propuesta enviada'
  if (status === 'VISTA') return 'Vista por el cliente'
  if (status === 'GENERADA') return 'Generada'
  return 'Generada'
}

function statusAfterDownload(current: string): string {
  if (current === 'VISTA' || current === 'COMPARTIDA') return current
  return 'GENERADA'
}

function sendPdf(
  res: Response,
  absolute: string,
  disposition: 'inline' | 'attachment',
  filename = 'Propuesta-Optick.pdf'
) {
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`)
  res.sendFile(absolute)
}

function stringList(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function normalizeCurrentPlans(value: Prisma.JsonValue): QuotePdfCurrentPlan[] {
  if (!Array.isArray(value)) return []
  const plans: QuotePdfCurrentPlan[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const row = item as Record<string, unknown>
    const count = typeof row.count === 'number' ? row.count : Number(row.count)
    if (!Number.isFinite(count) || count < 1) continue
    plans.push({
      plan: typeof row.plan === 'string' ? row.plan : '',
      rentaBasica: typeof row.rentaBasica === 'string' ? row.rentaBasica : '',
      rentaConDesc: typeof row.rentaConDesc === 'string' ? row.rentaConDesc : '',
      count: Math.min(9999, Math.round(count)),
    })
  }
  return plans
}

type StoredQuote = {
  id: string
  pdfPath: string
  status: string
  planName: string
  priceSoles: Prisma.Decimal
  lines: number
  totalSoles: Prisma.Decimal
  benefits: Prisma.JsonValue
  planRows: Prisma.JsonValue
  currentPlans: Prisma.JsonValue
  companyName: string
  contactName: string
  ruc: string
  phone: string
  email: string
  greeting: string
  farewell: string
  tableName: string
  senderName: string
  senderPhone: string
  letterheadPath: string | null
  signaturePath: string | null
  promoPaths: Prisma.JsonValue
}

function rowsFromQuote(quote: StoredQuote): QuotePdfPlanRow[] {
  const stored = normalizeQuotePlanRows(quote.planRows)
  if (stored.length) return stored
  return [
    {
      name: quote.planName,
      priceSoles: quote.priceSoles.toNumber(),
      lines: quote.lines,
      monthlySoles: quote.totalSoles.toNumber(),
      proposed: true,
      benefits: normalizeOfferPlanBenefits(quote.benefits),
      colors: null,
    },
  ]
}

async function renderStoredQuote(quote: StoredQuote, tenantId: string): Promise<Buffer> {
  const rows = rowsFromQuote(quote)
  const proposed = rows.find((row) => row.proposed) ?? rows[0]
  const benefits: QuotePdfBenefit[] = proposed?.benefits ?? normalizeOfferPlanBenefits(quote.benefits)
  const promoPaths = stringList(quote.promoPaths)
    .map((relative) => resolveQuoteFile(tenantId, relative))
    .filter((file): file is string => Boolean(file))
  return renderQuotePdf({
    greeting: quote.greeting,
    farewell: quote.farewell,
    companyName: quote.companyName,
    contactName: quote.contactName,
    ruc: quote.ruc,
    phone: quote.phone,
    email: quote.email,
    currentPlans: normalizeCurrentPlans(quote.currentPlans),
    planName: proposed?.name ?? quote.planName,
    priceSoles: proposed?.priceSoles ?? quote.priceSoles.toNumber(),
    lines: proposed?.lines ?? quote.lines,
    totalSoles: proposed?.monthlySoles ?? quote.totalSoles.toNumber(),
    benefits,
    planRows: rows,
    tableName: quote.tableName,
    senderName: quote.senderName,
    senderPhone: quote.senderPhone,
    letterheadPath: resolveQuoteFile(tenantId, quote.letterheadPath),
    signaturePath: resolveQuoteFile(tenantId, quote.signaturePath),
    promoPaths,
  })
}

async function readShareEnabled(): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: requireTenantIdFromContext() },
    select: { quoteShareEnabled: true },
  })
  return tenant?.quoteShareEnabled === true
}

function snapshotPlan(
  plan: {
    name: string
    priceSoles: Prisma.Decimal
    benefits: Prisma.JsonValue
    colors?: Prisma.JsonValue | null
  },
  lines: number,
  proposed: boolean
): QuotePdfPlanRow {
  const price = plan.priceSoles.toNumber()
  const rowLines = proposed ? lines : 1
  return {
    name: plan.name,
    priceSoles: price,
    lines: rowLines,
    monthlySoles: quoteLineTotal(price, rowLines),
    proposed,
    benefits: normalizeOfferPlanBenefits(plan.benefits),
    colors: normalizeOfferPlanColors(plan.colors),
  }
}

async function senderForQuote(userId: string | undefined, typedName: string | undefined) {
  const user = userId
    ? await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, phone: true },
      })
    : null
  return {
    senderName: (typedName ?? '').trim() || user?.name?.trim() || '',
    senderPhone: user?.phone?.trim() || '',
  }
}

// GET /api/quotes/public/:token — customer opens the PDF. First open marks Vista. Does not rewrite the file.
router.get('/public/:token', async (req: AuthRequest, res: Response) => {
  const token = req.params.token
  if (!TOKEN_RE.test(token)) {
    res.status(404).json({ error: 'Propuesta no encontrada' })
    return
  }
  const quote = await prisma.commercialQuote.findFirst({ where: { token } })
  if (!quote || quote.pdfPath === 'pending') {
    res.status(404).json({ error: 'Propuesta no encontrada' })
    return
  }
  const absolute = resolveQuoteFile(requireTenantIdFromContext(), quote.pdfPath)
  if (!absolute || !existsSync(absolute)) {
    res.status(404).json({ error: 'Propuesta no encontrada' })
    return
  }
  if (!quote.viewedAt) {
    await prisma.commercialQuote.updateMany({
      where: { id: quote.id, viewedAt: null },
      data: { status: 'VISTA', viewedAt: new Date() },
    })
  }
  sendPdf(res, absolute, 'inline')
})

// GET /api/quotes/settings — any signed-in user can read. Agents cannot change it.
router.get('/settings', requireAuth, async (_req: AuthRequest, res: Response) => {
  const shareEnabled = await readShareEnabled()
  const template = await getDefaultQuoteTemplate()
  res.json({
    shareEnabled,
    greeting: template?.greeting ?? '',
    farewell: template?.farewell ?? '',
  })
})

// PATCH /api/quotes/settings — admin only.
router.patch('/settings', requireAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = settingsSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' })
    return
  }
  const tenantId = requireTenantIdFromContext()
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { quoteShareEnabled: parsed.data.shareEnabled },
  })
  res.json({ shareEnabled: parsed.data.shareEnabled })
})

// GET /api/quotes?companyId= — admin-only history. Agents must not see generated quotes.
router.get('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const companyId = typeof req.query.companyId === 'string' ? req.query.companyId.trim() : ''
  if (!companyId) {
    res.status(400).json({ error: 'Falta la empresa.' })
    return
  }
  const rows = await prisma.commercialQuote.findMany({
    where: { companyId, status: { in: [...VISIBLE_STATUSES] } },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: {
      id: true,
      createdAt: true,
      planName: true,
      lines: true,
      totalSoles: true,
      status: true,
    },
  })
  res.json({
    quotes: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      planName: row.planName,
      lines: row.lines,
      totalSoles: row.totalSoles.toNumber(),
      status: row.status,
      statusLabel: quoteStatusLabel(row.status),
    })),
  })
})

// POST /api/quotes/:id/share — admin only; share stays off unless the tenant switch is on.
router.post('/:id/share', requireAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = shareSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Canal inválido' })
    return
  }
  if (!(await readShareEnabled())) {
    res.status(403).json({ error: 'Compartir por WhatsApp y correo está desactivado.' })
    return
  }
  const quote = await prisma.commercialQuote.findFirst({ where: { id: req.params.id } })
  if (!quote || quote.pdfPath === 'pending') {
    res.status(404).json({ error: 'Propuesta no encontrada' })
    return
  }
  if (quote.status !== 'VISTA') {
    await prisma.commercialQuote.update({
      where: { id: quote.id },
      data: {
        status: 'COMPARTIDA',
        sharedAt: quote.sharedAt ?? new Date(),
      },
    })
  }
  const status = quote.status === 'VISTA' ? 'VISTA' : 'COMPARTIDA'
  res.json({ status, statusLabel: quoteStatusLabel(status) })
})

// GET /api/quotes/:id/pdf — rewrite the file from the snapshot, then download. Admin only.
router.get('/:id/pdf', requireAdmin, async (req: AuthRequest, res: Response) => {
  const quote = await prisma.commercialQuote.findFirst({ where: { id: req.params.id } })
  if (!quote) {
    res.status(404).json({ error: 'Propuesta no encontrada' })
    return
  }
  const tenantId = requireTenantIdFromContext()
  let pdf: Buffer
  try {
    pdf = await renderStoredQuote(quote, tenantId)
  } catch (err) {
    console.error('[quote pdf regenerate]', err)
    res.status(500).json({ error: 'No se pudo generar el PDF.' })
    return
  }
  const relative =
    quote.pdfPath && quote.pdfPath !== 'pending'
      ? quote.pdfPath
      : toStoredPath('uploads', 'quotes', tenantId, 'pdfs', `${quote.id}.pdf`)
  const absolute = resolveQuoteFile(tenantId, relative)
  if (!absolute) {
    res.status(500).json({ error: 'No se pudo guardar el PDF.' })
    return
  }
  try {
    await fs.mkdir(path.dirname(absolute), { recursive: true })
    await fs.writeFile(absolute, pdf)
    await prisma.commercialQuote.update({
      where: { id: quote.id },
      data: {
        pdfPath: relative,
        status: statusAfterDownload(quote.status),
        downloadedAt: new Date(),
      },
    })
  } catch (err) {
    console.error('[quote pdf rewrite]', err)
    res.status(500).json({ error: 'No se pudo guardar el PDF.' })
    return
  }
  sendPdf(res, absolute, 'attachment', quotePdfFilename(quote.ruc, quote.planName, false))
})

class QuoteRequestError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type QuoteDraftBody = z.infer<typeof createSchema>

/** Same renderer as a saved quote. Does not insert a row or write a file. */
async function buildQuotePdf(body: QuoteDraftBody, tenantId: string, userId: string | undefined) {
  if (body.companyId) {
    const company = await prisma.company.findFirst({
      where: { id: body.companyId },
      select: { id: true },
    })
    if (!company) throw new QuoteRequestError(400, 'Empresa no encontrada.')
  }

  const table = await prisma.offerPlanTable.findFirst({
    where: { id: body.tableId, isActive: true },
  })
  if (!table) throw new QuoteRequestError(400, 'Esa tabla no está activa.')

  const plan = await prisma.offerPlan.findFirst({
    where: { id: body.planId, tableId: table.id },
  })
  if (!plan) throw new QuoteRequestError(400, 'El plan no pertenece a la tabla elegida.')

  const compareIds = [...new Set(body.comparePlanIds.filter((id) => id !== plan.id))]
  const comparePlans = compareIds.length
    ? await prisma.offerPlan.findMany({
        where: { id: { in: compareIds }, tableId: table.id },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      })
    : []
  if (comparePlans.length !== compareIds.length) {
    throw new QuoteRequestError(400, 'Los planes de comparación deben ser de la misma tabla activa.')
  }

  const template = await getDefaultQuoteTemplate()
  if (!template) throw new QuoteRequestError(500, 'No hay un formato de propuesta.')

  const ordered = [plan, ...comparePlans].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es')
  )
  const planRows = ordered.map((item) => snapshotPlan(item, body.lines, item.id === plan.id))
  const main = planRows.find((row) => row.proposed) ?? planRows[0]
  const benefits = main.benefits
  const promoPaths = template.promos.map((promo) => promo.path)
  const greeting = body.greeting !== undefined ? body.greeting : template.greeting
  const farewell = body.farewell !== undefined ? body.farewell : template.farewell
  const sender = await senderForQuote(userId, body.senderName)

  let pdf: Buffer
  try {
    pdf = await renderQuotePdf({
      greeting,
      farewell,
      companyName: body.companyName,
      contactName: body.contactName,
      ruc: body.ruc,
      phone: body.phone,
      email: body.email,
      currentPlans: body.currentPlans,
      planName: main.name,
      priceSoles: main.priceSoles,
      lines: main.lines,
      totalSoles: main.monthlySoles,
      benefits,
      planRows,
      tableName: table.name,
      senderName: sender.senderName,
      senderPhone: sender.senderPhone,
      letterheadPath: resolveQuoteFile(tenantId, template.letterheadPath),
      signaturePath: resolveQuoteFile(tenantId, template.signaturePath),
      promoPaths: promoPaths
        .map((relative) => resolveQuoteFile(tenantId, relative))
        .filter((file): file is string => Boolean(file)),
    })
  } catch (err) {
    console.error('[quote pdf]', err)
    throw new QuoteRequestError(500, 'No se pudo generar el PDF.')
  }

  return { pdf, table, template, planRows, main, benefits, promoPaths, greeting, farewell, sender }
}

function sendQuoteError(res: Response, err: unknown) {
  if (err instanceof QuoteRequestError) {
    res.status(err.status).json({ error: err.message })
    return
  }
  console.error('[quote pdf]', err)
  res.status(500).json({ error: 'No se pudo generar el PDF.' })
}

// POST /api/quotes/preview — same PDF as a real quote, streamed. Admin only; no row and no stored file.
router.post('/preview', requireAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' })
    return
  }
  const tenantId = requireTenantIdFromContext()
  try {
    const built = await buildQuotePdf(parsed.data, tenantId, req.user?.id)
    const filename = quotePdfFilename(parsed.data.ruc, built.main.name, true)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.send(built.pdf)
  } catch (err) {
    sendQuoteError(res, err)
  }
})

// POST /api/quotes — snapshot the chosen rows. Admin only. The PDF is regenerated on download.
router.post('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' })
    return
  }
  const body = parsed.data
  const tenantId = requireTenantIdFromContext()

  let built: Awaited<ReturnType<typeof buildQuotePdf>>
  try {
    built = await buildQuotePdf(body, tenantId, req.user?.id)
  } catch (err) {
    sendQuoteError(res, err)
    return
  }

  const { table, template, planRows, main, benefits, promoPaths, pdf, greeting, farewell, sender } = built
  const token = randomBytes(32).toString('base64url')

  const quote = await prisma.commercialQuote.create({
    data: {
      tenantId,
      token,
      tableId: table.id,
      templateId: template.id,
      companyId: body.companyId || null,
      planName: main.name,
      priceSoles: main.priceSoles.toFixed(2),
      lines: main.lines,
      totalSoles: main.monthlySoles.toFixed(2),
      benefits: benefits as Prisma.InputJsonValue,
      planRows: planRows as unknown as Prisma.InputJsonValue,
      currentPlans: body.currentPlans as Prisma.InputJsonValue,
      companyName: body.companyName,
      contactName: body.contactName,
      ruc: body.ruc,
      phone: body.phone,
      email: body.email,
      greeting,
      farewell,
      tableName: table.name,
      senderName: sender.senderName,
      senderPhone: sender.senderPhone,
      pdfPath: 'pending',
      letterheadPath: template.letterheadPath,
      signaturePath: template.signaturePath,
      promoPaths: promoPaths as Prisma.InputJsonValue,
      status: 'BORRADOR',
      createdById: req.user?.id ?? null,
    },
  })

  const relative = toStoredPath('uploads', 'quotes', tenantId, 'pdfs', `${quote.id}.pdf`)
  const absolute = resolveQuoteFile(tenantId, relative)
  if (!absolute) {
    await prisma.commercialQuote.delete({ where: { id: quote.id } })
    res.status(500).json({ error: 'No se pudo guardar el PDF.' })
    return
  }

  try {
    await fs.mkdir(path.dirname(absolute), { recursive: true })
    await fs.writeFile(absolute, pdf)
    await prisma.commercialQuote.update({
      where: { id: quote.id },
      data: { pdfPath: relative },
    })
  } catch (err) {
    await unlinkQuiet(absolute)
    await prisma.commercialQuote.delete({ where: { id: quote.id } }).catch(() => undefined)
    console.error('[quote pdf write]', err)
    res.status(500).json({ error: 'No se pudo guardar el PDF.' })
    return
  }

  res.status(201).json({
    id: quote.id,
    token,
    planName: main.name,
    lines: main.lines,
    totalSoles: main.monthlySoles,
  })
})

async function unlinkQuiet(absolute: string) {
  try {
    await fs.unlink(absolute)
  } catch {
    /* the row delete is the cleanup that matters */
  }
}

export default router
