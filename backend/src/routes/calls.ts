import { Router, Response } from 'express'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { buildCalledAtRange } from '../lib/callActivity'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { recomputeContactStatus, statusForDisposition } from '../lib/contactStatus'
import {
  ALL_DISPOSITION_CODES,
  CALLBACK_DISPOSITIONS,
  getAclaracionForDisposition,
  isValidDisposition,
  SALES_FUNNEL_DISPOSITIONS,
} from '../lib/responseOptions'

const router = Router()

const callLogInclude = {
  company: { select: { id: true, ruc: true, razonSocial: true } },
  contact: { select: { id: true, nombre: true, tipoContacto: true } },
  agent: { select: { name: true } },
} satisfies Prisma.CallLogInclude

function parseTimeHm(value: string | undefined): number | null {
  if (!value?.trim()) return null
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim())
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function matchesTimeOfDay(calledAt: Date, timeMin: number | null, timeMax: number | null): boolean {
  const mins = calledAt.getHours() * 60 + calledAt.getMinutes()
  if (timeMin != null && mins < timeMin) return false
  if (timeMax != null && mins > timeMax) return false
  return true
}

const dispositionEnum = z.enum(ALL_DISPOSITION_CODES as [string, ...string[]])

function resolveAclaracion(disposition: string, clientAclaracion?: string | null): string | undefined {
  const catalogAclaracion = getAclaracionForDisposition(disposition)
  if (catalogAclaracion) return catalogAclaracion
  return clientAclaracion ?? undefined
}

function requiresCallbackDate(disposition: string): boolean {
  return (CALLBACK_DISPOSITIONS as readonly string[]).includes(disposition)
}

const callSchema = z.object({
  clientId: z.string().min(1),
  contactId: z.string().optional(),
  disposition: dispositionEnum,
  aclaracion: z.string().optional(),
  notes: z.string().optional(),
  callbackDate: z.string().datetime().optional(),
  callbackNotes: z.string().optional(),
})

const updateCallSchema = z.object({
  disposition: dispositionEnum.optional(),
  aclaracion: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  callbackDate: z.string().datetime().optional().nullable(),
  callbackNotes: z.string().optional().nullable(),
})

// GET /api/calls
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const {
    clientId,
    agentId,
    limit = '50',
    from,
    to,
    disposition,
    funnel,
    batchId,
    timeFrom,
    timeTo,
  } = req.query as Record<string, string>

  const take = Math.min(Number(limit) || 50, 200)
  const timeMin = parseTimeHm(timeFrom)
  const timeMax = parseTimeHm(timeTo)
  const hasTimeFilter = timeMin != null || timeMax != null

  const where: Prisma.CallLogWhereInput = {}
  if (req.user!.role === 'AGENT') {
    where.agentId = req.user!.id
  } else if (agentId) {
    where.agentId = agentId
  }
  if (clientId) where.companyId = clientId
  if (batchId) where.company = { importBatchId: batchId }

  const funnelActive = funnel === 'true' || funnel === '1'
  if (funnelActive) {
    where.disposition = { in: [...SALES_FUNNEL_DISPOSITIONS] }
  } else if (disposition && isValidDisposition(disposition)) {
    where.disposition = disposition
  }

  let calledAt = buildCalledAtRange(from, to)
  if (hasTimeFilter && !from && !to) {
    const now = new Date()
    const defaultFrom = new Date()
    defaultFrom.setDate(defaultFrom.getDate() - 30)
    defaultFrom.setHours(0, 0, 0, 0)
    now.setHours(23, 59, 59, 999)
    calledAt = { gte: defaultFrom, lte: now }
  }
  if (calledAt) where.calledAt = calledAt

  if (hasTimeFilter) {
    const candidates = await prisma.callLog.findMany({
      where,
      select: { id: true, calledAt: true },
      orderBy: [{ updatedAt: 'desc' }, { calledAt: 'desc' }],
    })
    const filtered = candidates.filter((row) => matchesTimeOfDay(row.calledAt, timeMin, timeMax))
    const total = filtered.length
    const pageIds = filtered.slice(0, take).map((row) => row.id)
    const calls =
      pageIds.length > 0
        ? await prisma.callLog.findMany({
            where: { id: { in: pageIds } },
            include: callLogInclude,
            orderBy: [{ updatedAt: 'desc' }, { calledAt: 'desc' }],
          })
        : []
    res.json({ calls, total })
    return
  }

  const [calls, total] = await Promise.all([
    prisma.callLog.findMany({
      where,
      include: callLogInclude,
      orderBy: [{ updatedAt: 'desc' }, { calledAt: 'desc' }],
      take,
    }),
    prisma.callLog.count({ where }),
  ])
  res.json({ calls, total })
})

// POST /api/calls
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const data = callSchema.parse(req.body)

  if (!isValidDisposition(data.disposition)) {
    res.status(400).json({ error: 'Disposición no válida' })
    return
  }

  if (requiresCallbackDate(data.disposition) && !data.callbackDate) {
    res.status(400).json({ error: 'Se requiere fecha de callback cuando la respuesta es VOLVER A LLAMAR' })
    return
  }

  if (req.user!.role === 'AGENT') {
    const hasAccess = await prisma.contact.findFirst({
      where: {
        companyId: data.clientId,
        assignment: { agentId: req.user!.id },
        ...(data.contactId ? { id: data.contactId } : {}),
      },
    })
    if (!hasAccess) {
      res.status(403).json({ error: 'Sin acceso a este contacto' })
      return
    }
  }

  let contactId = data.contactId ?? null
  if (!contactId) {
    const companyContacts = await prisma.contact.findMany({
      where: { companyId: data.clientId },
      select: { id: true },
    })
    if (companyContacts.length === 1) {
      contactId = companyContacts[0].id
    }
  }

  const callLog = await prisma.callLog.create({
    data: {
      companyId: data.clientId,
      agentId: req.user!.id,
      contactId,
      disposition: data.disposition,
      aclaracion: resolveAclaracion(data.disposition, data.aclaracion),
      notes: data.notes,
    },
  })

  if (contactId) {
    await recomputeContactStatus(contactId)
  } else {
    const newStatus = statusForDisposition(data.disposition)
    await prisma.company.update({
      where: { id: data.clientId },
      data: { status: newStatus },
    })
  }

  if (data.callbackDate) {
    await prisma.callback.create({
      data: {
        companyId: data.clientId,
        agentId: req.user!.id,
        callLogId: callLog.id,
        scheduledAt: new Date(data.callbackDate),
        notes: data.callbackNotes,
      },
    })
  }

  res.status(201).json(callLog)
})

// PUT /api/calls/:id — update existing call log (agent owner only)
router.put('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const data = updateCallSchema.parse(req.body)

  if (req.user!.role !== 'AGENT') {
    res.status(403).json({ error: 'Solo agentes pueden editar registros de llamada' })
    return
  }

  const hasFieldUpdates =
    data.disposition !== undefined ||
    data.aclaracion !== undefined ||
    data.notes !== undefined ||
    data.callbackDate !== undefined ||
    data.callbackNotes !== undefined

  const existing = await prisma.callLog.findUnique({
    where: { id: req.params.id },
    include: {
      callback: true,
      contact: { include: { assignment: { select: { agentId: true } } } },
    },
  })

  if (!existing) {
    res.status(404).json({ error: 'Registro de llamada no encontrado' })
    return
  }

  if (existing.agentId !== req.user!.id) {
    res.status(403).json({ error: 'Solo el agente que registró la llamada puede editarla' })
    return
  }

  if (existing.contactId) {
    if (existing.contact?.assignment?.agentId !== req.user!.id) {
      res.status(403).json({ error: 'Sin acceso a este contacto' })
      return
    }
  } else {
    const hasAccess = await prisma.contact.findFirst({
      where: {
        companyId: existing.companyId,
        assignment: { agentId: req.user!.id },
      },
    })
    if (!hasAccess) {
      res.status(403).json({ error: 'Sin acceso a este contacto' })
      return
    }
  }

  const effectiveDisposition = data.disposition ?? existing.disposition

  if (data.disposition !== undefined && !isValidDisposition(data.disposition)) {
    res.status(400).json({ error: 'Disposición no válida' })
    return
  }

  if (requiresCallbackDate(effectiveDisposition)) {
    const willHaveCallback =
      data.callbackDate !== undefined
        ? !!data.callbackDate
        : !!existing.callback
    if (!willHaveCallback) {
      res.status(400).json({ error: 'Se requiere fecha de callback cuando la respuesta es VOLVER A LLAMAR' })
      return
    }
  }

  const dispositionChanged = data.disposition !== undefined
  const callLog = await prisma.callLog.update({
    where: { id: existing.id },
    data: hasFieldUpdates
      ? {
          ...(dispositionChanged ? { disposition: data.disposition } : {}),
          ...(dispositionChanged
            ? { aclaracion: resolveAclaracion(data.disposition!, data.aclaracion) }
            : data.aclaracion !== undefined
              ? { aclaracion: resolveAclaracion(existing.disposition, data.aclaracion) }
              : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        }
      : { updatedAt: new Date() },
  })

  if (data.callbackDate !== undefined) {
    if (data.callbackDate) {
      await prisma.callback.upsert({
        where: { callLogId: callLog.id },
        create: {
          companyId: existing.companyId,
          agentId: req.user!.id,
          callLogId: callLog.id,
          scheduledAt: new Date(data.callbackDate),
          notes: data.callbackNotes ?? undefined,
        },
        update: {
          scheduledAt: new Date(data.callbackDate),
          ...(data.callbackNotes !== undefined ? { notes: data.callbackNotes } : {}),
        },
      })
    } else if (existing.callback) {
      await prisma.callback.delete({ where: { id: existing.callback.id } })
    }
  } else if (data.callbackNotes !== undefined && existing.callback) {
    await prisma.callback.update({
      where: { id: existing.callback.id },
      data: { notes: data.callbackNotes },
    })
  }

  if (existing.contactId) {
    await recomputeContactStatus(existing.contactId)
  }

  const updated = await prisma.callLog.findUnique({
    where: { id: callLog.id },
    include: {
      agent: { select: { id: true, name: true } },
      contact: { select: { id: true, nombre: true, tipoContacto: true } },
      callback: true,
    },
  })

  res.json(updated)
})

export default router
