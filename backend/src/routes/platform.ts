import { Router, Response } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { computeBillingStatus, parsePaidThroughInput } from '../lib/billing'
import { formatYmdInTz, getAppTimezone } from '../lib/appTimezone'
import { getPrismaBase, prisma } from '../lib/prisma'
import { OPTICK_TENANT_ID, RESERVED_SUBDOMAINS, TENANT_ROOT_DOMAIN } from '../lib/tenant'
import { isSuperAdminOrOwner } from '../lib/userPermissions'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SLUG_MIN = 2
const SLUG_MAX = 48

const createTenantSchema = z.object({
  name: z.string().trim().min(2, 'Nombre mínimo 2 caracteres').max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(SLUG_MIN, `Slug mínimo ${SLUG_MIN} caracteres`)
    .max(SLUG_MAX, `Slug máximo ${SLUG_MAX} caracteres`)
    .regex(SLUG_RE, 'Slug inválido: solo minúsculas, números y guiones (ej. acme-test)'),
  adminEmail: z.string().trim().email('Email inválido'),
  adminName: z.string().trim().min(2, 'Nombre del admin mínimo 2 caracteres').max(120),
  adminPassword: z.string().min(6, 'Contraseña mínimo 6 caracteres'),
  // maxAgents: omitido en MVP — Tenant no tiene el campo; ver docs/TENANT-ONBOARDING.md (Fase 2)
})

const patchTenantSchema = z
  .object({
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    billingEnabled: z.boolean().optional(),
    billingDay: z.number().int().min(1).max(28).optional(),
    graceDays: z.number().int().min(0).max(31).optional(),
    /** YYYY-MM-DD or null to clear */
    paidThrough: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]).optional(),
    billingContact: z.union([z.string().trim().max(500), z.null()]).optional(),
    billingNotes: z.union([z.string().trim().max(2000), z.null()]).optional(),
  })
  .refine(
    (data) =>
      data.status !== undefined ||
      data.billingEnabled !== undefined ||
      data.billingDay !== undefined ||
      data.graceDays !== undefined ||
      data.paidThrough !== undefined ||
      data.billingContact !== undefined ||
      data.billingNotes !== undefined,
    { message: 'Debe enviar al menos un campo a actualizar' }
  )

const tenantListSelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  createdAt: true,
  billingEnabled: true,
  billingDay: true,
  graceDays: true,
  paidThrough: true,
  billingContact: true,
  billingNotes: true,
} as const

function serializeTenant(t: {
  id: string
  name: string
  slug: string
  status: string
  createdAt: Date
  billingEnabled: boolean
  billingDay: number
  graceDays: number
  paidThrough: Date | null
  billingContact: string | null
  billingNotes: string | null
}) {
  const paidThrough = t.paidThrough
    ? formatYmdInTz(t.paidThrough, getAppTimezone())
    : null
  const billing = computeBillingStatus({
    id: t.id,
    slug: t.slug,
    billingEnabled: t.billingEnabled,
    billingDay: t.billingDay,
    graceDays: t.graceDays,
    paidThrough: t.paidThrough,
    billingContact: t.billingContact,
  })
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    status: t.status,
    createdAt: t.createdAt,
    billingEnabled: t.billingEnabled,
    billingDay: t.billingDay,
    graceDays: t.graceDays,
    paidThrough,
    billingContact: t.billingContact,
    billingNotes: t.billingNotes,
    billingPhase: billing.phase,
  }
}

/** Platform APIs: Optick host + super-admin / system owner only. */
async function requirePlatformAccess(
  req: AuthRequest,
  res: Response
): Promise<boolean> {
  if (!req.tenant || req.tenant.id !== OPTICK_TENANT_ID) {
    res.status(403).json({
      error: 'Solo disponible desde el tenant Optick (crm / pruebacrm)',
      code: 'PLATFORM_HOST_REQUIRED',
    })
    return false
  }
  if (!req.user || !isSuperAdminOrOwner(req.user)) {
    res.status(403).json({
      error: 'Acceso restringido a super-admin o dueño del sistema',
      code: 'PLATFORM_FORBIDDEN',
    })
    return false
  }
  return true
}

function tenantPublicUrl(slug: string): string {
  return `https://${slug}.${TENANT_ROOT_DOMAIN}`
}

// GET /api/platform/tenants
router.get('/tenants', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!(await requirePlatformAccess(req, res))) return

  // Tenant model is not ALS-scoped — safe cross-tenant list for platform UI.
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'asc' },
    select: tenantListSelect,
  })

  res.json(tenants.map(serializeTenant))
})

// POST /api/platform/tenants
router.post('/tenants', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!(await requirePlatformAccess(req, res))) return

  const data = createTenantSchema.parse(req.body)

  if (RESERVED_SUBDOMAINS.has(data.slug) || data.slug === 'crm' || data.slug === 'pruebacrm') {
    res.status(400).json({
      error: `El slug "${data.slug}" está reservado`,
      code: 'SLUG_RESERVED',
    })
    return
  }

  const existing = await prisma.tenant.findUnique({
    where: { slug: data.slug },
    select: { id: true },
  })
  if (existing) {
    res.status(409).json({
      error: `Ya existe un tenant con el slug "${data.slug}"`,
      code: 'SLUG_TAKEN',
    })
    return
  }

  // 1) Create Tenant outside user-scoped ALS (Tenant model is not stamped).
  const tenant = await prisma.tenant.create({
    data: {
      name: data.name,
      slug: data.slug,
      status: 'ACTIVE',
    },
    select: { id: true, name: true, slug: true, status: true },
  })

  // 2) Create admin with explicit tenantId via unscoped Prisma base.
  // Extended client always stamps ALS (Optick on this request); nested runWithTenant /
  // tenantStorage.exit are not reliable for this path — use getPrismaBase() instead.
  const hashed = await bcrypt.hash(data.adminPassword, 12)
  const admin = await getPrismaBase().user.create({
    data: {
      tenantId: tenant.id,
      name: data.adminName,
      email: data.adminEmail.toLowerCase(),
      password: hashed,
      role: 'ADMIN',
      isSuperAdmin: false,
      isSystemOwner: false,
      active: true,
    },
    select: { id: true, email: true, name: true, tenantId: true },
  })

  if (admin.tenantId !== tenant.id) {
    res.status(500).json({
      error: 'Error interno: admin creado en tenant incorrecto',
      code: 'TENANT_ALS_MISMATCH',
    })
    return
  }

  res.status(201).json({
    tenant,
    admin: { id: admin.id, email: admin.email, name: admin.name },
    url: tenantPublicUrl(tenant.slug),
  })
})

// PATCH /api/platform/tenants/:id — status and/or billing fields
router.patch('/tenants/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!(await requirePlatformAccess(req, res))) return

  const data = patchTenantSchema.parse(req.body)
  const id = req.params.id

  if (id === OPTICK_TENANT_ID && data.status === 'SUSPENDED') {
    res.status(400).json({
      error: 'No se puede suspender el tenant Optick',
      code: 'OPTICK_IMMUTABLE',
    })
    return
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { id: true, slug: true },
  })
  if (!tenant) {
    res.status(404).json({ error: 'Tenant no encontrado' })
    return
  }

  let paidThrough: Date | null | undefined
  try {
    paidThrough = parsePaidThroughInput(data.paidThrough)
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'paidThrough inválido',
      code: 'INVALID_PAID_THROUGH',
    })
    return
  }

  const isOptick = id === OPTICK_TENANT_ID || tenant.slug === 'crm'

  const updated = await prisma.tenant.update({
    where: { id },
    data: {
      ...(data.status !== undefined ? { status: data.status } : {}),
      // Optick never enables cobranza banner
      ...(data.billingEnabled !== undefined
        ? { billingEnabled: isOptick ? false : data.billingEnabled }
        : {}),
      ...(data.billingDay !== undefined ? { billingDay: data.billingDay } : {}),
      ...(data.graceDays !== undefined ? { graceDays: data.graceDays } : {}),
      ...(paidThrough !== undefined ? { paidThrough } : {}),
      ...(data.billingContact !== undefined
        ? { billingContact: data.billingContact }
        : {}),
      ...(data.billingNotes !== undefined ? { billingNotes: data.billingNotes } : {}),
    },
    select: tenantListSelect,
  })

  res.json(serializeTenant(updated))
})

export default router
