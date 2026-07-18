import { Router, Response } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { invalidateAuthUserCache } from '../lib/authUserCache'
import { prisma } from '../lib/prisma'
import { requireAdmin, AuthRequest } from '../middleware/auth'
import {
  getAgentAssignmentRunStatsByAgentId,
  getDistinctCompanyIdsByAgentId,
  getPendingCompaniesByAgentId,
} from '../lib/companyDisposition'
import {
  assertAgentLimit,
  assertRegularAdminLimit,
  canManageUser,
  isAdminUser,
  isSuperAdminOrOwner,
  loadActor,
  MAX_AGENTS,
  MAX_REGULAR_ADMINS,
} from '../lib/userPermissions'
import { excludeArchivedAgentWhere } from '../lib/archivedAgent'
import { countCallLogsAfterResetByAgentIds } from '../lib/agentReset'
import { todayYmdInAppTz, localDayStartUtc, localDayEndUtc } from '../lib/appTimezone'
import { OPTICK_TENANT_ID } from '../lib/tenant'

const router = Router()

const USERS_LIST_CACHE_TTL_MS = 30_000
const usersListCache = new Map<string, { expiresAt: number; payload: unknown }>()

function usersListCacheKey(actorId: string, isSystemOwner: boolean): string {
  return `${actorId}:${isSystemOwner}`
}

function getCachedUsersList(key: string): unknown | null {
  const entry = usersListCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    usersListCache.delete(key)
    return null
  }
  return entry.payload
}

function setCachedUsersList(key: string, payload: unknown): void {
  usersListCache.set(key, { expiresAt: Date.now() + USERS_LIST_CACHE_TTL_MS, payload })
  if (usersListCache.size > 50) {
    const oldest = usersListCache.keys().next().value
    if (oldest) usersListCache.delete(oldest)
  }
}

function invalidateUsersListCache(): void {
  usersListCache.clear()
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isSuperAdmin: true,
  isSystemOwner: true,
  active: true,
  createdAt: true,
} as const

const createUserSchema = z.object({
  name: z.string().min(2, 'Nombre mínimo 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Contraseña mínimo 6 caracteres'),
  role: z.enum(['ADMIN', 'AGENT']).default('AGENT'),
})

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  role: z.enum(['ADMIN', 'AGENT']).optional(),
  active: z.boolean().optional(),
})

// GET /api/users — list all users
router.get('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const actor = await loadActor(req.user!.id)
  const cacheKey = usersListCacheKey(req.user!.id, actor?.isSystemOwner ?? false)
  const cached = getCachedUsersList(cacheKey)
  if (cached) {
    res.json(cached)
    return
  }

  const users = await prisma.user.findMany({
    where: {
      ...(actor?.isSystemOwner ? {} : { isSystemOwner: false }),
      ...excludeArchivedAgentWhere,
    },
    select: {
      ...userSelect,
      _count: {
        select: { assignments: true, callLogs: true, callbacks: true, imports: true },
      },
    },
    orderBy: { name: 'asc' },
  })

  const companiesByAgent = await getDistinctCompanyIdsByAgentId()

  const agentIds = users.map((u) => u.id)
  const todayYmd = todayYmdInAppTz()
  const todayStart = localDayStartUtc(todayYmd)
  const todayEnd = localDayEndUtc(todayYmd)

  const [assignmentRunStatsByAgent, pendingByAgent, callsTodayRows, callbacksTodayRows, callCountsAfterReset] =
    await Promise.all([
    getAgentAssignmentRunStatsByAgentId(),
    getPendingCompaniesByAgentId(companiesByAgent),
    agentIds.length > 0
      ? prisma.callLog.groupBy({
          by: ['agentId'],
          where: {
            agentId: { in: agentIds },
            calledAt: { gte: todayStart, lte: todayEnd },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    agentIds.length > 0
      ? prisma.callback.groupBy({
          by: ['agentId'],
          where: {
            agentId: { in: agentIds },
            completed: false,
            scheduledAt: { gte: todayStart, lte: todayEnd },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    countCallLogsAfterResetByAgentIds(agentIds),
  ])

  const callsTodayByAgent = new Map(
    callsTodayRows.map((row) => [row.agentId, row._count._all]),
  )
  const callbacksTodayByAgent = new Map(
    callbacksTodayRows.map((row) => [row.agentId, row._count._all]),
  )

  const enriched = users.map((u) => {
    const runStats = assignmentRunStatsByAgent.get(u.id)
    return {
      ...u,
      _count: {
        ...u._count,
        callLogs: callCountsAfterReset.get(u.id) ?? 0,
      },
      assignedCompanies: companiesByAgent.get(u.id)?.size ?? 0,
      pendingCompanies: pendingByAgent.get(u.id) ?? 0,
      assignmentRunCount: runStats?.assignmentRunCount ?? 0,
      lastAssignmentAt: runStats?.lastAssignmentAt?.toISOString() ?? null,
      callsToday: callsTodayByAgent.get(u.id) ?? 0,
      callbacksToday: callbacksTodayByAgent.get(u.id) ?? 0,
    }
  })

  setCachedUsersList(cacheKey, enriched)
  res.json(enriched)
})

// POST /api/users — create user
router.post('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  const data = createUserSchema.parse(req.body)

  if (data.role === 'AGENT') {
    try {
      await assertAgentLimit()
    } catch (err) {
      res.status(409).json({ error: err instanceof Error ? err.message : 'Límite de agentes alcanzado' })
      return
    }
  } else if (data.role === 'ADMIN') {
    try {
      await assertRegularAdminLimit()
    } catch (err) {
      res.status(409).json({ error: err instanceof Error ? err.message : 'Límite de administradores alcanzado' })
      return
    }
  }

  // PR1: email unique per tenant; findFirst until PR2 scopes by req.tenant
  const existing = await prisma.user.findFirst({ where: { email: data.email.toLowerCase() } })
  if (existing) {
    res.status(409).json({ error: 'El email ya está registrado' })
    return
  }

  const hashed = await bcrypt.hash(data.password, 12)
  const user = await prisma.user.create({
    data: {
      tenantId: OPTICK_TENANT_ID,
      name: data.name,
      email: data.email.toLowerCase(),
      password: hashed,
      role: data.role,
      isSuperAdmin: false,
      isSystemOwner: false,
    },
    select: userSelect,
  })
  invalidateUsersListCache()
  res.status(201).json(user)
})

// PUT /api/users/:id — update user
router.put('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const data = updateUserSchema.parse(req.body)
  const targetId = req.params.id

  const actor = await loadActor(req.user!.id)
  if (!actor) {
    res.status(401).json({ error: 'Sesión inválida. Inicia sesión nuevamente.' })
    return
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true, isSuperAdmin: true, isSystemOwner: true, active: true },
  })
  if (!target) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }

  if (target.isSystemOwner && !actor.isSystemOwner) {
    res.status(403).json({ error: 'No tienes permiso para modificar al propietario del sistema' })
    return
  }

  if (data.active === false && targetId === actor.id) {
    res.status(403).json({ error: 'No puedes desactivar tu propia cuenta' })
    return
  }

  const targetIsAdmin = isAdminUser(target)

  if (targetIsAdmin && !isSuperAdminOrOwner(actor)) {
    if (data.active !== undefined && data.active !== target.active) {
      res.status(403).json({ error: 'Solo el super admin puede activar o desactivar administradores' })
      return
    }
    if (data.role !== undefined && data.role !== target.role) {
      res.status(403).json({ error: 'Solo el super admin puede cambiar el rol de administradores' })
      return
    }
  }

  if (data.role === 'ADMIN' && target.role !== 'ADMIN') {
    try {
      await assertRegularAdminLimit(targetId)
    } catch (err) {
      res.status(409).json({ error: err instanceof Error ? err.message : 'Límite de administradores alcanzado' })
      return
    }
  }

  if (data.role === 'AGENT' && targetIsAdmin && !isSuperAdminOrOwner(actor)) {
    res.status(403).json({ error: 'Solo el super admin puede cambiar el rol de administradores' })
    return
  }

  const updateData: Record<string, unknown> = { ...data }
  if (data.password) {
    updateData.password = await bcrypt.hash(data.password, 12)
    updateData.tokenVersion = { increment: 1 }
  }
  if (data.email) {
    updateData.email = data.email.toLowerCase()
  }

  const user = await prisma.user.update({
    where: { id: targetId },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isSuperAdmin: true,
      isSystemOwner: true,
      active: true,
    },
  })
  invalidateAuthUserCache(targetId)
  invalidateUsersListCache()
  res.json(user)
})

// DELETE /api/users/:id — hard delete (only if no history)
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { id } = req.params

  if (req.user?.id === id) {
    res.status(403).json({ error: 'No puedes eliminar tu propia cuenta' })
    return
  }

  const actor = await loadActor(req.user!.id)
  if (!actor) {
    res.status(401).json({ error: 'Sesión inválida. Inicia sesión nuevamente.' })
    return
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      isSuperAdmin: true,
      isSystemOwner: true,
      isArchivedAgent: true,
      active: true,
      _count: {
        select: { assignments: true, callLogs: true, callbacks: true, imports: true },
      },
    },
  })

  if (!target) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }

  if (target.isSystemOwner) {
    res.status(403).json({ error: 'No se puede eliminar al propietario del sistema' })
    return
  }

  if (target.isArchivedAgent) {
    res.status(403).json({ error: 'No se puede eliminar al agente comodín del sistema' })
    return
  }

  if (target.isSuperAdmin && !actor.isSystemOwner) {
    res.status(403).json({ error: 'Solo el propietario del sistema puede eliminar al super administrador' })
    return
  }

  if (isAdminUser(target) && !isSuperAdminOrOwner(actor)) {
    res.status(403).json({ error: 'Solo el super admin puede eliminar administradores' })
    return
  }

  if (!canManageUser(actor, target)) {
    res.status(403).json({ error: 'No tienes permiso para eliminar este usuario' })
    return
  }

  const { assignments, callLogs, callbacks, imports } = target._count
  if (assignments > 0 || callLogs > 0 || callbacks > 0 || imports > 0) {
    res.status(409).json({
      error:
        'No se puede eliminar este usuario porque tiene historial (asignaciones, llamadas, callbacks o importaciones). Desactívalo en su lugar.',
    })
    return
  }

  await prisma.user.delete({ where: { id } })
  invalidateAuthUserCache(id)
  invalidateUsersListCache()
  res.json({ ok: true })
})

export { MAX_AGENTS, MAX_REGULAR_ADMINS }
export default router
