import fs from 'fs/promises'
import path from 'path'
import { existsSync } from 'fs'
import { Router, Response, NextFunction } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireTenantIdFromContext } from '../lib/tenantContext'
import { AuthRequest, requireAdmin } from '../middleware/auth'
import { ensureQuoteTemplates } from '../lib/quoteTemplates'
import {
  MAX_PROMO_IMAGES,
  MAX_TEMPLATE_IMAGE_BYTES,
  imageExt,
  quoteTenantRoot,
  resolveQuoteFile,
  toStoredPath,
  unlinkIfPresent,
} from '../lib/quoteFiles'

const router = Router()

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_TEMPLATE_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (imageExt(file.mimetype, file.originalname)) cb(null, true)
    else cb(new Error('Solo se permiten archivos JPG o PNG'))
  },
})

function uploadImage(req: AuthRequest, res: Response, next: NextFunction) {
  imageUpload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next()
      return
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'La imagen debe pesar máximo 5 MB.' })
      return
    }
    if (err instanceof Error && err.message.includes('Solo se permiten archivos')) {
      res.status(400).json({ error: 'Solo se permiten archivos JPG o PNG.' })
      return
    }
    next(err instanceof Error ? err : new Error('No se pudo leer la imagen.'))
  })
}

const textField = (max: number, emptyMessage: string) =>
  z.string().trim().min(1, emptyMessage).max(max)

const createSchema = z.object({
  name: textField(80, 'Escribe un nombre.'),
  greeting: textField(2000, 'Escribe el saludo.'),
  farewell: textField(2000, 'Escribe la despedida.'),
  isDefault: z.boolean().optional(),
})

const patchSchema = z
  .object({
    name: textField(80, 'Escribe un nombre.').optional(),
    greeting: textField(2000, 'Escribe el saludo.').optional(),
    farewell: textField(2000, 'Escribe la despedida.').optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'Nada que actualizar.',
  })

type TemplateRow = {
  id: string
  name: string
  isDefault: boolean
  greeting: string
  farewell: string
  letterheadPath: string | null
  signaturePath: string | null
  createdAt: Date
  updatedAt: Date
  promos: { id: string; sortOrder: number }[]
}

function toDto(row: TemplateRow) {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    greeting: row.greeting,
    farewell: row.farewell,
    hasLetterhead: Boolean(row.letterheadPath),
    hasSignature: Boolean(row.signaturePath),
    promos: [...row.promos]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((promo) => ({ id: promo.id, sortOrder: promo.sortOrder })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const includePromos = { promos: { orderBy: { sortOrder: 'asc' as const } } }

async function loadTemplate(id: string) {
  return prisma.quoteTemplate.findFirst({ where: { id }, include: includePromos })
}

async function saveImage(
  tenantId: string,
  templateId: string,
  name: string,
  buffer: Buffer
): Promise<string> {
  const relative = toStoredPath('uploads', 'quotes', tenantId, 'templates', templateId, name)
  const absolute = resolveQuoteFile(tenantId, relative)
  if (!absolute) throw new Error('Ruta de imagen inválida')
  await fs.mkdir(path.dirname(absolute), { recursive: true })
  await fs.writeFile(absolute, buffer)
  return relative
}

router.get('/', requireAdmin, async (_req: AuthRequest, res: Response) => {
  await ensureQuoteTemplates()
  const rows = await prisma.quoteTemplate.findMany({
    include: includePromos,
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })
  res.json(rows.map(toDto))
})

router.post('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' })
    return
  }
  const count = await prisma.quoteTemplate.count()
  if (count >= 30) {
    res.status(400).json({ error: 'Hay demasiados formatos.' })
    return
  }
  const makeDefault = parsed.data.isDefault === true || count === 0
  if (makeDefault) {
    await prisma.quoteTemplate.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
  }
  const row = await prisma.quoteTemplate.create({
    data: {
      tenantId: requireTenantIdFromContext(),
      name: parsed.data.name,
      greeting: parsed.data.greeting,
      farewell: parsed.data.farewell,
      isDefault: makeDefault,
    },
    include: includePromos,
  })
  res.status(201).json(toDto(row))
})

router.patch('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = patchSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? 'Datos inválidos' })
    return
  }
  const existing = await loadTemplate(req.params.id)
  if (!existing) {
    res.status(404).json({ error: 'Formato no encontrado.' })
    return
  }
  if (parsed.data.isDefault === false) {
    res.status(400).json({ error: 'Elige otro formato como predeterminado.' })
    return
  }
  if (parsed.data.isDefault === true) {
    await prisma.quoteTemplate.updateMany({
      where: { isDefault: true, NOT: { id: existing.id } },
      data: { isDefault: false },
    })
  }
  const row = await prisma.quoteTemplate.update({
    where: { id: existing.id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.greeting !== undefined ? { greeting: parsed.data.greeting } : {}),
      ...(parsed.data.farewell !== undefined ? { farewell: parsed.data.farewell } : {}),
      ...(parsed.data.isDefault === true ? { isDefault: true } : {}),
    },
    include: includePromos,
  })
  res.json(toDto(row))
})

router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const existing = await loadTemplate(req.params.id)
  if (!existing) {
    res.status(404).json({ error: 'Formato no encontrado.' })
    return
  }
  if (existing.isDefault) {
    res.status(400).json({ error: 'Elige otro formato como predeterminado antes de borrar este.' })
    return
  }
  const tenantId = requireTenantIdFromContext()
  await prisma.quoteTemplate.delete({ where: { id: existing.id } })
  await fs.rm(path.join(quoteTenantRoot(tenantId), 'templates', existing.id), { recursive: true, force: true })
  res.status(204).end()
})

router.get('/:id/asset', requireAdmin, async (req: AuthRequest, res: Response) => {
  const slot = req.query.slot
  const template = await loadTemplate(req.params.id)
  if (!template) {
    res.status(404).json({ error: 'Formato no encontrado.' })
    return
  }
  let relative: string | null = null
  if (slot === 'letterhead') relative = template.letterheadPath
  else if (slot === 'signature') relative = template.signaturePath
  else if (slot === 'promo') {
    const promoId = typeof req.query.promoId === 'string' ? req.query.promoId : ''
    relative = template.promos.find((promo) => promo.id === promoId)?.path ?? null
  } else {
    res.status(400).json({ error: 'Imagen no indicada.' })
    return
  }
  const absolute = resolveQuoteFile(requireTenantIdFromContext(), relative)
  if (!absolute || !existsSync(absolute)) {
    res.status(404).json({ error: 'Imagen no encontrada.' })
    return
  }
  res.sendFile(absolute)
})

async function replaceSlot(
  req: AuthRequest,
  res: Response,
  slot: 'letterhead' | 'signature'
) {
  if (!req.file) {
    res.status(400).json({ error: 'Adjunta una imagen en el campo file.' })
    return
  }
  const ext = imageExt(req.file.mimetype, req.file.originalname)
  if (!ext) {
    res.status(400).json({ error: 'Solo se permiten archivos JPG o PNG.' })
    return
  }
  const existing = await loadTemplate(req.params.id)
  if (!existing) {
    res.status(404).json({ error: 'Formato no encontrado.' })
    return
  }
  const tenantId = requireTenantIdFromContext()
  const previous = slot === 'letterhead' ? existing.letterheadPath : existing.signaturePath
  const relative = await saveImage(tenantId, existing.id, `${slot}${ext}`, req.file.buffer)
  const row = await prisma.quoteTemplate.update({
    where: { id: existing.id },
    data: slot === 'letterhead' ? { letterheadPath: relative } : { signaturePath: relative },
    include: includePromos,
  })
  if (previous && previous !== relative) {
    await unlinkIfPresent(resolveQuoteFile(tenantId, previous))
  }
  res.json(toDto(row))
}

router.post('/:id/letterhead', requireAdmin, uploadImage, async (req: AuthRequest, res: Response) => {
  await replaceSlot(req, res, 'letterhead')
})

router.post('/:id/signature', requireAdmin, uploadImage, async (req: AuthRequest, res: Response) => {
  await replaceSlot(req, res, 'signature')
})

router.delete('/:id/letterhead', requireAdmin, async (req: AuthRequest, res: Response) => {
  await clearSlot(req, res, 'letterhead')
})

router.delete('/:id/signature', requireAdmin, async (req: AuthRequest, res: Response) => {
  await clearSlot(req, res, 'signature')
})

async function clearSlot(req: AuthRequest, res: Response, slot: 'letterhead' | 'signature') {
  const existing = await loadTemplate(req.params.id)
  if (!existing) {
    res.status(404).json({ error: 'Formato no encontrado.' })
    return
  }
  const previous = slot === 'letterhead' ? existing.letterheadPath : existing.signaturePath
  const row = await prisma.quoteTemplate.update({
    where: { id: existing.id },
    data: slot === 'letterhead' ? { letterheadPath: null } : { signaturePath: null },
    include: includePromos,
  })
  await unlinkIfPresent(resolveQuoteFile(requireTenantIdFromContext(), previous))
  res.json(toDto(row))
}

router.post('/:id/promos', requireAdmin, uploadImage, async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'Adjunta una imagen en el campo file.' })
    return
  }
  const ext = imageExt(req.file.mimetype, req.file.originalname)
  if (!ext) {
    res.status(400).json({ error: 'Solo se permiten archivos JPG o PNG.' })
    return
  }
  const existing = await loadTemplate(req.params.id)
  if (!existing) {
    res.status(404).json({ error: 'Formato no encontrado.' })
    return
  }
  if (existing.promos.length >= MAX_PROMO_IMAGES) {
    res.status(400).json({ error: 'Este formato ya tiene 4 imágenes de promoción.' })
    return
  }
  const tenantId = requireTenantIdFromContext()
  const promo = await prisma.quoteTemplatePromo.create({
    data: {
      tenantId,
      templateId: existing.id,
      path: 'pending',
      sortOrder: existing.promos.length,
    },
  })
  try {
    const relative = await saveImage(tenantId, existing.id, `promos/${promo.id}${ext}`, req.file.buffer)
    await prisma.quoteTemplatePromo.update({ where: { id: promo.id }, data: { path: relative } })
  } catch (err) {
    await prisma.quoteTemplatePromo.delete({ where: { id: promo.id } }).catch(() => undefined)
    throw err
  }
  const row = await loadTemplate(existing.id)
  res.status(201).json(row ? toDto(row) : null)
})

router.delete('/:id/promos/:promoId', requireAdmin, async (req: AuthRequest, res: Response) => {
  const promo = await prisma.quoteTemplatePromo.findFirst({
    where: { id: req.params.promoId, templateId: req.params.id },
  })
  if (!promo) {
    res.status(404).json({ error: 'Imagen no encontrada.' })
    return
  }
  const tenantId = requireTenantIdFromContext()
  await prisma.quoteTemplatePromo.delete({ where: { id: promo.id } })
  await unlinkIfPresent(resolveQuoteFile(tenantId, promo.path))
  const row = await loadTemplate(req.params.id)
  if (!row) {
    res.status(404).json({ error: 'Formato no encontrado.' })
    return
  }
  res.json(toDto(row))
})

export default router
