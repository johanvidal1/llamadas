import { Router, Response } from 'express'
import path from 'path'
import multer from 'multer'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { requireTenantIdFromContext } from '../lib/tenantContext'
import { AuthRequest, requireAdmin, requireAuth } from '../middleware/auth'
import {
  OfferPlanWorkbookError,
  normalizeOfferPlanBenefits,
  normalizeOfferPlanColors,
  parseOfferPlanWorkbook,
} from '../lib/offerPlanWorkbook'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ]
    if (allowed.includes(file.mimetype) || /\.xlsx?$/i.test(file.originalname)) {
      cb(null, true)
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'))
    }
  },
})

function toPlanDto(row: {
  id: string
  tableId: string
  name: string
  priceSoles: Prisma.Decimal
  benefits: Prisma.JsonValue
  colors?: Prisma.JsonValue | null
  sortOrder: number
  createdAt: Date
}) {
  return {
    id: row.id,
    tableId: row.tableId,
    name: row.name,
    priceSoles: row.priceSoles.toNumber(),
    benefits: normalizeOfferPlanBenefits(row.benefits),
    colors: normalizeOfferPlanColors(row.colors),
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  }
}

function toTableDto(row: {
  id: string
  name: string
  isActive: boolean
  isPrincipal: boolean
  createdAt: Date
  plans: {
    id: string
    tableId: string
    name: string
    priceSoles: Prisma.Decimal
    benefits: Prisma.JsonValue
    colors?: Prisma.JsonValue | null
    sortOrder: number
    createdAt: Date
  }[]
}) {
  const plans = row.plans.map(toPlanDto)
  return {
    id: row.id,
    name: row.name,
    isActive: row.isActive,
    isPrincipal: row.isPrincipal,
    createdAt: row.createdAt.toISOString(),
    planCount: plans.length,
    plans,
  }
}

const planInclude = {
  plans: { orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }] },
}

function cleanName(raw: string): string {
  return raw.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

function tableDisplayName(typed: unknown, filename: string): string {
  const fromField = typeof typed === 'string' ? cleanName(typed) : ''
  if (fromField) return fromField
  const base = path.basename(filename, path.extname(filename)).replace(/[_]+/g, ' ')
  return cleanName(base) || 'Catálogo'
}

// GET /api/offer-plans — plans from active tables (older callers).
router.get('/', requireAuth, async (_req: AuthRequest, res: Response) => {
  const tables = await prisma.offerPlanTable.findMany({
    where: { isActive: true },
    include: planInclude,
    orderBy: [{ isPrincipal: 'desc' }, { createdAt: 'desc' }],
  })
  const plans = tables.flatMap((table) => table.plans.map(toPlanDto))
  res.json(plans)
})

// GET /api/offer-plans/tables — agents: active only. ?scope=admin returns every table.
router.get('/tables', requireAuth, async (req: AuthRequest, res: Response) => {
  const adminView = req.query.scope === 'admin'
  if (adminView && req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Acceso restringido a administradores' })
    return
  }
  const rows = await prisma.offerPlanTable.findMany({
    where: adminView ? {} : { isActive: true },
    include: planInclude,
    orderBy: [{ isPrincipal: 'desc' }, { createdAt: 'desc' }],
  })
  res.json(rows.map(toTableDto))
})

// PATCH /api/offer-plans/tables/:id — admin marks active and/or principal.
router.patch('/tables/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const isActive = req.body?.isActive
  const isPrincipal = req.body?.isPrincipal
  if (typeof isActive !== 'boolean' && typeof isPrincipal !== 'boolean') {
    res.status(400).json({ error: 'Nada que actualizar.' })
    return
  }
  if (isActive !== undefined && typeof isActive !== 'boolean') {
    res.status(400).json({ error: 'isActive debe ser verdadero o falso.' })
    return
  }
  if (isPrincipal !== undefined && typeof isPrincipal !== 'boolean') {
    res.status(400).json({ error: 'isPrincipal debe ser verdadero o falso.' })
    return
  }

  const existing = await prisma.offerPlanTable.findFirst({ where: { id: req.params.id } })
  if (!existing) {
    res.status(404).json({ error: 'Tabla no encontrada.' })
    return
  }
  if (isPrincipal === false) {
    res.status(400).json({ error: 'Marca otra tabla como principal.' })
    return
  }
  if (isPrincipal === true) {
    await prisma.offerPlanTable.updateMany({
      where: { isPrincipal: true, NOT: { id: existing.id } },
      data: { isPrincipal: false },
    })
    await prisma.offerPlanTable.update({
      where: { id: existing.id },
      data: { isPrincipal: true, isActive: true },
    })
  } else if (isActive === false && existing.isPrincipal) {
    res.status(400).json({
      error: 'Marca otra tabla como principal antes de desactivarla.',
    })
    return
  } else if (typeof isActive === 'boolean') {
    await prisma.offerPlanTable.update({
      where: { id: existing.id },
      data: { isActive },
    })
  }

  const row = await prisma.offerPlanTable.findFirst({
    where: { id: existing.id },
    include: planInclude,
  })
  if (!row) {
    res.status(404).json({ error: 'Tabla no encontrada.' })
    return
  }
  res.json(toTableDto(row))
})

// POST /api/offer-plans/import — admin. Fields: file, optional name.
// Creates a new table. Previous tables and their plans stay.
router.post('/import', requireAdmin, upload.single('file'), async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'Adjunta un archivo Excel en el campo file.' })
    return
  }

  let parsed
  try {
    parsed = parseOfferPlanWorkbook(req.file.buffer)
  } catch (err) {
    if (err instanceof OfferPlanWorkbookError) {
      res.status(400).json({ error: err.message })
      return
    }
    throw err
  }

  const rawName = Array.isArray(req.body?.name) ? req.body.name[0] : req.body?.name
  const name = tableDisplayName(rawName, req.file.originalname)
  const tenantId = requireTenantIdFromContext()
  const existingCount = await prisma.offerPlanTable.count()
  const isFirst = existingCount === 0

  const created = await prisma.offerPlanTable.create({
    data: {
      tenantId,
      name,
      isActive: isFirst,
      isPrincipal: isFirst,
      plans: {
        create: parsed.map((plan) => ({
          tenantId,
          name: plan.name,
          priceSoles: plan.priceSoles.toFixed(2),
          benefits: plan.benefits as unknown as Prisma.InputJsonValue,
          colors: plan.colors as unknown as Prisma.InputJsonValue,
          sortOrder: plan.sortOrder,
        })),
      },
    },
    include: planInclude,
  })

  res.status(201).json(toTableDto(created))
})

export default router
