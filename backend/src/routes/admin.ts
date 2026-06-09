import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { requireAdmin, AuthRequest } from '../middleware/auth'

const router = Router()

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
  const [callbacks, callLogs, assignments, clients, batches] = await prisma.$transaction([
    prisma.callback.deleteMany(),
    prisma.callLog.deleteMany(),
    prisma.assignment.deleteMany(),
    prisma.client.deleteMany(),
    prisma.importBatch.deleteMany(),
  ])

  res.json({
    message: 'Base de datos de campaña reseteada. Los usuarios se mantienen intactos.',
    deleted: {
      callbacks: callbacks.count,
      callLogs: callLogs.count,
      assignments: assignments.count,
      clients: clients.count,
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
    prisma.client.count(),
    prisma.importBatch.count(),
    prisma.user.count(),
  ])

  res.json({ callbacks, callLogs, assignments, clients, importBatches: batches, users })
})

export default router
