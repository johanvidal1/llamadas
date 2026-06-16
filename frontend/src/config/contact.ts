export const CONTACT = {
  supportEmail: 'soporte@optickcloud.com',
  salesEmail: 'ventas@optickcloud.com',
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
