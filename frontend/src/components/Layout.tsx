import { useState, useEffect, useCallback, useRef } from 'react'
import { Outlet, NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import { sendHeartbeat, sendPresenceLogout } from '../api/client'
import { getDeviceId, detectPlatform } from '../lib/deviceId'
import {
  LayoutDashboard,
  Upload,
  Users,
  UserCheck,
  PhoneCall,
  CalendarClock,
  Phone,
  BarChart2,
  Menu,
  X,
  Mail,
  Building2,
  LifeBuoy,
  Search,
} from 'lucide-react'
import OptickBrand from './OptickBrand'
import BillingBanner from './BillingBanner'
import CreateSupportTicketModal from './CreateSupportTicketModal'
import CommandPalette from './CommandPalette'
import UserAvatarMenu, { UserAvatarChip } from './UserAvatarMenu'

const adminNav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/imports', icon: Upload, label: 'Importar Datos' },
  { to: '/clients', icon: Users, label: 'Clientes' },
  { to: '/assignments', icon: UserCheck, label: 'Asignaciones' },
  { to: '/agents', icon: PhoneCall, label: 'Agentes' },
  { to: '/callbacks', icon: CalendarClock, label: 'Agenda Callbacks' },
  { to: '/reports', icon: BarChart2, label: 'Reportes' },
]

const platformNavItems = [
  {
    to: '/soporte',
    icon: LifeBuoy,
    label: 'Soporte',
    end: false as const,
  },
  {
    to: '/platform/tenants',
    icon: Building2,
    label: 'Tenants',
    end: false as const,
  },
]

/** Hosts that resolve to Optick (crm). */
function isOptickHost(): boolean {
  const host = window.location.hostname.toLowerCase()
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === 'pruebacrm.optickcloud.com' ||
    host === 'crm.optickcloud.com' ||
    host === 'mt-staging.optickcloud.com'
  )
}

const agentNav = [
  { to: '/', icon: LayoutDashboard, label: 'Mi Dashboard', end: true },
  { to: '/my-leads', icon: Phone, label: 'Mis Clientes' },
  { to: '/callbacks', icon: CalendarClock, label: 'Mis Callbacks' },
]

const HEARTBEAT_VISIBLE_MS = 30_000
const HEARTBEAT_HIDDEN_MS = 120_000
/** Match backend presence.ts ONLINE_THRESHOLD_MS / RECENT_THRESHOLD_MS */
const ONLINE_THRESHOLD_MS = 60_000
const RECENT_THRESHOLD_MS = 5 * 60 * 1000

type PresenceTone = 'online' | 'recent' | 'offline'

function presenceFromLastHeartbeat(lastAt: number | null): PresenceTone {
  if (lastAt == null) return 'offline'
  const age = Date.now() - lastAt
  if (age <= ONLINE_THRESHOLD_MS) return 'online'
  if (age <= RECENT_THRESHOLD_MS) return 'recent'
  return 'offline'
}

export default function Layout() {
  const { user, isAdmin, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [lastHeartbeatAt, setLastHeartbeatAt] = useState<number | null>(null)
  const [presenceTick, setPresenceTick] = useState(0)
  const tabHiddenRef = useRef(document.hidden)
  const mainRef = useRef<HTMLElement>(null)

  const isPlatformUser =
    isOptickHost() &&
    (user?.isSystemOwner === true || user?.isSuperAdmin === true)
  const navItems = isAdmin
    ? isPlatformUser
      ? [...adminNav, ...platformNavItems]
      : adminNav
    : agentNav
  /** Agents + all admins can create tickets; inbox (/soporte) stays platform-only via platformNavItems. */
  const showSupportFab = true
  const topBarBg = isAdmin ? 'bg-green-950' : 'bg-blue-950'
  const accentBar = isAdmin ? 'before:bg-green-600' : 'before:bg-blue-600'
  const activeNav = isAdmin
    ? 'text-green-700 bg-green-50'
    : 'text-blue-700 bg-blue-50'
  const isMyLeads = location.pathname.startsWith('/my-leads')
  const presence = presenceFromLastHeartbeat(lastHeartbeatAt)
  void presenceTick // interval re-renders so presence ages online → recent → offline

  const postHeartbeat = useCallback(() => {
    if (!user) return
    sendHeartbeat({
      deviceId: getDeviceId(),
      currentRoute: location.pathname,
      platform: detectPlatform(),
    })
      .then(() => {
        setLastHeartbeatAt(Date.now())
      })
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          const code = err.response.data?.code as string | undefined
          if (code === 'SESSION_REVOKED' || err.response.data?.error) {
            logout()
            navigate('/login')
            return
          }
        }
        console.warn('[presence] heartbeat failed:', err)
      })
  }, [user, location.pathname, logout, navigate])

  useEffect(() => {
    if (!user) return

    postHeartbeat()
    let intervalId = window.setInterval(
      postHeartbeat,
      tabHiddenRef.current ? HEARTBEAT_HIDDEN_MS : HEARTBEAT_VISIBLE_MS,
    )

    const onVisibilityChange = () => {
      const wasHidden = tabHiddenRef.current
      tabHiddenRef.current = document.hidden
      window.clearInterval(intervalId)
      intervalId = window.setInterval(
        postHeartbeat,
        document.hidden ? HEARTBEAT_HIDDEN_MS : HEARTBEAT_VISIBLE_MS,
      )
      if (wasHidden && !document.hidden) {
        postHeartbeat()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [user, postHeartbeat])

  useEffect(() => {
    const id = window.setInterval(() => setPresenceTick((t) => t + 1), 15_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 })
  }, [location.pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleLogout = () => {
    setMenuOpen(false)
    void sendPresenceLogout(getDeviceId()).catch(() => {})
    logout()
    navigate('/login')
  }

  const closeMenu = () => setMenuOpen(false)

  const searchTrigger = (
    <button
      type="button"
      onClick={() => setPaletteOpen(true)}
      className="flex items-center gap-2 min-w-0 w-full max-w-md mx-auto rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 px-3 py-1.5 text-left transition-colors"
      aria-label="Buscar y atajos (Ctrl+K)"
    >
      <Search size={15} className="text-white/70 shrink-0" />
      <span className="text-white/70 text-sm truncate flex-1">
        Buscar o ir a…
      </span>
      <kbd className="hidden sm:inline text-[10px] text-white/50 border border-white/20 rounded px-1.5 py-0.5 font-sans shrink-0">
        Ctrl K
      </kbd>
    </button>
  )

  const footerLinkClass =
    'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors lg:justify-center lg:w-10 lg:h-10 lg:mx-auto lg:px-0 lg:py-0'

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Role-colored top bar — full width above sidebar + content */}
      <header className={`shrink-0 z-30 ${topBarBg} pt-[env(safe-area-inset-top)]`}>
        <div
          className={`flex items-center gap-2 sm:gap-3 px-2 sm:px-4 ${
            isMyLeads && !isAdmin ? 'h-11' : 'h-12'
          }`}
        >
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="lg:hidden p-2 -ml-0.5 text-white rounded-lg hover:bg-white/10 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          <Link
            to="/"
            className="hidden sm:flex items-center gap-2 min-w-0 shrink-0"
            onClick={closeMenu}
          >
            <img
              src="/logo-optick.png"
              alt=""
              className="w-7 h-7 rounded-md object-contain bg-white/10 p-0.5 shrink-0"
            />
            <span className="text-white text-sm font-semibold truncate">
              Optick <span className="font-normal text-white/75">CRM</span>
            </span>
          </Link>

          <div className="flex-1 min-w-0 flex justify-center px-1">
            {searchTrigger}
          </div>

          <div className="shrink-0">
            <UserAvatarMenu
              presence={presence}
              isAdmin={isAdmin}
              onLogout={handleLogout}
            />
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 min-w-0">
        {menuOpen && (
          <div
            className="fixed inset-0 top-0 bg-black/50 z-40 lg:hidden"
            onClick={closeMenu}
            aria-hidden="true"
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-50 w-44 flex flex-col bg-gray-50 border-r border-gray-200 shadow-xl transform transition-transform duration-200 ease-in-out lg:static lg:w-14 lg:translate-x-0 lg:z-auto lg:shadow-none ${
            menuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          {/* Brand only in mobile drawer — desktop brand lives in the top bar */}
          <div className="px-4 py-4 border-b border-gray-200 lg:hidden">
            <OptickBrand variant="sidebar" />
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto lg:px-1.5 lg:py-3">
            {navItems.map(({ to, icon: Icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                title={label}
                aria-label={label}
                onClick={closeMenu}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors lg:justify-center lg:gap-0 lg:w-10 lg:h-10 lg:mx-auto lg:px-0 lg:py-0 before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-0.5 before:h-5 before:rounded-full before:content-[''] ${
                    isActive
                      ? `${activeNav} ${accentBar}`
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 before:bg-transparent'
                  }`
                }
              >
                <Icon size={18} className="shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="lg:hidden">{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="p-4 border-t border-gray-200 lg:p-2 lg:space-y-2">
            {showSupportFab && (
              <button
                type="button"
                title="Soporte"
                aria-label="Soporte"
                onClick={() => {
                  closeMenu()
                  setSupportOpen(true)
                }}
                className={`${footerLinkClass} mb-1 lg:mb-0`}
              >
                <LifeBuoy size={14} className="lg:w-[18px] lg:h-[18px]" strokeWidth={1.75} />
                <span className="lg:hidden">Soporte</span>
              </button>
            )}
            <Link
              to="/contacto"
              state={{ from: 'app' }}
              title="Contáctenos"
              aria-label="Contáctenos"
              onClick={closeMenu}
              className={`${footerLinkClass} mb-3 lg:mb-0`}
            >
              <Mail size={14} className="lg:w-[18px] lg:h-[18px]" strokeWidth={1.75} />
              <span className="lg:hidden">Contáctenos</span>
            </Link>
            <div className="flex items-center gap-3 mb-1 lg:justify-center lg:mb-0 lg:hidden">
              <UserAvatarChip
                name={user?.name}
                hasAvatar={user?.hasAvatar}
                isAdmin={isAdmin}
                presence={presence}
              />
              <div className="min-w-0">
                <p className="text-gray-900 text-sm font-medium truncate">{user?.name}</p>
                <p className={`text-xs ${isAdmin ? 'text-green-700' : 'text-blue-700'}`}>
                  {isAdmin ? 'Administrador' : 'Agente'}
                </p>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {isAdmin && <BillingBanner />}
          <main
            ref={mainRef}
            className="flex-1 overflow-auto min-h-0 pb-[env(safe-area-inset-bottom)]"
          >
            <Outlet />
          </main>
        </div>
      </div>

      <CreateSupportTicketModal open={supportOpen} onClose={() => setSupportOpen(false)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        isAdmin={isAdmin}
        isPlatformUser={isPlatformUser}
      />
    </div>
  )
}
