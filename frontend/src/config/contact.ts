export const CONTACT = {
  supportEmail: 'info@ckabinversiones.com',
  salesEmail: 'info@ckabinversiones.com',
  whatsapp: '51953551094',
  whatsappDisplay: '+51 953 551 094',
  whatsappDefaultMessage: 'Hola, me interesa conocer Optick Cloud.',
  location: 'Lima, Perú',
  companyName: 'Optick Cloud',
} as const

export type ContactSubject = 'soporte' | 'comercial' | 'demo'

export const SUBJECT_OPTIONS: { value: ContactSubject; label: string }[] = [
  { value: 'soporte', label: 'Soporte técnico' },
  { value: 'comercial', label: 'Consulta comercial' },
  { value: 'demo', label: 'Solicitar demo' },
]

export function getEmailForSubject(subject: ContactSubject): string {
  return subject === 'soporte' ? CONTACT.supportEmail : CONTACT.salesEmail
}

export function getWhatsAppUrl(message?: string): string {
  const text = encodeURIComponent(message ?? CONTACT.whatsappDefaultMessage)
  return `https://wa.me/${CONTACT.whatsapp}?text=${text}`
}

export function buildContactMailBody(params: {
  nombre: string
  empresa: string
  email: string
  subjectLabel: string
  mensaje: string
}): string {
  return `Nombre: ${params.nombre}\nEmpresa: ${params.empresa || '—'}\nEmail: ${params.email}\nAsunto: ${params.subjectLabel}\n\nMensaje:\n${params.mensaje}`
}

export function buildContactMailtoUrl(params: {
  to: string
  subjectLabel: string
  body: string
}): string {
  const subject = encodeURIComponent(`[Optick Cloud] ${params.subjectLabel}`)
  const body = encodeURIComponent(params.body)
  return `mailto:${params.to}?subject=${subject}&body=${body}`
}

/** Opens the default mail client without navigating away from the SPA. */
export function openMailto(url: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}
