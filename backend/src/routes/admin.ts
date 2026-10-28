import { Router, Response } from 'express'
import { z } from 'zod'
import { requireAdmin, AuthRequest } from '../middleware/auth'
import {
  AgentResetBlockedError,
  buildAgentResetPreview,
  executeAgentReset,
} from '../lib/agentReset'
import { buildCampaignResetPreview, executeCampaignReset } from '../lib/campaignReset'
import { clearDashboardStatsCache, clearReportsCache } from './dashboard'

const router = Router()

const resetAgentSchema = z.object({
  confirm: z.literal('RESETEAR'),
  deletePendingCallbacks: z.boolean().default(true),
  reason: z.string().max(500).optional(),
})

// POST /api/admin/reset-campaign
// Deletes ALL campaign traces (clients, imports, calls, callbacks, assignment
// history, metrics, sessions, tickets, lote pins) but keeps User accounts,
// isSystemOwner, roles, passwords, Tenant (plan) and ReleaseNote.
// Requires body: { confirm: "RESETEAR" }
router.post('/reset-campaign', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { confirm } = req.body as { confirm?: string }

  if (confirm !== 'RESETEAR') {
    res.status(400).json({
      error: 'Confirmación inválida. Envía { "confirm": "RESETEAR" } para proceder.',
    })
    return
  }

  const tenantId = req.tenant!.id
  const result = await executeCampaignReset(tenantId)
  clearReportsCache()
  clearDashboardStatsCache()
  res.json(result)
})

// GET /api/admin/reset-campaign/preview — returns counts before reset
router.get('/reset-campaign/preview', requireAdmin, async (req: AuthRequest, res: Response) => {
  const preview = await buildCampaignResetPreview(req.tenant!.id)
  res.json(preview)
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
    clearReportsCache()
    clearDashboardStatsCache()
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
