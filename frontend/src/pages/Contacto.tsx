import { useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Mail,
  MessageCircle,
  Building2,
  MapPin,
  Send,
  Headphones,
  Briefcase,
} from 'lucide-react'
import OptickBrand from '../components/OptickBrand'
import {
  CONTACT,
  SUBJECT_OPTIONS,
  getEmailForSubject,
  getWhatsAppUrl,
  type ContactSubject,
} from '../config/contact'

function WhatsAppIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

export default function Contacto() {
  const [nombre, setNombre] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [email, setEmail] = useState('')
  const [asunto, setAsunto] = useState<ContactSubject>('comercial')
  const [mensaje, setMensaje] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const subjectLabel = SUBJECT_OPTIONS.find((o) => o.value === asunto)?.label ?? asunto
    const to = getEmailForSubject(asunto)
    const mailSubject = encodeURIComponent(`[Optick Cloud] ${subjectLabel}`)
    const body = encodeURIComponent(
      `Nombre: ${nombre}\nEmpresa: ${empresa || '—'}\nEmail: ${email}\nAsunto: ${subjectLabel}\n\nMensaje:\n${mensaje}`,
    )

    toast.success('Abriendo tu cliente de correo…')
    window.location.href = `mailto:${to}?subject=${mailSubject}&body=${body}`
  }

  const contactCards = [
    {
      icon: Headphones,
      title: 'Soporte técnico',
      description: 'Ayuda con la plataforma, incidencias y configuración.',
      href: `mailto:${CONTACT.supportEmail}`,
      linkText: CONTACT.supportEmail,
      linkIcon: 'mail' as const,
      accent: 'default' as const,
    },
    {
      icon: Briefcase,
      title: 'Consultas comerciales',
      description: 'Planes, precios y soluciones para tu equipo.',
      href: `mailto:${CONTACT.salesEmail}`,
      linkText: CONTACT.salesEmail,
      linkIcon: 'mail' as const,
      accent: 'default' as const,
    },
    {
      icon: WhatsAppIcon,
      title: 'WhatsApp',
      description: 'Respuesta rápida para consultas comerciales y demos.',
      href: getWhatsAppUrl(),
      linkText: 'Escríbenos por WhatsApp',
      displayText: CONTACT.whatsappDisplay,
      linkIcon: 'whatsapp' as const,
      accent: 'whatsapp' as const,
    },
    {
      icon: MapPin,
      title: 'Ubicación',
      description: CONTACT.location,
      accent: 'default' as const,
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-black to-slate-950 text-white">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 -left-40 w-80 h-80 bg-slate-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 py-10 sm:py-16">
        <header className="text-center mb-10 sm:mb-14">
          <OptickBrand variant="contact" />
          <p className="mt-6 max-w-2xl mx-auto text-slate-400 text-sm sm:text-base leading-relaxed">
            Plataforma CRM en la nube para equipos de ventas y call center.
            Gestiona leads, llamadas y seguimiento comercial con la confiabilidad de Optick Cloud.
          </p>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10 sm:mb-12">
          {contactCards.map(({ icon: Icon, title, description, href, linkText, displayText, linkIcon, accent }) => (
            <div
              key={title}
              className={`rounded-2xl border backdrop-blur-sm p-5 sm:p-6 transition-colors ${
                accent === 'whatsapp'
                  ? 'border-[#25D366]/30 bg-[#25D366]/10 hover:bg-[#25D366]/15'
                  : 'border-white/10 bg-white/5 hover:bg-white/[0.07]'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${
                  accent === 'whatsapp' ? 'bg-[#25D366]/20' : 'bg-white/10'
                }`}
              >
                <Icon
                  size={20}
                  className={accent === 'whatsapp' ? 'text-[#25D366]' : 'text-cyan-400/90'}
                />
              </div>
              <h3 className="font-semibold text-white mb-1.5">{title}</h3>
              <p className="text-slate-400 text-sm mb-3 leading-relaxed">{description}</p>
              {displayText && (
                <p className="text-sm text-slate-300 mb-2">{displayText}</p>
              )}
              {href && linkText && (
                <a
                  href={href}
                  target={linkIcon === 'whatsapp' ? '_blank' : undefined}
                  rel={linkIcon === 'whatsapp' ? 'noopener noreferrer' : undefined}
                  className={`inline-flex items-center gap-1.5 text-sm transition-colors break-all ${
                    accent === 'whatsapp'
                      ? 'text-[#25D366] hover:text-[#20bd5a]'
                      : 'text-cyan-400/90 hover:text-cyan-300'
                  }`}
                >
                  {linkIcon === 'whatsapp' ? (
                    <WhatsAppIcon size={14} className="shrink-0" />
                  ) : (
                    <Mail size={14} className="shrink-0" />
                  )}
                  {linkText}
                </a>
              )}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <MessageCircle size={20} className="text-cyan-400/90" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Envíanos un mensaje</h2>
              <p className="text-slate-400 text-sm">Te responderemos a la brevedad.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="nombre" className="block text-sm font-medium text-slate-300 mb-1.5">
                  Nombre
                </label>
                <input
                  id="nombre"
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 outline-none"
                  placeholder="Tu nombre"
                />
              </div>
              <div>
                <label htmlFor="empresa" className="block text-sm font-medium text-slate-300 mb-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 size={14} />
                    Empresa
                  </span>
                </label>
                <input
                  id="empresa"
                  type="text"
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                  className="block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 outline-none"
                  placeholder="Nombre de la empresa"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 outline-none"
                  placeholder="tu@empresa.com"
                />
              </div>
              <div>
                <label htmlFor="asunto" className="block text-sm font-medium text-slate-300 mb-1.5">
                  Asunto
                </label>
                <select
                  id="asunto"
                  value={asunto}
                  onChange={(e) => setAsunto(e.target.value as ContactSubject)}
                  className="block w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2.5 text-sm text-white focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 outline-none"
                >
                  {SUBJECT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="mensaje" className="block text-sm font-medium text-slate-300 mb-1.5">
                Mensaje
              </label>
              <textarea
                id="mensaje"
                required
                rows={4}
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
                className="block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 outline-none resize-y min-h-[100px]"
                placeholder="Cuéntanos en qué podemos ayudarte…"
              />
            </div>

            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-lg bg-cyan-500/90 hover:bg-cyan-400 text-slate-950 font-semibold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:ring-offset-2 focus:ring-offset-slate-950"
            >
              <Send size={18} />
              Enviar mensaje
            </button>
          </form>
        </div>

        <footer className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500">
          <p>© {CONTACT.companyName} {new Date().getFullYear()}</p>
          <Link
            to="/login"
            className="text-cyan-400/90 hover:text-cyan-300 transition-colors font-medium"
          >
            Iniciar sesión
          </Link>
        </footer>
      </div>

      <a
        href={getWhatsAppUrl()}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Contactar por WhatsApp"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-110"
      >
        <WhatsAppIcon size={28} />
      </a>
    </div>
  )
}
