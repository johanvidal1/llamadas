import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { getAclaracionForDisposition, isValidDisposition } from '../lib/responseOptions'

const router = Router()

function contactFilterForRole(
  role: string,
  userId: string,
  agentId?: string
): Record<string, unknown> | undefined {
  if (role === 'AGENT') {
    return { assignment: { agentId: userId } }
  }
  if (agentId) {
    return { assignment: { agentId } }
  }
  return undefined
}

/** Call logs counted per requesting user (registered vs blank in MyLeads). */
function contactCallLogCountForUser(userId: string) {
  return {
    _count: {
      select: {
        callLogs: { where: { agentId: userId } },
      },
    },
  }
}

function scopedAgentId(role: string, userId: string, agentId?: string): string {
  if (role === 'AGENT') return userId
  return agentId || userId
}

function dispositionMatchesFilter(lastDisposition: string | null, filter: string): boolean {
  if (filter === 'INTERESADO') {
    return lastDisposition === 'INTERESADO' || lastDisposition === 'INTERESTED'
  }
  return lastDisposition === filter
}

type CompanyRow = Awaited<ReturnType<typeof fetchCompanies>>[number]

async function fetchCompanies(
  where: Record<string, unknown>,
  contactWhere: Record<string, unknown> | undefined,
  agentUserId: string,
  take?: number,
  skip?: number
) {
  const contactsInclude = {
    where: contactWhere,
    include: {
      assignment: { include: { agent: { select: { name: true, id: true } } } },
      ...contactCallLogCountForUser(agentUserId),
    },
    orderBy: { createdAt: 'asc' as const },
  }

  return prisma.company.findMany({
    where,
    include: {
      contacts: contactsInclude,
      importBatch: { select: { id: true, filename: true, createdAt: true } },
      _count: { select: { callLogs: true, callbacks: true } },
      callbacks: {
        where: { completed: false },
        orderBy: { scheduledAt: 'asc' },
        take: 1,
        select: { scheduledAt: true, notes: true },
      },
    },
    orderBy: { createdAt: 'asc' },
    ...(take !== undefined ? { take } : {}),
    ...(skip !== undefined ? { skip } : {}),
  })
}

async function enrichWithLastDisposition(
  companies: CompanyRow[],
  agentUserId: string
): Promise<
  (CompanyRow & { lastDisposition: string | null; lastAclaracion: string | null })[]
> {
  if (companies.length === 0) return []

  const companyIds = companies.map((c) => c.id)
  const logs = await prisma.callLog.findMany({
    where: {
      companyId: { in: companyIds },
      agentId: agentUserId,
      contact: { assignment: { agentId: agentUserId } },
    },
    select: { companyId: true, disposition: true, aclaracion: true, calledAt: true },
    orderBy: { calledAt: 'desc' },
  })

  const lastByCompany = new Map<string, { disposition: string; aclaracion: string | null }>()
  for (const log of logs) {
    if (!lastByCompany.has(log.companyId)) {
      lastByCompany.set(log.companyId, {
        disposition: log.disposition,
        aclaracion: log.aclaracion,
      })
    }
  }

  return companies.map((c) => {
    const last = lastByCompany.get(c.id)
    return {
      ...c,
      lastDisposition: last?.disposition ?? null,
      lastAclaracion: last?.aclaracion ?? getAclaracionForDisposition(last?.disposition ?? '') ?? null,
    }
  })
}

function matchesPendingFilter(
  company: CompanyRow & { lastDisposition: string | null },
): boolean {
  return company.lastDisposition == null
}

// GET /api/clients — ADMIN sees all, AGENT sees only assigned contacts
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const {
    page = '1',
    limit = '50',
    status,
    disposition,
    search,
    batchId,
    agentId,
    unassigned,
  } = req.query as Record<string, string>

  const take = Math.min(Number(limit) || 50, 500)
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take
  const isAgent = req.user!.role === 'AGENT'
  const agentUserId = scopedAgentId(req.user!.role, req.user!.id, agentId)
  const agentScopedPending = status === 'PENDING'
  const agentScopedDisposition = disposition && isValidDisposition(disposition)

  if (unassigned === 'true' && !isAgent) {
    let contactWhere: Record<string, unknown> = { company: { importBatch: { blocked: false } } }
    let sourceRowCount: number | null = null

    if (batchId) {
      const batch = await prisma.importBatch.findUnique({
        where: { id: batchId },
        select: { blocked: true, sourceRowCount: true },
      })
      if (!batch || batch.blocked) {
        res.json({ clients: [], total: 0, page: Number(page), limit: take })
        return
      }
      sourceRowCount = batch.sourceRowCount
      contactWhere = { company: { importBatchId: batchId } }
    }

    let assignedCount: number
    if (batchId) {
      const batchContacts = await prisma.contact.findMany({
        where: contactWhere,
        select: { id: true },
      })
      const batchContactIds = batchContacts.map((c) => c.id)
      assignedCount =
        batchContactIds.length === 0
          ? 0
          : await prisma.assignment.count({
              where: { contactId: { in: batchContactIds } },
            })
    } else {
      assignedCount = await prisma.assignment.count()
    }

    const totalContacts = await prisma.contact.count({ where: contactWhere })
    const total = totalContacts - assignedCount

    res.json({
      clients: [],
      total,
      page: Number(page),
      limit: take,
      ...(batchId ? { sourceRowCount } : {}),
    })
    return
  }

  const where: Record<string, unknown> = {}
  const contactWhere = contactFilterForRole(req.user!.role, req.user!.id, agentId)

  if (contactWhere) {
    where.contacts = { some: contactWhere }
  }

  if (batchId) where.importBatchId = batchId
  if (status && !agentScopedPending) where.status = status
  if (search) {
    where.OR = [
      { ruc: { contains: search, mode: 'insensitive' } },
      { razonSocial: { contains: search, mode: 'insensitive' } },
      { contacts: { some: { nombre: { contains: search, mode: 'insensitive' } } } },
      { contacts: { some: { telefono: { contains: search, mode: 'insensitive' } } } },
    ]
  }

  if (agentScopedDisposition || agentScopedPending) {
    const allCompanies = await fetchCompanies(where, contactWhere, agentUserId)
    const enriched = await enrichWithLastDisposition(allCompanies, agentUserId)
    const filtered = enriched.filter((c) => {
      if (agentScopedDisposition) {
        return dispositionMatchesFilter(c.lastDisposition, disposition)
      }
      return matchesPendingFilter(c)
    })
    const total = filtered.length
    const clients = filtered.slice(skip, skip + take)
    res.json({ clients, total, page: Number(page), limit: take })
    return
  }

  const [companies, total] = await Promise.all([
    fetchCompanies(where, contactWhere, agentUserId, take, skip),
    prisma.company.count({ where }),
  ])

  const clients = await enrichWithLastDisposition(companies, agentUserId)

  res.json({ clients, total, page: Number(page), limit: take })
})

// GET /api/clients/:id
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const isAgent = req.user!.role === 'AGENT'
  const contactWhere = isAgent ? { assignment: { agentId: req.user!.id } } : undefined

  if (isAgent) {
    const assignedCount = await prisma.contact.count({
      where: { companyId: req.params.id, assignment: { agentId: req.user!.id } },
    })
    if (assignedCount === 0) {
      res.status(403).json({ error: 'Sin acceso a esta empresa' })
      return
    }
  }

  const company = await prisma.company.findUnique({
    where: { id: req.params.id },
    include: {
      contacts: {
        where: contactWhere,
        include: {
          assignment: { include: { agent: { select: { name: true } } } },
          ...contactCallLogCountForUser(req.user!.id),
        },
        orderBy: { createdAt: 'asc' },
      },
      callLogs: {
        include: {
          agent: { select: { id: true, name: true } },
          contact: { select: { id: true, nombre: true, tipoContacto: true } },
          callback: true,
        },
        orderBy: { calledAt: 'desc' },
      },
      callbacks: {
        include: { agent: { select: { name: true } } },
        orderBy: { scheduledAt: 'asc' },
      },
      mobileLines: {
        orderBy: { createdAt: 'asc' },
      },
      importBatch: { select: { id: true, filename: true, createdAt: true } },
    },
  })

  if (!company) {
    res.status(404).json({ error: 'Empresa no encontrada' })
    return
  }

  res.json(company)
})

// PUT /api/clients/:id — update notes, plan
router.put('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const updateSchema = z.object({
    notes: z.string().optional(),
    plan: z.string().optional(),
    razonSocial: z.string().optional(),
  })
  const data = updateSchema.parse(req.body)

  if (req.user!.role === 'AGENT') {
    const assignedCount = await prisma.contact.count({
      where: { companyId: req.params.id, assignment: { agentId: req.user!.id } },
    })
    if (assignedCount === 0) {
      res.status(403).json({ error: 'Sin acceso a esta empresa' })
      return
    }
  }

  const updated = await prisma.company.update({
    where: { id: req.params.id },
    data,
  })
  res.json(updated)
})

export default router
