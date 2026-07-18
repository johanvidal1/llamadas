import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { incrementDailyMetricsForNewCall } from '../lib/dailyAgentMetrics'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { getAclaracionForDisposition } from '../lib/responseOptions'
import { OPTICK_TENANT_ID } from '../lib/tenant'

const router = Router()

function formatAgendaDateTime(date: Date): string {
  return date.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// GET /api/callbacks
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { agentId, completed, date } = req.query as Record<string, string>

  const where: Record<string, unknown> = {}

  if (req.user!.role === 'AGENT') {
    where.agentId = req.user!.id
  } else if (agentId) {
    where.agentId = agentId
  }

  if (completed !== undefined) {
    where.completed = completed === 'true'
  }

  if (date) {
    const start = new Date(date)
    start.setHours(0, 0, 0, 0)
    const end = new Date(date)
    end.setHours(23, 59, 59, 999)
    where.scheduledAt = { gte: start, lte: end }
  }

  const callbacks = await prisma.callback.findMany({
    where,
    include: {
      company: {
        select: {
          id: true,
          ruc: true,
          razonSocial: true,
          status: true,
          contacts: { select: { nombre: true, tipoContacto: true, telefono: true }, take: 3 },
        },
      },
      callLog: {
        select: {
          contactId: true,
          contact: { select: { id: true, nombre: true, telefono: true, tipoContacto: true } },
        },
      },
      agent: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  })

  res.json(callbacks)
})

// PUT /api/callbacks/:id
router.put('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const schema = z.object({ completed: z.boolean(), notes: z.string().optional() })
  const data = schema.parse(req.body)

  const existing = await prisma.callback.findUnique({
    where: { id: req.params.id },
    include: {
      callLog: { select: { contactId: true } },
      company: { select: { id: true } },
      agent: { select: { id: true } },
    },
  })

  if (!existing) {
    res.status(404).json({ error: 'Callback no encontrado' })
    return
  }

  if (req.user!.role === 'AGENT' && existing.agentId !== req.user!.id) {
    res.status(403).json({ error: 'Sin permiso para modificar este callback' })
    return
  }

  const completingNow = data.completed && !existing.completed

  if (completingNow) {
    const completedAt = new Date()
    const scheduledFormatted = formatAgendaDateTime(existing.scheduledAt)
    const completedFormatted = formatAgendaDateTime(completedAt)

    let contactId = existing.callLog?.contactId ?? null
    if (!contactId) {
      const assignedContact = await prisma.contact.findFirst({
        where: {
          companyId: existing.companyId,
          assignment: { agentId: existing.agentId },
        },
        select: { id: true },
      })
      contactId = assignedContact?.id ?? null
    }

    const callback = await prisma.$transaction(async (tx) => {
      const updated = await tx.callback.update({
        where: { id: existing.id },
        data: {
          completed: true,
          completedAt,
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        },
      })

      const callLog = await tx.callLog.create({
        data: {
          tenantId: OPTICK_TENANT_ID,
          companyId: existing.companyId,
          agentId: existing.agentId,
          contactId,
          disposition: 'AGENDA_COMPLETADA',
          aclaracion: getAclaracionForDisposition('AGENDA_COMPLETADA'),
          notes: `Agenda completada el ${completedFormatted}. Llamada programada para el ${scheduledFormatted}.`,
        },
      })

      return { updated, callLog }
    })

    void incrementDailyMetricsForNewCall(callback.callLog).catch(() => {})
    res.json(callback.updated)
    return
  }

  const callback = await prisma.callback.update({
    where: { id: existing.id },
    data: {
      completed: data.completed,
      completedAt: data.completed ? new Date() : null,
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    },
  })
  res.json(callback)
})

// POST /api/callbacks
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    clientId: z.string().min(1),
    scheduledAt: z.string().datetime(),
    notes: z.string().optional(),
  })
  const data = schema.parse(req.body)

  if (req.user!.role === 'AGENT') {
    const hasAccess = await prisma.contact.findFirst({
      where: {
        companyId: data.clientId,
        assignment: { agentId: req.user!.id },
      },
    })
    if (!hasAccess) {
      res.status(403).json({ error: 'Sin acceso a este contacto' })
      return
    }
  }

  const callback = await prisma.callback.create({
    data: {
      tenantId: OPTICK_TENANT_ID,
      companyId: data.clientId,
      agentId: req.user!.id,
      scheduledAt: new Date(data.scheduledAt),
      notes: data.notes,
    },
    include: {
      company: { select: { ruc: true, razonSocial: true } },
    },
  })
  res.status(201).json(callback)
})

export default router
