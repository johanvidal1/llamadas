import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAdmin, AuthRequest } from '../middleware/auth'
import {
  AgentResetBlockedError,
  buildAgentResetPreview,
  executeAgentReset,
} from '../lib/agentReset'

const router = Router()

const resetAgentSchema = z.object({
  confirm: z.literal('RESETEAR'),
  deletePendingCallbacks: z.boolean().default(true),
  reason: z.string().max(500).optional(),
})

// POST /api/admin/reset-campaign
// Deletes ALL campaign data (clients, imports, calls, callbacks, assignments)
// but keeps User accounts intact.
// Requires body: { confirm: "RESETEAR" }
router.post('/reset-campaign', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { confirm } = req.body as { confirm?: string }

  if (confirm !== 'RESETEAR') {
    res.status(400).json({
      error: 'Confirmación inválida. Envía { "confirm": "RESETEAR" } para proceder.',
    })
    return
  }

  // Delete in FK-safe order
  const [callbacks, callLogs, assignments, , companies, batches] = await prisma.$transaction([
    prisma.callback.deleteMany(),
    prisma.callLog.deleteMany(),
    prisma.assignment.deleteMany(),
    prisma.contact.deleteMany(),
    prisma.company.deleteMany(),
    prisma.importBatch.deleteMany(),
  ])

  res.json({
    message: 'Base de datos de campaña reseteada. Los usuarios se mantienen intactos.',
    deleted: {
      callbacks: callbacks.count,
      callLogs: callLogs.count,
      assignments: assignments.count,
      companies: companies.count,
      importBatches: batches.count,
    },
  })
})

// GET /api/admin/reset-campaign/preview — returns counts before reset
router.get('/reset-campaign/preview', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const [callbacks, callLogs, assignments, clients, batches, users] = await Promise.all([
    prisma.callback.count(),
    prisma.callLog.count(),
    prisma.assignment.count(),
    prisma.company.count(),
    prisma.importBatch.count(),
    prisma.user.count(),
  ])

  res.json({ callbacks, callLogs, assignments, companies: clients, importBatches: batches, users })
})

// GET /api/admin/agents/:id/reset-preview
router.get('/agents/:id/reset-preview', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const preview = await buildAgentResetPreview(req.params.id)
    res.json(preview)
  } catch (err) {
    if (err instanceof AgentResetBlockedError) {
      res.status(400).json({ error: err.message })
      return
    }
    throw err
  }
})

// POST /api/admin/agents/:id/reset
router.post('/agents/:id/reset', requireAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = resetAgentSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({
      error: 'Confirmación inválida. Envía { "confirm": "RESETEAR", "deletePendingCallbacks": true }.',
    })
    return
  }

  try {
    const result = await executeAgentReset(req.params.id, req.user!.id, {
      deletePendingCallbacks: parsed.data.deletePendingCallbacks,
      reason: parsed.data.reason,
    })
    res.json(result)
  } catch (err) {
    if (err instanceof AgentResetBlockedError) {
      res.status(400).json({ error: err.message })
      return
    }
    throw err
  }
})

export default router
