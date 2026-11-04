import { Router, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { normalizePhone } from '../lib/parseFile'
import { asDistinctPeruMobile, samePeruMobile } from '../lib/telefono2'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

const updateSchema = z.object({
  telefono: z.string().nullish(),
  telefono2: z.string().nullish(),
  email: z.string().nullish(),
  dni: z.string().nullish(),
})

function normalizeOptionalString(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

// PUT /api/contacts/:id
router.put('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = updateSchema.parse(req.body)
  const isAgent = req.user!.role === 'AGENT'

  const contact = await prisma.contact.findUnique({
    where: { id: req.params.id },
    include: {
      assignment: { select: { agentId: true } },
    },
  })

  if (!contact) {
    res.status(404).json({ error: 'Contacto no encontrado' })
    return
  }

  if (isAgent) {
    if (!contact.assignment || contact.assignment.agentId !== req.user!.id) {
      res.status(403).json({ error: 'Sin acceso a este contacto' })
      return
    }
  }

  const email = normalizeOptionalString(parsed.email)
  if (email && !z.string().email().safeParse(email).success) {
    res.status(400).json({ error: 'Email inválido' })
    return
  }

  const telefonoRaw = normalizeOptionalString(parsed.telefono)
  const telefono =
    telefonoRaw === undefined ? undefined : telefonoRaw === null ? null : normalizePhone(telefonoRaw)
  const telefono2Raw = normalizeOptionalString(parsed.telefono2)
  const nextPrimary = telefono !== undefined ? telefono : contact.telefono
  const telefono2 =
    telefono2Raw === undefined
      ? undefined
      : telefono2Raw === null
        ? null
        : asDistinctPeruMobile(telefono2Raw, nextPrimary) ?? null
  const dni = normalizeOptionalString(parsed.dni)

  const data: {
    telefono?: string | null
    telefono2?: string | null
    email?: string | null
    dni?: string | null
  } = {}
  if (telefono !== undefined) data.telefono = telefono
  if (telefono2 !== undefined) data.telefono2 = telefono2
  if (email !== undefined) data.email = email
  if (dni !== undefined) data.dni = dni
  if (
    telefono !== undefined &&
    telefono &&
    telefono2 === undefined &&
    contact.telefono2 &&
    samePeruMobile(telefono, contact.telefono2)
  ) {
    data.telefono2 = null
  }

  const updated = await prisma.contact.update({
    where: { id: req.params.id },
    data,
  })

  res.json(updated)
})

export default router
