import { Router, Request, Response } from 'express'
import { z } from 'zod'
import {
  getContactRecipient,
  isSmtpConfigured,
  sendContactEmail,
} from '../lib/mail'

const router = Router()

const contactSchema = z.object({
  nombre: z.string().trim().min(1, 'Nombre requerido').max(200),
  empresa: z.string().trim().max(200).optional(),
  email: z.string().trim().email('Email inválido').max(320),
  asunto: z.enum(['soporte', 'comercial', 'demo']),
  mensaje: z.string().trim().min(1, 'Mensaje requerido').max(10000),
})

// POST /api/contact
router.post('/', async (req: Request, res: Response) => {
  if (!isSmtpConfigured()) {
    res.status(503).json({
      error: 'El envío por correo no está configurado en el servidor. Usa mailto o WhatsApp.',
      smtpNotConfigured: true,
    })
    return
  }

  const data = contactSchema.parse(req.body)
  const to = getContactRecipient(data.asunto)

  await sendContactEmail({
    nombre: data.nombre,
    empresa: data.empresa,
    email: data.email,
    asunto: data.asunto,
    mensaje: data.mensaje,
    to,
  })

  res.json({ ok: true, message: 'Mensaje enviado correctamente' })
})

export default router
