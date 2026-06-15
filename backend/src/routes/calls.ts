import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

const callSchema = z.object({
  clientId: z.string().min(1),
  contactId: z.string().optional(),
  disposition: z.enum([
    'INTERESTED',
    'NOT_INTERESTED',
    'NO_ANSWER',
    'BUSY',
    'CALLBACK',
    'DO_NOT_CALL',
    'OTHER',
  ]),
  aclaracion: z.string().optional(),
  notes: z.string().optional(),
  callbackDate: z.string().datetime().optional(),
  callbackNotes: z.string().optional(),
})

const dispositionToStatus: Record<string, string> = {
  INTERESTED: 'INTERESTED',
  NOT_INTERESTED: 'NOT_INTERESTED',
  NO_ANSWER: 'IN_PROGRESS',
  BUSY: 'IN_PROGRESS',
  CALLBACK: 'IN_PROGRESS',
  DO_NOT_CALL: 'DO_NOT_CALL',
  OTHER: 'IN_PROGRESS',
}

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

  const callLog = await prisma.callLog.create({
    data: {
      companyId: data.clientId,
      agentId: req.user!.id,
      contactId: data.contactId ?? null,
      disposition: data.disposition,
      aclaracion: data.aclaracion,
      notes: data.notes,
    },
  })

  await prisma.company.update({
    where: { id: data.clientId },
    data: { status: dispositionToStatus[data.disposition] },
  })

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

export default router