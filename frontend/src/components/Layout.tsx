import { useState } from 'react'
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
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
} from 'lucide-react'
import OptickBrand from './OptickBrand'

const adminNav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/imports', icon: Upload, label: 'Importar Datos' },
  { to: '/clients', icon: Users, label: 'Clientes' },
  { to: '/assignments', icon: UserCheck, label: 'Asignaciones' },
  { to: '/agents', icon: PhoneCall, label: 'Agentes' },
  { to: '/callbacks', icon: CalendarClock, label: 'Agenda Callbacks' },
  { to: '/reports', icon: BarChart2, label: 'Reportes' },
]

const agentNav = [
  { to: '/', icon: LayoutDashboard, label: 'Mi Dashboard', end: true },
  { to: '/my-leads', icon: Phone, label: 'Mis Clientes' },
  { to: '/callbacks', icon: CalendarClock, label: 'Mis Callbacks' },
]

export default function Layout() {
  const { user, isAdmin, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const navItems = isAdmin ? adminNav : agentNav
  const sidebarBg = isAdmin ? 'bg-green-900' : 'bg-blue-900'

  const handleLogout = () => {
    setMenuOpen(false)
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

      {/* Sidebar — overlay drawer on mobile, static on lg+ */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-44 flex flex-col shadow-xl transform transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 lg:z-auto ${sidebarBg} ${
          menuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo */}
        <div className={`px-4 py-5 border-b ${isAdmin ? 'border-green-800 bg-green-950/40' : 'border-blue-800 bg-blue-950/40'}`}>
          <OptickBrand variant="sidebar" />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={closeMenu}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? isAdmin ? 'bg-green-700 text-white' : 'bg-blue-700 text-white'
                    : isAdmin ? 'text-green-200 hover:bg-green-800 hover:text-white' : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className={`p-4 border-t ${isAdmin ? 'border-green-800' : 'border-blue-800'}`}>
          <Link
            to="/contacto"
            state={{ from: 'app' }}
            onClick={closeMenu}
            className={`flex items-center gap-2 px-3 py-2 mb-3 rounded-lg text-xs transition-colors ${
              isAdmin
                ? 'text-green-300/80 hover:text-white hover:bg-green-800/50'
                : 'text-blue-300/80 hover:text-white hover:bg-blue-800/50'
            }`}
          >
            <Mail size={14} />
            Contáctenos
          </Link>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${isAdmin ? 'bg-green-600' : 'bg-blue-600'}`}>
              {user?.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{user?.name}</p>
              <p className={`text-xs ${isAdmin ? 'text-green-300' : 'text-blue-300'}`}>{isAdmin ? 'Administrador' : 'Agente'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors ${isAdmin ? 'text-green-300 hover:text-white hover:bg-green-800' : 'text-blue-300 hover:text-white hover:bg-blue-800'}`}
          >
            <LogOut size={16} />
            Cerrar sesión
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

        <main className="flex-1 overflow-auto min-h-0 pb-[env(safe-area-inset-bottom)]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
