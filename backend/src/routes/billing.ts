import { Router, Response } from 'express'
import { computeBillingStatus } from '../lib/billing'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

const billingSelect = {
  id: true,
  slug: true,
  billingEnabled: true,
  billingDay: true,
  graceDays: true,
  paidThrough: true,
  billingContact: true,
} as const

/**
 * GET /api/billing/status
 * Server-side phase for the current tenant (America/Lima via APP_TIMEZONE).
 * Banner is intended for ADMIN only; agents get showBanner=false.
 */
router.get('/status', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!req.tenant) {
    res.status(400).json({ error: 'Tenant no resuelto' })
    return
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: req.tenant.id },
    select: billingSelect,
  })
  if (!tenant) {
    res.status(404).json({ error: 'Tenant no encontrado' })
    return
  }

  const status = computeBillingStatus(tenant)

  // Only tenant ADMINs see the cobranza banner (not AGENT).
  if (req.user?.role !== 'ADMIN') {
    res.json({ ...status, showBanner: false })
    return
  }

  res.json(status)
})

export default router
