import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { dispositionToStatus, recomputeContactStatus } from '../lib/contactStatus'

const router = Router()

const dispositionEnum = z.enum([
  'INTERESTED',
  'NOT_INTERESTED',
  'NO_ANSWER',
  'BUSY',
  'CALLBACK',
  'DO_NOT_CALL',
  'OTHER',
])

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
  const { clientId, agentId, limit = '50' } = req.query as Record<string, string>

  const where: Record<string, unknown> = {}
  if (req.user!.role === 'AGENT') {
    where.agentId = req.user!.id
  } else if (agentId) {
    where.agentId = agentId
  }
  if (clientId) where.companyId = clientId

  const logs = await prisma.callLog.findMany({
    where,
    include: {
      company: { select: { ruc: true, razonSocial: true } },
      contact: { select: { nombre: true, tipoContacto: true } },
      agent: { select: { name: true } },
    },
    orderBy: { calledAt: 'desc' },
    take: Math.min(Number(limit) || 50, 200),
  })
  res.json(logs)
})

// POST /api/calls
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const data = callSchema.parse(req.body)

  if (data.disposition === 'CALLBACK' && !data.callbackDate) {
    res.status(400).json({ error: 'Se requiere fecha de callback cuando la disposición es CALLBACK' })
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
      aclaracion: data.aclaracion,
      notes: data.notes,
    },
  })

  if (contactId) {
    await recomputeContactStatus(contactId)
  } else {
    const newStatus = dispositionToStatus[data.disposition]
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

  if (!hasFieldUpdates) {
    res.status(400).json({ error: 'No hay campos para actualizar' })
    return
  }

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

  if (effectiveDisposition === 'CALLBACK') {
    const willHaveCallback =
      data.callbackDate !== undefined
        ? !!data.callbackDate
        : !!existing.callback
    if (!willHaveCallback) {
      res.status(400).json({ error: 'Se requiere fecha de callback cuando la disposición es CALLBACK' })
      return
    }
  }

  const callLog = await prisma.callLog.update({
    where: { id: existing.id },
    data: {
      ...(data.disposition !== undefined ? { disposition: data.disposition } : {}),
      ...(data.aclaracion !== undefined ? { aclaracion: data.aclaracion } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    },
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
