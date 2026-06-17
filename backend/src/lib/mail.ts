import nodemailer from 'nodemailer'

const DEFAULT_SUPPORT_EMAIL = 'info@ckabinversiones.com'
const DEFAULT_SALES_EMAIL = 'info@ckabinversiones.com'

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  )
}

export function getContactSupportEmail(): string {
  return process.env.CONTACT_TO_SUPPORT?.trim() || DEFAULT_SUPPORT_EMAIL
}

export function getContactSalesEmail(): string {
  return process.env.CONTACT_TO_SALES?.trim() || DEFAULT_SALES_EMAIL
}

export function getContactRecipient(asunto: 'soporte' | 'comercial' | 'demo'): string {
  return asunto === 'soporte' ? getContactSupportEmail() : getContactSalesEmail()
}

const SUBJECT_LABELS: Record<'soporte' | 'comercial' | 'demo', string> = {
  soporte: 'Soporte técnico',
  comercial: 'Consulta comercial',
  demo: 'Solicitar demo',
}

export type ContactEmailPayload = {
  nombre: string
  empresa?: string
  email: string
  asunto: 'soporte' | 'comercial' | 'demo'
  mensaje: string
  to: string
}

function buildTextBody(payload: ContactEmailPayload): string {
  const subjectLabel = SUBJECT_LABELS[payload.asunto]
  const lines = [
    `Nombre: ${payload.nombre}`,
    `Empresa: ${payload.empresa?.trim() || '—'}`,
    `Email: ${payload.email}`,
    `Asunto: ${subjectLabel}`,
    '',
    'Mensaje:',
    payload.mensaje,
  ]
  return lines.join('\n')
}

function buildHtmlBody(payload: ContactEmailPayload): string {
  const subjectLabel = SUBJECT_LABELS[payload.asunto]
  const empresa = payload.empresa?.trim() || '—'
  const escapedMessage = payload.mensaje
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')

  return `
    <p><strong>Nombre:</strong> ${payload.nombre}</p>
    <p><strong>Empresa:</strong> ${empresa}</p>
    <p><strong>Email:</strong> ${payload.email}</p>
    <p><strong>Asunto:</strong> ${subjectLabel}</p>
    <p><strong>Mensaje:</strong></p>
    <p>${escapedMessage}</p>
  `.trim()
}

export async function sendContactEmail(payload: ContactEmailPayload): Promise<void> {
  if (!isSmtpConfigured()) {
    throw new Error('SMTP not configured')
  }

  const port = Number(process.env.SMTP_PORT || 587)
  const secure = process.env.SMTP_SECURE === 'true'

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure && port === 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })

  const subjectLabel = SUBJECT_LABELS[payload.asunto]
  const from = process.env.MAIL_FROM?.trim() || 'Optick Cloud <noreply@example.com>'

  await transporter.sendMail({
    from,
    to: payload.to,
    replyTo: payload.email,
    subject: `[Optick Cloud] ${subjectLabel}`,
    text: buildTextBody(payload),
    html: buildHtmlBody(payload),
  })
}
