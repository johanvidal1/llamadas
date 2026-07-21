import { Router, Response } from 'express'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { dateLabelEs } from '../lib/dateLabelEs'
import { AuthRequest, requireAdmin, requireSystemOwner } from '../middleware/auth'

const router = Router()

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (usa YYYY-MM-DD)')

const itemsSchema = z.array(z.string().trim().min(1).max(2000)).min(1).max(50)

const createSchema = z.object({
  date: isoDateSchema,
  dateLabel: z.string().trim().min(1).max(120).optional(),
  items: itemsSchema,
})

const updateSchema = z
  .object({
    date: isoDateSchema.optional(),
    dateLabel: z.string().trim().min(1).max(120).optional(),
    items: itemsSchema.optional(),
  })
  .refine((body) => body.date != null || body.dateLabel != null || body.items != null, {
    message: 'Nada que actualizar',
  })

function asStringItems(items: Prisma.JsonValue): string[] {
  if (!Array.isArray(items)) return []
  return items.filter((x): x is string => typeof x === 'string')
}

function toDto(row: {
  id: string
  date: string
  dateLabel: string
  items: Prisma.JsonValue
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: row.id,
    date: row.date,
    dateLabel: row.dateLabel,
    items: asStringItems(row.items),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// GET /api/release-notes — admins (Dashboard Novedades); agents get 403 via requireAdmin
router.get('/', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const rows = await prisma.releaseNote.findMany({
    orderBy: { date: 'desc' },
  })
  res.json(rows.map(toDto))
})

// POST /api/release-notes — system owner only
router.post('/', requireSystemOwner, async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' })
    return
  }
  const { date, items } = parsed.data
  let dateLabel = parsed.data.dateLabel
  try {
    dateLabel = dateLabel ?? dateLabelEs(date)
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Fecha inválida' })
    return
  }

  try {
    const row = await prisma.releaseNote.create({
      data: {
        date,
        dateLabel,
        items,
        createdById: req.user!.id,
      },
    })
    res.status(201).json(toDto(row))
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ error: `Ya existe una novedad para la fecha ${date}` })
      return
    }
    throw err
  }
})

// PATCH /api/release-notes/:id — system owner only
router.patch('/:id', requireSystemOwner, async (req: AuthRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos inválidos' })
    return
  }

  const existing = await prisma.releaseNote.findUnique({ where: { id: req.params.id } })
  if (!existing) {
    res.status(404).json({ error: 'Novedad no encontrada' })
    return
  }

  const data: {
    date?: string
    dateLabel?: string
    items?: string[]
  } = {}

  if (parsed.data.date != null) data.date = parsed.data.date
  if (parsed.data.items != null) data.items = parsed.data.items

  if (parsed.data.dateLabel != null) {
    data.dateLabel = parsed.data.dateLabel
  } else if (parsed.data.date != null && parsed.data.date !== existing.date) {
    try {
      data.dateLabel = dateLabelEs(parsed.data.date)
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Fecha inválida' })
      return
    }
  }

  try {
    const row = await prisma.releaseNote.update({
      where: { id: req.params.id },
      data,
    })
    res.json(toDto(row))
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ error: `Ya existe una novedad para la fecha ${data.date}` })
      return
    }
    throw err
  }
})

// DELETE /api/release-notes/:id — system owner only
router.delete('/:id', requireSystemOwner, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.releaseNote.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      res.status(404).json({ error: 'Novedad no encontrada' })
      return
    }
    throw err
  }
})

export default router
