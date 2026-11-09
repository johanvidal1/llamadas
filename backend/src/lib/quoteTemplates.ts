import { prisma } from './prisma'
import { requireTenantIdFromContext } from './tenantContext'

export const DEFAULT_TEMPLATE_NAME = 'Clásico'
export const DEFAULT_GREETING =
  'Estimado/a, gracias por su tiempo. Le presentamos la propuesta comercial de Optick.'
export const DEFAULT_FAREWELL =
  'Quedamos atentos para acompañarle en el siguiente paso. Optick.'

export const BRIEF_TEMPLATE_NAME = 'Breve'
export const BRIEF_GREETING = 'Estimado/a, le enviamos el resumen de su propuesta comercial.'
export const BRIEF_FAREWELL = 'Gracias por considerarnos. Optick.'

const promoInclude = { orderBy: { sortOrder: 'asc' as const } }

/** Seed Clásico (default) and Breve when a tenant has no formats yet. */
export async function ensureQuoteTemplates(): Promise<void> {
  const count = await prisma.quoteTemplate.count()
  if (count > 0) return
  const tenantId = requireTenantIdFromContext()
  await prisma.quoteTemplate.create({
    data: {
      tenantId,
      name: DEFAULT_TEMPLATE_NAME,
      isDefault: true,
      greeting: DEFAULT_GREETING,
      farewell: DEFAULT_FAREWELL,
    },
  })
  await prisma.quoteTemplate.create({
    data: {
      tenantId,
      name: BRIEF_TEMPLATE_NAME,
      isDefault: false,
      greeting: BRIEF_GREETING,
      farewell: BRIEF_FAREWELL,
    },
  })
}

export async function getDefaultQuoteTemplate() {
  await ensureQuoteTemplates()
  const preferred = await prisma.quoteTemplate.findFirst({
    where: { isDefault: true },
    include: { promos: promoInclude },
  })
  if (preferred) return preferred
  return prisma.quoteTemplate.findFirst({
    include: { promos: promoInclude },
    orderBy: { createdAt: 'asc' },
  })
}
