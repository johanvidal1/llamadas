import { useCallback, useEffect, useMemo, useRef, useState, type ElementType } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart2,
  Building2,
  CalendarClock,
  CornerDownLeft,
  LayoutDashboard,
  LifeBuoy,
  Phone,
  PhoneCall,
  Search,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import { getUsers, type AppUser } from '../api/client'

type CommandItem = {
  id: string
  label: string
  hint?: string
  keywords?: string
  icon: ElementType
  action: () => void
}

type Props = {
  open: boolean
  onClose: () => void
  isAdmin: boolean
  isPlatformUser: boolean
}

export default function CommandPalette({ open, onClose, isAdmin, isPlatformUser }: Props) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [agents, setAgents] = useState<AppUser[]>([])

  const go = useCallback(
    (path: string) => {
      onClose()
      navigate(path)
    },
    [navigate, onClose]
  )

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    const t = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open || !isAdmin) return
    let cancelled = false
    getUsers()
      .then((users) => {
        if (!cancelled) {
          setAgents(users.filter((u) => u.role === 'AGENT' && u.active))
        }
      })
      .catch(() => {
        if (!cancelled) setAgents([])
      })
    return () => {
      cancelled = true
    }
  }, [open, isAdmin])

  const baseCommands = useMemo<CommandItem[]>(() => {
    if (isAdmin) {
      const items: CommandItem[] = [
        {
          id: 'dashboard',
          label: 'Dashboard',
          hint: 'Ir a',
          keywords: 'inicio dashboard home',
          icon: LayoutDashboard,
          action: () => go('/'),
        },
        {
          id: 'imports',
          label: 'Importar Datos',
          hint: 'Ir a',
          keywords: 'importar upload excel',
          icon: Upload,
          action: () => go('/imports'),
        },
        {
          id: 'clients',
          label: 'Clientes',
          hint: 'Ir a',
          keywords: 'clientes empresas',
          icon: Users,
          action: () => go('/clients'),
        },
        {
          id: 'assignments',
          label: 'Asignaciones',
          hint: 'Ir a',
          keywords: 'asignaciones',
          icon: UserCheck,
          action: () => go('/assignments'),
        },
        {
          id: 'agents',
          label: 'Agentes',
          hint: 'Ir a',
          keywords: 'agentes usuarios',
          icon: PhoneCall,
          action: () => go('/agents'),
        },
        {
          id: 'reports',
          label: 'Reportes',
          hint: 'Ir a',
          keywords: 'reportes estadisticas',
          icon: BarChart2,
          action: () => go('/reports'),
        },
        {
          id: 'callbacks',
          label: 'Agenda Callbacks',
          hint: 'Ir a',
          keywords: 'agenda callbacks citas',
          icon: CalendarClock,
          action: () => go('/callbacks'),
        },
      ]
      if (isPlatformUser) {
        items.push(
          {
            id: 'support',
            label: 'Soporte',
            hint: 'Ir a',
            keywords: 'soporte tickets',
            icon: LifeBuoy,
            action: () => go('/soporte'),
          },
          {
            id: 'tenants',
            label: 'Tenants',
            hint: 'Ir a',
            keywords: 'tenants plataformas',
            icon: Building2,
            action: () => go('/platform/tenants'),
          }
        )
      }
      return items
    }

    return [
      {
        id: 'dashboard',
        label: 'Mi Dashboard',
        hint: 'Ir a',
        keywords: 'inicio dashboard home',
        icon: LayoutDashboard,
        action: () => go('/'),
      },
      {
        id: 'my-leads',
        label: 'Mis Clientes',
        hint: 'Ir a',
        keywords: 'clientes leads llamadas',
        icon: Phone,
        action: () => go('/my-leads'),
      },
      {
        id: 'callbacks',
        label: 'Mis Callbacks',
        hint: 'Ir a',
        keywords: 'callbacks agenda',
        icon: CalendarClock,
        action: () => go('/callbacks'),
      },
    ]
  }, [go, isAdmin, isPlatformUser])

  const agentCommands = useMemo<CommandItem[]>(() => {
    if (!isAdmin || !query.trim()) return []
    const q = query.trim().toLowerCase()
    return agents
      .filter((a) => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))
      .slice(0, 8)
      .map((a) => ({
        id: `agent-${a.id}`,
        label: a.name,
        hint: a.email,
        keywords: `${a.name} ${a.email}`,
        icon: PhoneCall,
        action: () => go(`/agents?highlight=${encodeURIComponent(a.id)}`),
      }))
  }, [agents, go, isAdmin, query])

  /** Agents: jump into MyLeads grid search when typing a company/query term. */
  const leadSearchCommands = useMemo<CommandItem[]>(() => {
    if (isAdmin || !query.trim()) return []
    const q = query.trim()
    return [
      {
        id: 'search-my-leads',
        label: `Buscar en Mis Clientes: “${q}”`,
        hint: 'Abrir búsqueda',
        keywords: q,
        icon: Search,
        action: () => go(`/my-leads?q=${encodeURIComponent(q)}`),
      },
    ]
  }, [go, isAdmin, query])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const nav = q
      ? baseCommands.filter((c) => {
          const hay = `${c.label} ${c.keywords ?? ''}`.toLowerCase()
          return hay.includes(q)
        })
      : baseCommands
    return [...nav, ...agentCommands, ...leadSearchCommands]
  }, [agentCommands, baseCommands, leadSearchCommands, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, filtered.length])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = filtered[activeIndex]
        if (item) item.action()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, filtered, activeIndex])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 pt-[12vh] sm:pt-[15vh]">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Cerrar búsqueda"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar y atajos"
        className="relative w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3 border-b border-gray-100">
          <Search size={18} className="text-gray-400 shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isAdmin
                ? 'Ir a… o buscar agente por nombre'
                : 'Ir a Mis Clientes, Callbacks…'
            }
            className="flex-1 py-3.5 text-sm outline-none bg-transparent placeholder:text-gray-400"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <ul className="max-h-[50vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-sm text-gray-400 text-center">Sin resultados</li>
          ) : (
            filtered.map((item, idx) => {
              const Icon = item.icon
              const active = idx === activeIndex
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => item.action()}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                      active ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        active ? 'bg-white border border-gray-200' : 'bg-gray-50'
                      }`}
                    >
                      <Icon size={16} className="text-gray-500" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="font-medium block truncate">{item.label}</span>
                      {item.hint ? (
                        <span className="text-xs text-gray-400 block truncate">{item.hint}</span>
                      ) : null}
                    </span>
                    {active ? (
                      <CornerDownLeft size={14} className="text-gray-400 shrink-0" />
                    ) : null}
                  </button>
                </li>
              )
            })
          )}
        </ul>

        <div className="px-3 py-2 border-t border-gray-100 text-[11px] text-gray-400 flex items-center gap-3">
          <span>
            <kbd className="px-1 py-0.5 rounded border border-gray-200 bg-gray-50 font-sans">↑↓</kbd>{' '}
            navegar
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded border border-gray-200 bg-gray-50 font-sans">Enter</kbd>{' '}
            abrir
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded border border-gray-200 bg-gray-50 font-sans">Esc</kbd>{' '}
            cerrar
          </span>
        </div>
      </div>
    </div>
  )
}
