import { Router, Response } from 'express'
import { z } from 'zod'
import UAParser = require('ua-parser-js')
import { prisma } from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { isAdminUser } from '../lib/userPermissions'

const router = Router()

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000
const RECENT_THRESHOLD_MS = 20 * 60 * 1000
const STALE_SESSION_MS = 24 * 60 * 60 * 1000

function getClientIp(req: AuthRequest): string | null {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim()
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].split(',')[0].trim()
  }
  return req.ip ?? null
}

const heartbeatSchema = z.object({
  deviceId: z.string().min(1),
  currentRoute: z.string().optional(),
  platform: z.enum(['desktop', 'mobile', 'tablet']).optional(),
  deviceLabel: z.string().optional(),
})

router.post('/heartbeat', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = heartbeatSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos' })
    return
  }

  const { deviceId, currentRoute, platform, deviceLabel } = parsed.data
  const userAgent = req.headers['user-agent'] ?? null
  const parser = new UAParser.UAParser(userAgent ?? undefined)
  const browserInfo = parser.getBrowser()
  const osInfo = parser.getOS()
  const browser = [browserInfo.name, browserInfo.version].filter(Boolean).join(' ') || null
  const os = [osInfo.name, osInfo.version].filter(Boolean).join(' ') || null
  const ipAddress = getClientIp(req)

  const now = new Date()

  await prisma.userSession.upsert({
    where: {
      userId_deviceId: {
        userId: req.user!.id,
        deviceId,
      },
    },
    create: {
      userId: req.user!.id,
      deviceId,
      deviceLabel: deviceLabel ?? null,
      ipAddress,
      userAgent,
      browser,
      os,
      platform: platform ?? null,
      currentRoute: currentRoute ?? null,
      lastSeenAt: now,
    },
    update: {
      deviceLabel: deviceLabel ?? null,
      ipAddress,
      userAgent,
      browser,
      os,
      platform: platform ?? null,
      currentRoute: currentRoute ?? null,
      lastSeenAt: now,
    },
  })

  const staleCutoff = new Date(Date.now() - STALE_SESSION_MS)
  await prisma.userSession.deleteMany({
    where: {
      userId: req.user!.id,
      lastSeenAt: { lt: staleCutoff },
    },
  })

  res.status(204).send()
})

const logoutSchema = z.object({
  deviceId: z.string().min(1),
})

router.post('/logout', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = logoutSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Datos inválidos' })
    return
  }

  await prisma.userSession.deleteMany({
    where: {
      userId: req.user!.id,
      deviceId: parsed.data.deviceId,
    },
  })

  res.status(204).send()
})

type PresenceStatus = 'online' | 'recent' | 'offline'

function sessionStatus(lastSeenAt: Date): PresenceStatus {
  const ageMs = Date.now() - lastSeenAt.getTime()
  if (ageMs <= ONLINE_THRESHOLD_MS) return 'online'
  if (ageMs <= RECENT_THRESHOLD_MS) return 'recent'
  return 'offline'
}

function agentStatus(sessions: { lastSeenAt: Date }[]): PresenceStatus {
  if (sessions.length === 0) return 'offline'
  const statuses = sessions.map((s) => sessionStatus(s.lastSeenAt))
  if (statuses.includes('online')) return 'online'
  if (statuses.includes('recent')) return 'recent'
  return 'offline'
}

router.get('/agents', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!req.user || !isAdminUser(req.user)) {
    res.status(403).json({ error: 'Acceso restringido a administradores' })
    return
  }

  const agents = await prisma.user.findMany({
    where: { role: 'AGENT' },
    select: {
      id: true,
      name: true,
      email: true,
      sessions: {
        where: {
          lastSeenAt: { gte: new Date(Date.now() - STALE_SESSION_MS) },
        },
        orderBy: { lastSeenAt: 'desc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  res.json(
    agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      email: agent.email,
      status: agentStatus(agent.sessions),
      sessions: agent.sessions.map((session) => ({
        browser: session.browser,
        os: session.os,
        platform: session.platform,
        ipAddress: session.ipAddress,
        currentRoute: session.currentRoute,
        lastSeenAt: session.lastSeenAt.toISOString(),
        loginAt: session.loginAt.toISOString(),
        deviceLabel: session.deviceLabel,
      })),
    }))
  )
})

export default router
