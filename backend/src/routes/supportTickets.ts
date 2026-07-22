import path from 'path'
import fs from 'fs/promises'
import { createReadStream, existsSync } from 'fs'
import { Router, Response } from 'express'
import multer from 'multer'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { resolveAdminElevation } from '../lib/adminElevation'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

const TICKET_STATUSES = ['OPEN', 'PENDING', 'CLOSED'] as const
const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH'] as const

const MAX_ATTACHMENTS = 5
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: MAX_ATTACHMENTS },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true)
      return
    }
    cb(new Error('Solo se permiten imágenes JPG, PNG o WEBP'))
  },
})

const structuredFieldsSchema = z.object({
  whatHappened: z.string().trim().min(5, 'Describe qué ocurrió (mín. 5)').max(5000),
  whatExpected: z.string().trim().min(5, 'Describe qué esperabas (mín. 5)').max(5000),
  stepsToReproduce: z.string().trim().min(5, 'Indica pasos a reproducir (mín. 5)').max(5000),
})

const createSchema = z.object({
  subject: z.string().trim().min(3, 'Asunto mínimo 3 caracteres').max(200),
  /** Legacy single body; ignored when structured fields are present. */
  body: z.string().trim().min(5).max(5000).optional(),
  whatHappened: z.string().trim().min(5).max(5000).optional(),
  whatExpected: z.string().trim().min(5).max(5000).optional(),
  stepsToReproduce: z.string().trim().min(5).max(5000).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  context: z.record(z.unknown()).optional(),
})

const patchSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  adminNote: z.string().trim().max(5000).nullable().optional(),
  priority: z.enum(TICKET_PRIORITIES).nullable().optional(),
})

const attachmentSelect = {
  id: true,
  mimeType: true,
  size: true,
  originalName: true,
  createdAt: true,
} as const

const ticketSelect = {
  id: true,
  subject: true,
  body: true,
  status: true,
  priority: true,
  adminNote: true,
  context: true,
  createdAt: true,
  updatedAt: true,
  createdById: true,
  elevatedByAdminId: true,
  createdBy: { select: { id: true, name: true, email: true, role: true } },
  elevatedByAdmin: { select: { id: true, name: true, email: true } },
  attachments: { select: attachmentSelect, orderBy: { createdAt: 'asc' as const } },
} as const

function composeTicketBody(fields: {
  whatHappened: string
  whatExpected: string
  stepsToReproduce: string
}): string {
  return [
    '¿Qué ocurrió?',
    fields.whatHappened,
    '',
    '¿Qué esperabas?',
    fields.whatExpected,
    '',
    'Pasos a reproducir',
    fields.stepsToReproduce,
  ].join('\n')
}

function parseContextField(raw: unknown): Record<string, unknown> | undefined {
  if (raw == null || raw === '') return undefined
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return undefined
    }
  }
  return undefined
}

function extForMime(mime: string): string {
  if (mime === 'image/png') return '.png'
  if (mime === 'image/webp') return '.webp'
  return '.jpg'
}

function resolveBodyAndContext(data: z.infer<typeof createSchema>): {
  body: string
  context: Record<string, unknown>
} {
  const baseContext = { ...(data.context ?? {}) }
  const hasStructured =
    data.whatHappened != null && data.whatExpected != null && data.stepsToReproduce != null

  if (hasStructured) {
    const fields = structuredFieldsSchema.parse({
      whatHappened: data.whatHappened,
      whatExpected: data.whatExpected,
      stepsToReproduce: data.stepsToReproduce,
    })
    return {
      body: composeTicketBody(fields),
      context: {
        ...baseContext,
        whatHappened: fields.whatHappened,
        whatExpected: fields.whatExpected,
        stepsToReproduce: fields.stepsToReproduce,
      },
    }
  }

  if (data.body) {
    return { body: data.body, context: baseContext }
  }

  throw new z.ZodError([
    {
      code: 'custom',
      path: ['whatHappened'],
      message: 'Completa qué ocurrió, qué esperabas y pasos a reproducir',
    },
  ])
}

async function requireTicketAccess(
  req: AuthRequest,
  ticketId: string
): Promise<{ id: string; createdById: string } | null> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, createdById: true },
  })
  if (!ticket) return null
  const isAdmin = req.user!.role === 'ADMIN'
  if (!isAdmin && ticket.createdById !== req.user!.id) return null
  return ticket
}

// GET /api/support-tickets — ADMIN: all tenant; AGENT: own only
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const isAdmin = req.user!.role === 'ADMIN'
  const status = typeof req.query.status === 'string' ? req.query.status : undefined

  const where: Record<string, unknown> = {}
  if (!isAdmin) {
    where.createdById = req.user!.id
  }
  if (status && TICKET_STATUSES.includes(status as (typeof TICKET_STATUSES)[number])) {
    where.status = status
  }

  const tickets = await prisma.supportTicket.findMany({
    where,
    select: ticketSelect,
    orderBy: { createdAt: 'desc' },
    take: 200,
  })

  res.json({ tickets })
})

// POST /api/support-tickets — ADMIN free; AGENT needs valid elevation
// Accepts JSON or multipart (fields + images[]).
router.post(
  '/',
  requireAuth,
  (req, res, next) => {
    upload.array('images', MAX_ATTACHMENTS)(req, res, (err) => {
      if (err) {
        const msg =
          err instanceof multer.MulterError
            ? err.code === 'LIMIT_FILE_SIZE'
              ? 'Cada imagen debe pesar máximo 5 MB'
              : err.code === 'LIMIT_FILE_COUNT'
                ? `Máximo ${MAX_ATTACHMENTS} imágenes`
                : err.message
            : err instanceof Error
              ? err.message
              : 'Error al subir archivos'
        res.status(400).json({ error: msg })
        return
      }
      next()
    })
  },
  async (req: AuthRequest, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? []
    const bodyRaw = { ...req.body } as Record<string, unknown>
    if (typeof bodyRaw.context === 'string') {
      bodyRaw.context = parseContextField(bodyRaw.context)
    }
    if (typeof bodyRaw.priority === 'string' && bodyRaw.priority === '') {
      delete bodyRaw.priority
    }

    const data = createSchema.parse(bodyRaw)
    const { body, context } = resolveBodyAndContext(data)
    const isAdmin = req.user!.role === 'ADMIN'

    let elevatedByAdminId: string | null = null
    if (!isAdmin) {
      const elevation = await resolveAdminElevation(req)
      if (!elevation) {
        res.status(403).json({
          error: 'Se requiere autorización de administrador para crear un ticket de soporte',
          code: 'ADMIN_ELEVATION_REQUIRED',
        })
        return
      }
      elevatedByAdminId = elevation.adminId
    }

    for (const file of files) {
      if (!ALLOWED_MIME.has(file.mimetype)) {
        res.status(400).json({ error: 'Solo se permiten imágenes JPG, PNG o WEBP' })
        return
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        res.status(400).json({ error: 'Cada imagen debe pesar máximo 5 MB' })
        return
      }
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        tenantId: req.tenant!.id,
        subject: data.subject,
        body,
        priority: data.priority ?? 'NORMAL',
        context: context as Prisma.InputJsonValue,
        createdById: req.user!.id,
        elevatedByAdminId,
      },
      select: { id: true },
    })

    if (files.length > 0) {
      const dir = path.join(process.cwd(), 'uploads', 'support', ticket.id)
      await fs.mkdir(dir, { recursive: true })

      for (const file of files) {
        const ext = extForMime(file.mimetype)
        const attachment = await prisma.supportTicketAttachment.create({
          data: {
            tenantId: req.tenant!.id,
            ticketId: ticket.id,
            path: 'pending',
            mimeType: file.mimetype,
            size: file.size,
            originalName: file.originalname?.slice(0, 200) || null,
          },
        })
        const relativePath = path
          .join('uploads', 'support', ticket.id, `${attachment.id}${ext}`)
          .replace(/\\/g, '/')
        const absolutePath = path.join(process.cwd(), relativePath)
        await fs.writeFile(absolutePath, file.buffer)
        await prisma.supportTicketAttachment.update({
          where: { id: attachment.id },
          data: { path: relativePath },
        })
      }
    }

    const full = await prisma.supportTicket.findUnique({
      where: { id: ticket.id },
      select: ticketSelect,
    })

    res.status(201).json(full)
  }
)

// GET /api/support-tickets/:id/attachments/:attachmentId — stream image (auth + access)
router.get(
  '/:id/attachments/:attachmentId',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const ticket = await requireTicketAccess(req, req.params.id)
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' })
      return
    }

    const attachment = await prisma.supportTicketAttachment.findFirst({
      where: {
        id: req.params.attachmentId,
        ticketId: ticket.id,
        tenantId: req.tenant!.id,
      },
    })
    if (!attachment) {
      res.status(404).json({ error: 'Adjunto no encontrado' })
      return
    }

    const absolutePath = path.join(process.cwd(), attachment.path)
    if (!existsSync(absolutePath)) {
      res.status(404).json({ error: 'Archivo no encontrado' })
      return
    }

    res.setHeader('Content-Type', attachment.mimeType)
    res.setHeader('Content-Length', String(attachment.size))
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${(attachment.originalName || attachment.id).replace(/"/g, '')}"`
    )
    res.setHeader('Cache-Control', 'private, max-age=3600')
    createReadStream(absolutePath).pipe(res)
  }
)

// PATCH /api/support-tickets/:id — ADMIN only (status / note)
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  if (req.user!.role !== 'ADMIN') {
    res.status(403).json({ error: 'Acceso restringido a administradores' })
    return
  }

  const data = patchSchema.parse(req.body)
  if (data.status === undefined && data.adminNote === undefined && data.priority === undefined) {
    res.status(400).json({ error: 'Nada que actualizar' })
    return
  }

  const existing = await prisma.supportTicket.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  })
  if (!existing) {
    res.status(404).json({ error: 'Ticket no encontrado' })
    return
  }

  const ticket = await prisma.supportTicket.update({
    where: { id: req.params.id },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.adminNote !== undefined ? { adminNote: data.adminNote } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
    },
    select: ticketSelect,
  })

  res.json(ticket)
})

export default router
