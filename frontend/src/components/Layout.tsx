import { Outlet, NavLink, useNavigate } from 'react-router-dom'
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
} from 'lucide-react'

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

  const navItems = isAdmin ? adminNav : agentNav

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-blue-900 flex flex-col shadow-xl">
        {/* Logo */}
        <div className="flex items-center gap-2 px-6 py-5 border-b border-blue-800">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <Phone size={18} className="text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">CRM Llamadas</p>
            <p className="text-blue-300 text-xs">Call Center</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-700 text-white'
                    : 'text-blue-200 hover:bg-blue-800 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-blue-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
              {user?.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{user?.name}</p>
              <p className="text-blue-300 text-xs">{isAdmin ? 'Administrador' : 'Agente'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-blue-300 hover:text-white hover:bg-blue-800 rounded-lg text-sm transition-colors"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
