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
  LogOut,
  Phone,
  BarChart2,
  Menu,
  X,
  Mail,
  Building2,
} from 'lucide-react'
import OptickBrand from './OptickBrand'
import BillingBanner from './BillingBanner'

const adminNav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/imports', icon: Upload, label: 'Importar Datos' },
  { to: '/clients', icon: Users, label: 'Clientes' },
  { to: '/assignments', icon: UserCheck, label: 'Asignaciones' },
  { to: '/agents', icon: PhoneCall, label: 'Agentes' },
  { to: '/callbacks', icon: CalendarClock, label: 'Agenda Callbacks' },
  { to: '/reports', icon: BarChart2, label: 'Reportes' },
]

const platformNavItem = {
  to: '/platform/tenants',
  icon: Building2,
  label: 'Tenants',
  end: false as const,
}

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

export default function Layout() {
  const { user, isAdmin, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const tabHiddenRef = useRef(document.hidden)
  const mainRef = useRef<HTMLElement>(null)

  const isPlatformUser =
    isOptickHost() &&
    (user?.isSystemOwner === true || user?.isSuperAdmin === true)
  const navItems = isAdmin
    ? isPlatformUser
      ? [...adminNav, platformNavItem]
      : adminNav
    : agentNav
  const sidebarBg = isAdmin ? 'bg-green-900' : 'bg-blue-900'

  const postHeartbeat = useCallback(() => {
    if (!user) return
    sendHeartbeat({
      deviceId: getDeviceId(),
      currentRoute: location.pathname,
      platform: detectPlatform(),
    }).catch((err) => {
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
    mainRef.current?.scrollTo({ top: 0, left: 0 })
  }, [location.pathname])

  const handleLogout = () => {
    setMenuOpen(false)
    void sendPresenceLogout(getDeviceId()).catch(() => {})
    logout()
    navigate('/login')
  }

  const closeMenu = () => setMenuOpen(false)

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile backdrop */}
      {menuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — overlay drawer on mobile, icon-only rail on lg+ */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-44 flex flex-col shadow-xl transform transition-transform duration-200 ease-in-out lg:static lg:w-16 lg:translate-x-0 lg:z-auto ${sidebarBg} ${
          menuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo */}
        <div
          className={`px-4 py-5 border-b lg:px-0 lg:py-4 lg:flex lg:justify-center ${isAdmin ? 'border-green-800 bg-green-950/40' : 'border-blue-800 bg-blue-950/40'}`}
        >
          <div className="lg:hidden">
            <OptickBrand variant="sidebar" />
          </div>
          <div className="hidden lg:flex lg:justify-center">
            <OptickBrand variant="sidebarCompact" />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto lg:px-2 lg:py-3">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              aria-label={label}
              onClick={closeMenu}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors lg:justify-center lg:gap-0 lg:w-10 lg:h-10 lg:mx-auto lg:px-0 lg:py-0 ${
                  isActive
                    ? isAdmin ? 'bg-green-700 text-white' : 'bg-blue-700 text-white'
                    : isAdmin ? 'text-green-200 hover:bg-green-800 hover:text-white' : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                }`
              }
            >
              <Icon size={18} className="shrink-0" />
              <span className="lg:hidden">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className={`p-4 border-t lg:p-2 lg:space-y-2 ${isAdmin ? 'border-green-800' : 'border-blue-800'}`}>
          <Link
            to="/contacto"
            state={{ from: 'app' }}
            title="Contáctenos"
            aria-label="Contáctenos"
            onClick={closeMenu}
            className={`flex items-center gap-2 px-3 py-2 mb-3 rounded-lg text-xs transition-colors lg:justify-center lg:w-10 lg:h-10 lg:mx-auto lg:px-0 lg:py-0 lg:mb-0 ${
              isAdmin
                ? 'text-green-300/80 hover:text-white hover:bg-green-800/50'
                : 'text-blue-300/80 hover:text-white hover:bg-blue-800/50'
            }`}
          >
            <Mail size={14} className="lg:w-[18px] lg:h-[18px]" />
            <span className="lg:hidden">Contáctenos</span>
          </Link>
          <div className="flex items-center gap-3 mb-3 lg:justify-center lg:mb-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${isAdmin ? 'bg-green-600' : 'bg-blue-600'}`}
              title={user?.name}
              aria-label={user?.name}
            >
              {user?.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 lg:hidden">
              <p className="text-white text-sm font-medium truncate">{user?.name}</p>
              <p className={`text-xs ${isAdmin ? 'text-green-300' : 'text-blue-300'}`}>{isAdmin ? 'Administrador' : 'Agente'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors lg:justify-center lg:w-10 lg:h-10 lg:mx-auto lg:px-0 lg:py-0 ${
              isAdmin ? 'text-green-300 hover:text-white hover:bg-green-800' : 'text-blue-300 hover:text-white hover:bg-blue-800'
            }`}
          >
            <LogOut size={16} className="shrink-0" />
            <span className="lg:hidden">Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Main content column */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Mobile header bar */}
        <header
          className={`lg:hidden flex items-center gap-3 px-3 py-3 shrink-0 pt-[max(0.75rem,env(safe-area-inset-top))] ${sidebarBg}`}
        >
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="p-2 -ml-1 text-white rounded-lg hover:bg-white/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          >
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <span className="text-white text-sm font-semibold truncate">Llamadas CRM</span>
        </header>

        {isAdmin && <BillingBanner />}

        <main ref={mainRef} className="flex-1 overflow-auto min-h-0 pb-[env(safe-area-inset-bottom)]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
