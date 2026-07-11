import { useState, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getUsers,
  createUser,
  updateUser,
  deactivateUser,
  reactivateUser,
  deleteUser,
  getResetPreview,
  resetCampaign,
  getAgentResetPreview,
  resetAgent,
  getAgentPresence,
  revokeAgentSessions,
  type AppUser,
  type AgentPresence,
  type AgentPresenceStatus,
} from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import {
  UserPlus,
  UserX,
  UserCheck,
  Edit2,
  Check,
  X,
  Shield,
  Phone,
  Trash2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from 'lucide-react'
import { PresenceDetailPopover, formatTimeAgo } from '../components/PresenceDetailPopover'

interface FormState {
  name: string
  email: string
  password: string
  role: 'ADMIN' | 'AGENT'
}

const emptyForm: FormState = { name: '', email: '', password: '', role: 'AGENT' }

function hasHistory(u: AppUser) {
  return (
    u._count.assignments > 0 ||
    u._count.callLogs > 0 ||
    u._count.callbacks > 0 ||
    u._count.imports > 0
  )
}

const MAX_AGENTS = 25
const MAX_REGULAR_ADMINS = 1
const SHOW_TOTAL_CALLS_KEY = 'agents-show-total-calls'

function readShowTotalCallsColumn(): boolean {
  try {
    return localStorage.getItem(SHOW_TOTAL_CALLS_KEY) === 'true'
  } catch {
    return false
  }
}

function roleLabel(u: AppUser, currentUserIsSystemOwner = false) {
  if (u.isSystemOwner && currentUserIsSystemOwner) return 'Owner'
  if (u.isSuperAdmin) return 'Super admin'
  if (u.role === 'ADMIN') return 'Admin'
  return 'Agente'
}

function roleBadgeClass(u: AppUser, currentUserIsSystemOwner = false) {
  if (u.isSystemOwner && currentUserIsSystemOwner) return 'bg-rose-100 text-rose-800'
  if (u.isSuperAdmin) return 'bg-amber-100 text-amber-800'
  if (u.role === 'ADMIN') return 'bg-purple-100 text-purple-700'
  return 'bg-blue-100 text-blue-700'
}

function isAdminUser(u: AppUser) {
  return u.role === 'ADMIN' || u.isSuperAdmin === true || u.isSystemOwner === true
}

function presenceLabel(status: AgentPresenceStatus): string {
  if (status === 'online') return '🟢 En línea'
  if (status === 'recent') return '🟡 Reciente'
  return '⚪ Offline'
}

function presenceBadgeClass(status: AgentPresenceStatus): string {
  if (status === 'online') return 'bg-green-100 text-green-800'
  if (status === 'recent') return 'bg-yellow-100 text-yellow-800'
  return 'bg-gray-100 text-gray-500'
}

function deleteDisabledReason(u: AppUser) {
  const parts: string[] = []
  if (u._count.assignments > 0) parts.push(`${u._count.assignments} asignación(es)`)
  if (u._count.callLogs > 0) parts.push(`${u._count.callLogs} llamada(s)`)
  if (u._count.callbacks > 0) parts.push(`${u._count.callbacks} callback(s)`)
  if (u._count.imports > 0) parts.push(`${u._count.imports} importación(es)`)
  return `No se puede eliminar: tiene ${parts.join(', ')}. Desactívalo en su lugar.`
}

function UserTable({
  users,
  onEdit,
  onDeactivate,
  onReactivate,
  onDelete,
  currentUserId,
  isSuperAdminOrOwner = false,
  currentUserIsSystemOwner = false,
  muted = false,
  presenceByUserId,
  onRevokeSessions,
  onResetAgent,
  showTotalCallsColumn,
  onToggleShowTotalCallsColumn,
}: {
  users: AppUser[]
  onEdit: (u: AppUser) => void
  onDeactivate?: (u: AppUser) => void
  onReactivate?: (u: AppUser) => void
  onDelete: (u: AppUser) => void
  currentUserId?: string
  isSuperAdminOrOwner?: boolean
  currentUserIsSystemOwner?: boolean
  muted?: boolean
  presenceByUserId?: Record<string, AgentPresence>
  onRevokeSessions?: (u: AppUser) => void
  onResetAgent?: (u: AppUser) => void
  showTotalCallsColumn: boolean
  onToggleShowTotalCallsColumn: () => void
}) {
  const [expandedPresenceId, setExpandedPresenceId] = useState<string | null>(null)
  const [presencePopover, setPresencePopover] = useState<{
    userId: string
    anchor: HTMLElement
  } | null>(null)

  if (users.length === 0) {
    return <div className="p-8 text-center text-gray-400 text-sm">No hay usuarios en esta sección</div>
  }

  const activePopoverUser = presencePopover
    ? users.find((u) => u.id === presencePopover.userId)
    : undefined
  const activePopoverPresence = presencePopover
    ? presenceByUserId?.[presencePopover.userId]
    : undefined

  const columnCount = showTotalCallsColumn ? 10 : 9

  return (
    <>
    <table className="w-full min-w-[800px] text-sm">
      <thead className={`border-b border-gray-200 ${muted ? 'bg-gray-50/80' : 'bg-gray-50'}`}>
        <tr>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Usuario</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Rol</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
          <th className="text-center px-4 py-3 font-medium text-gray-600" title="Empresas con contactos asignados">Empresas</th>
          <th className="text-center px-4 py-3 font-medium text-gray-600">
            <div className="inline-flex items-center justify-center gap-1.5">
              <span title="Llamadas registradas hoy (zona horaria del sistema)">Llamadas (hoy)</span>
              <button
                type="button"
                onClick={onToggleShowTotalCallsColumn}
                title="Mostrar u ocultar llamadas históricas"
                className="text-xs font-normal text-gray-500 hover:text-gray-800 hover:bg-gray-200/80 rounded px-1 py-0.5 transition-colors"
              >
                {showTotalCallsColumn ? '▼' : '▶'} Total
              </button>
            </div>
          </th>
          {showTotalCallsColumn && (
            <th className="text-center px-4 py-3 font-medium text-gray-600">Llamadas (total)</th>
          )}
          <th
            className="text-center px-4 py-3 font-medium text-gray-600"
            title="Callbacks pendientes agendados para hoy (zona horaria del sistema)"
          >
            Callbacks (hoy)
          </th>
          <th className="text-center px-4 py-3 font-medium text-gray-600">Callbacks</th>
          <th className="text-center px-4 py-3 font-medium text-gray-600">Importaciones</th>
          <th className="text-right px-4 py-3 font-medium text-gray-600">Acciones</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {users.map((u) => {
          const adminTarget = isAdminUser(u)
          const presence = presenceByUserId?.[u.id]
          const isAgentRole = u.role === 'AGENT'
          const canManageAdmin = !adminTarget || isSuperAdminOrOwner
          const canDelete =
            canManageAdmin &&
            !u.isSystemOwner &&
            !(u.isSuperAdmin && !currentUserIsSystemOwner) &&
            !hasHistory(u) &&
            u.id !== currentUserId
          const deleteTooltip = u.isSystemOwner
            ? 'No se puede eliminar al propietario del sistema'
            : u.isSuperAdmin && !currentUserIsSystemOwner
              ? 'Solo el propietario del sistema puede eliminar al super administrador'
              : !canManageAdmin
                ? 'Solo el super admin puede eliminar administradores'
                : u.id === currentUserId
                  ? 'No puedes eliminar tu propia cuenta'
                  : hasHistory(u)
                    ? deleteDisabledReason(u)
                    : 'Eliminar permanentemente'
          const deactivateTooltip = !canManageAdmin
            ? 'Solo el super admin puede desactivar administradores'
            : u.id === currentUserId
              ? 'No puedes desactivar tu propia cuenta'
              : 'Desactivar usuario'

          return (
            <Fragment key={u.id}>
              <tr className={`hover:bg-gray-50 ${muted ? 'text-gray-500' : ''}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        muted ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <p className={`font-medium ${muted ? 'text-gray-600' : 'text-gray-900'}`}>{u.name}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${roleBadgeClass(u, currentUserIsSystemOwner)}`}>
                    {u.role === 'ADMIN' || u.isSuperAdmin || (u.isSystemOwner && currentUserIsSystemOwner) ? (
                      <Shield size={11} className="inline mr-1" />
                    ) : (
                      <Phone size={11} className="inline mr-1" />
                    )}
                    {roleLabel(u, currentUserIsSystemOwner)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {!isAgentRole || !presenceByUserId ? (
                    <span className="text-xs text-gray-400">N/A</span>
                  ) : (
                    <button
                      type="button"
                      aria-expanded={presencePopover?.userId === u.id}
                      aria-haspopup="dialog"
                      title={
                        presence &&
                        (presence.status === 'offline' || presence.status === 'recent') &&
                        presence.sessions.length > 0
                          ? `Última actividad ${formatTimeAgo(presence.sessions[0].lastSeenAt)}`
                          : undefined
                      }
                      onClick={(e) => {
                        const anchor = e.currentTarget
                        setPresencePopover((prev) =>
                          prev?.userId === u.id ? null : { userId: u.id, anchor },
                        )
                      }}
                      className={`badge ${presenceBadgeClass(presence?.status ?? 'offline')} cursor-pointer hover:opacity-90`}
                    >
                      <span className="inline-flex flex-col items-start leading-tight">
                        <span>
                          {presenceLabel(presence?.status ?? 'offline')}
                          {presence && presence.sessions.length > 1 && (
                            <span className="ml-1 text-[10px] opacity-75">({presence.sessions.length})</span>
                          )}
                        </span>
                        {presence &&
                          (presence.status === 'offline' || presence.status === 'recent') &&
                          presence.sessions.length > 0 && (
                            <span className="text-[10px] font-normal opacity-75">
                              {formatTimeAgo(presence.sessions[0].lastSeenAt)}
                            </span>
                          )}
                      </span>
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-center">{u.assignedCompanies ?? 0}</td>
              <td className="px-4 py-3 text-center">{u.callsToday ?? 0}</td>
              {showTotalCallsColumn && (
                <td className="px-4 py-3 text-center">{u._count.callLogs}</td>
              )}
              <td className="px-4 py-3 text-center">{u.callbacksToday ?? 0}</td>
              <td className="px-4 py-3 text-center">{u._count.callbacks}</td>
              <td className="px-4 py-3 text-center">{u._count.imports}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => onEdit(u)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                    title="Editar"
                  >
                    <Edit2 size={15} />
                  </button>
                  {onDeactivate && canManageAdmin && u.id !== currentUserId && (
                    <button
                      onClick={() => onDeactivate(u)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-amber-600"
                      title={deactivateTooltip}
                    >
                      <UserX size={15} />
                    </button>
                  )}
                  {onDeactivate && !canManageAdmin && (
                    <button
                      disabled
                      className="p-1.5 rounded-lg text-gray-300 cursor-not-allowed"
                      title={deactivateTooltip}
                    >
                      <UserX size={15} />
                    </button>
                  )}
                  {onReactivate && canManageAdmin && (
                    <button
                      onClick={() => onReactivate(u)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-green-600"
                      title={
                        canManageAdmin
                          ? 'Reactivar usuario'
                          : 'Solo el super admin puede reactivar administradores'
                      }
                    >
                      <UserCheck size={15} />
                    </button>
                  )}
                  {onReactivate && !canManageAdmin && (
                    <button
                      disabled
                      className="p-1.5 rounded-lg text-gray-300 cursor-not-allowed"
                      title="Solo el super admin puede reactivar administradores"
                    >
                      <UserCheck size={15} />
                    </button>
                  )}
                  {onResetAgent && isAgentRole && u.active && (
                    <button
                      onClick={() => onResetAgent(u)}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-orange-600"
                      title="Resetear cola del agente (libera pendientes, archiva historial)"
                    >
                      <RotateCcw size={15} />
                    </button>
                  )}
                  <button
                    onClick={() => canDelete && onDelete(u)}
                    disabled={!canDelete}
                    className={`p-1.5 rounded-lg ${
                      canDelete
                        ? 'hover:bg-gray-100 text-gray-400 hover:text-red-600'
                        : 'text-gray-300 cursor-not-allowed'
                    }`}
                    title={deleteTooltip}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
            {expandedPresenceId === u.id && presence && presence.sessions.length > 0 && (
              <tr key={`${u.id}-sessions`} className="bg-gray-50/80">
                <td colSpan={columnCount} className="px-4 py-3">
                  <div className="space-y-2">
                    {presence.sessions.map((session, idx) => (
                      <div
                        key={`${session.lastSeenAt}-${idx}`}
                        className="text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-2 bg-white"
                      >
                        <p className="font-medium text-gray-800">
                          {session.deviceLabel ?? `Dispositivo ${idx + 1}`}
                          {session.platform ? ` · ${session.platform}` : ''}
                        </p>
                        <p className="mt-0.5">
                          {session.os ?? 'SO desconocido'} · {session.browser ?? 'Navegador desconocido'}
                          {session.ipAddress ? ` · IP ${session.ipAddress}` : ''}
                        </p>
                        <p className="mt-0.5 text-gray-500">
                          {session.currentRoute ? `Ruta ${session.currentRoute} · ` : ''}
                          {formatTimeAgo(session.lastSeenAt)}
                        </p>
                      </div>
                    ))}
                    {onRevokeSessions &&
                      (presence.status === 'online' || presence.status === 'recent') && (
                        <button
                          type="button"
                          onClick={() => onRevokeSessions(u)}
                          className="text-xs font-medium text-red-700 hover:text-red-800 hover:underline"
                        >
                          Cerrar sesión del agente
                        </button>
                      )}
                  </div>
                </td>
              </tr>
            )}
            </Fragment>
          )
        })}
      </tbody>
    </table>
    <PresenceDetailPopover
      open={presencePopover !== null}
      anchorEl={presencePopover?.anchor ?? null}
      presence={activePopoverPresence}
      onClose={() => setPresencePopover(null)}
      onExpandDevices={
        activePopoverUser
          ? () => {
              setExpandedPresenceId(activePopoverUser.id)
              setPresencePopover(null)
            }
          : undefined
      }
      onRevokeSessions={
        activePopoverUser &&
        activePopoverPresence &&
        (activePopoverPresence.status === 'online' || activePopoverPresence.status === 'recent') &&
        onRevokeSessions
          ? () => onRevokeSessions(activePopoverUser)
          : undefined
      }
    />
    </>
  )
}

export default function Agents() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const isSuperAdmin = user?.isSuperAdmin === true
  const isSystemOwner = user?.isSystemOwner === true
  const isSuperAdminOrOwner = isSystemOwner || isSuperAdmin
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [showReset, setShowReset] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [showDangerZone, setShowDangerZone] = useState(false)
  const [resetAgentTarget, setResetAgentTarget] = useState<AppUser | null>(null)
  const [agentResetConfirmText, setAgentResetConfirmText] = useState('')
  const [agentResetReason, setAgentResetReason] = useState('')
  const [deletePendingCallbacks, setDeletePendingCallbacks] = useState(true)
  const [showTotalCallsColumn, setShowTotalCallsColumn] = useState(readShowTotalCallsColumn)
  const qc = useQueryClient()

  const toggleShowTotalCallsColumn = () => {
    setShowTotalCallsColumn((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SHOW_TOTAL_CALLS_KEY, String(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const { data: resetPreview } = useQuery({
    queryKey: ['reset-preview'],
    queryFn: getResetPreview,
    enabled: showReset,
  })

  const { data: agentResetPreview, isLoading: agentResetPreviewLoading } = useQuery({
    queryKey: ['agent-reset-preview', resetAgentTarget?.id],
    queryFn: () => getAgentResetPreview(resetAgentTarget!.id),
    enabled: !!resetAgentTarget,
  })

  const agentResetMutation = useMutation({
    mutationFn: () =>
      resetAgent(resetAgentTarget!.id, {
        confirm: 'RESETEAR',
        deletePendingCallbacks,
        reason: agentResetReason.trim() || undefined,
      }),
    onSuccess: (data) => {
      toast.success(data.message)
      setResetAgentTarget(null)
      setAgentResetConfirmText('')
      setAgentResetReason('')
      setDeletePendingCallbacks(true)
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['agent-presence'] })
      qc.invalidateQueries({ queryKey: ['assignments'] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['callbacks'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      qc.invalidateQueries({ queryKey: ['reports-agents'] })
      qc.invalidateQueries({ queryKey: ['reports-summary'] })
      qc.invalidateQueries({ queryKey: ['reports-batches'] })
      qc.invalidateQueries({ queryKey: ['reports'] })
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Error al resetear el agente')
    },
  })

  const resetMutation = useMutation({
    mutationFn: resetCampaign,
    onSuccess: (data: { deleted: Record<string, number> }) => {
      toast.success(`✅ Reset completado. ${data.deleted.clients} clientes eliminados.`)
      setShowReset(false)
      setResetConfirmText('')
      qc.invalidateQueries()
    },
    onError: () => toast.error('Error al resetear la campaña'),
  })

  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: getUsers })

  const { data: agentPresence = [] } = useQuery({
    queryKey: ['agent-presence'],
    queryFn: getAgentPresence,
    refetchInterval: 30_000,
    enabled: isAdmin,
  })

  const presenceByUserId = Object.fromEntries(agentPresence.map((p) => [p.id, p]))

  const visibleUsers = users.filter((u) => !u.isSystemOwner || isSystemOwner)

  const agentCount = visibleUsers.filter((u) => u.role === 'AGENT').length
  const regularAdminCount = visibleUsers.filter(
    (u) => u.role === 'ADMIN' && !u.isSuperAdmin && !u.isSystemOwner
  ).length
  const editingUser = editId ? visibleUsers.find((u) => u.id === editId) : null
  const editingAdmin = editingUser ? isAdminUser(editingUser) : false
  const canEditRole = !editingAdmin || isSuperAdminOrOwner
  const atAgentLimit = agentCount >= MAX_AGENTS
  const atAdminLimit = regularAdminCount >= MAX_REGULAR_ADMINS

  const activeUsers = visibleUsers.filter((u) => u.active)
  const inactiveUsers = visibleUsers.filter((u) => !u.active)

  const createMutation = useMutation({
    mutationFn: (data: object) => createUser(data),
    onSuccess: () => {
      toast.success('Usuario creado correctamente')
      qc.invalidateQueries({ queryKey: ['users'] })
      setShowForm(false)
      setForm(emptyForm)
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Error al crear el usuario')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => updateUser(id, data),
    onSuccess: () => {
      toast.success('Usuario actualizado')
      qc.invalidateQueries({ queryKey: ['users'] })
      setEditId(null)
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Error al actualizar')
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: () => {
      toast.success('Usuario desactivado')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Error al desactivar el usuario')
    },
  })

  const reactivateMutation = useMutation({
    mutationFn: (id: string) => reactivateUser(id),
    onSuccess: () => {
      toast.success('Usuario reactivado')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Error al reactivar el usuario')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      toast.success('Usuario eliminado permanentemente')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Error al eliminar el usuario')
    },
  })

  const revokeSessionsMutation = useMutation({
    mutationFn: (userId: string) => revokeAgentSessions(userId),
    onSuccess: () => {
      toast.success('Sesión cerrada. El agente deberá iniciar sesión de nuevo.')
      qc.invalidateQueries({ queryKey: ['agent-presence'] })
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Error al cerrar la sesión')
    },
  })

  const handleRevokeSessions = (u: AppUser) => {
    if (
      confirm(
        `¿Cerrar la sesión de ${u.name}? El agente deberá iniciar sesión de nuevo.`,
      )
    ) {
      revokeSessionsMutation.mutate(u.id)
    }
  }

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(form)
  }

  const handleEdit = (u: AppUser) => {
    setEditId(u.id)
    setForm({ name: u.name, email: u.email, password: '', role: u.role })
    setShowForm(false)
  }

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editId) return
    const payload: Partial<FormState> = { name: form.name, email: form.email, role: form.role }
    if (form.password) payload.password = form.password
    updateMutation.mutate({ id: editId, data: payload })
  }

  const handleDeactivate = (u: AppUser) => {
    if (confirm(`¿Desactivar a ${u.name}? Podrás reactivarlo más tarde.`)) {
      deactivateMutation.mutate(u.id)
    }
  }

  const handleReactivate = (u: AppUser) => {
    if (confirm(`¿Reactivar a ${u.name}?`)) {
      reactivateMutation.mutate(u.id)
    }
  }

  const handleResetAgent = (u: AppUser) => {
    setResetAgentTarget(u)
    setAgentResetConfirmText('')
    setAgentResetReason('')
    setDeletePendingCallbacks(true)
  }

  const closeAgentResetModal = () => {
    if (agentResetMutation.isPending) return
    setResetAgentTarget(null)
    setAgentResetConfirmText('')
    setAgentResetReason('')
    setDeletePendingCallbacks(true)
  }

  const handleDelete = (u: AppUser) => {
    if (confirm(`¿Eliminar permanentemente a ${u.name}? Esta acción no se puede deshacer.`)) {
      deleteMutation.mutate(u.id)
    }
  }

  return (
    <div className="p-4 sm:p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de agentes</h1>
          <p className="text-gray-500 text-sm mt-1">Administra los usuarios del sistema</p>
          <p className="text-xs text-gray-400 mt-1">
            Agentes: {agentCount}/{MAX_AGENTS} · Admins: {regularAdminCount}/{MAX_REGULAR_ADMINS}
          </p>
        </div>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm) }} className="btn-primary">
          <UserPlus size={18} />
          Nuevo usuario
        </button>
      </div>

      {/* Create / Edit form */}
      {(showForm || editId) && (
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">
            {editId ? 'Editar usuario' : 'Crear nuevo usuario'}
          </h2>
          <form onSubmit={editId ? handleUpdate : handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Nombre completo *</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                minLength={2}
                placeholder="Juan García"
              />
            </div>
            <div>
              <label className="label">Email *</label>
              <input
                type="email"
                className="input"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                placeholder="juan@empresa.com"
              />
            </div>
            <div>
              <label className="label">{editId ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}</label>
              <input
                type="password"
                className="input"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editId}
                minLength={6}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div>
              <label className="label">Rol *</label>
              {canEditRole ? (
                <select
                  className="input"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as 'ADMIN' | 'AGENT' })}
                >
                  <option value="AGENT">Agente</option>
                  <option value="ADMIN" disabled={!editId && atAdminLimit}>
                    Administrador{!editId && atAdminLimit ? ' (límite alcanzado)' : ''}
                  </option>
                </select>
              ) : (
                <input
                  className="input bg-gray-50 text-gray-500"
                  value={roleLabel(editingUser!, isSystemOwner)}
                  readOnly
                  title="Solo el super admin puede cambiar el rol de administradores"
                />
              )}
              {!editId && atAgentLimit && form.role === 'AGENT' && (
                <p className="text-xs text-amber-600 mt-1">Límite de agentes alcanzado ({MAX_AGENTS} máximo)</p>
              )}
            </div>
            <div className="md:col-span-2 flex gap-3">
              <button
                type="submit"
                className="btn-primary"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                <Check size={16} />
                {editId ? 'Guardar cambios' : 'Crear usuario'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setShowForm(false); setEditId(null) }}
              >
                <X size={16} />
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Active agents */}
      <div className="card overflow-x-auto">
        <div className="px-4 py-3 border-b border-gray-200 bg-white">
          <h2 className="font-semibold text-gray-900">Agentes activos</h2>
          <p className="text-xs text-gray-500 mt-0.5">{activeUsers.length} usuario(s) activo(s)</p>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Cargando...</div>
        ) : (
          <UserTable
            users={activeUsers}
            onEdit={handleEdit}
            onDeactivate={handleDeactivate}
            onDelete={handleDelete}
            currentUserId={user?.id}
            isSuperAdminOrOwner={isSuperAdminOrOwner}
            currentUserIsSystemOwner={isSystemOwner}
            presenceByUserId={presenceByUserId}
            onRevokeSessions={handleRevokeSessions}
            onResetAgent={isAdmin ? handleResetAgent : undefined}
            showTotalCallsColumn={showTotalCallsColumn}
            onToggleShowTotalCallsColumn={toggleShowTotalCallsColumn}
          />
        )}
      </div>

      {/* Inactive agents */}
      {inactiveUsers.length > 0 && (
        <div className="card overflow-hidden border-gray-200">
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            className="w-full px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              {showInactive ? (
                <ChevronDown size={16} className="text-gray-500" />
              ) : (
                <ChevronRight size={16} className="text-gray-500" />
              )}
              <h2 className="font-semibold text-gray-600">Agentes inactivos</h2>
              <span className="badge bg-gray-200 text-gray-600">Inactivos ({inactiveUsers.length})</span>
            </div>
          </button>
          {showInactive && (
            <div className="overflow-x-auto">
              <UserTable
                users={inactiveUsers}
                onEdit={handleEdit}
                onReactivate={handleReactivate}
                onDelete={handleDelete}
                currentUserId={user?.id}
                isSuperAdminOrOwner={isSuperAdminOrOwner}
                currentUserIsSystemOwner={isSystemOwner}
                presenceByUserId={presenceByUserId}
                onRevokeSessions={handleRevokeSessions}
                muted
                showTotalCallsColumn={showTotalCallsColumn}
                onToggleShowTotalCallsColumn={toggleShowTotalCallsColumn}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Reset agent modal ── */}
      {resetAgentTarget && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={closeAgentResetModal} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center shrink-0">
                  <RotateCcw size={20} className="text-orange-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">¿Resetear cola de {resetAgentTarget.name}?</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    El historial comercial pasará a <strong>Agente borrado</strong>. Las empresas
                    pendientes vuelven al pool sin asignar. El agente queda activo pero sin cola.
                    No se borran clientes ni llamadas.
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    El historial de asignaciones anteriores se archivará en Asignaciones.
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    Tras el reset, las llamadas en reportes vuelven a 0 para este agente. Reasignar
                    empresas no borra el historial de llamadas.
                  </p>
                </div>
              </div>

              {agentResetPreviewLoading && (
                <p className="text-sm text-gray-400 text-center py-4">Cargando vista previa...</p>
              )}

              {agentResetPreview && (
                <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-2 text-sm">
                  {[
                    ['Llamadas a archivar', agentResetPreview.callLogsToArchive],
                    ['Empresas pendientes a liberar', agentResetPreview.pendingCompaniesToRelease],
                    ['Empresas trabajadas', agentResetPreview.workedCompaniesCount],
                    ['Callbacks pendientes', agentResetPreview.pendingCallbacksCount],
                    ['Callbacks completados', agentResetPreview.completedCallbacksCount],
                    ['Compartidas con otros agentes', agentResetPreview.sharedWithOtherAgentsCount],
                  ].map(([label, count]) => (
                    <div key={label as string} className="flex justify-between gap-2">
                      <span className="text-gray-500">{label as string}</span>
                      <span className="font-semibold text-gray-800">{count as number}</span>
                    </div>
                  ))}
                </div>
              )}

              {agentResetPreview && agentResetPreview.pendingCallbacksCount > 0 && (
                <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={deletePendingCallbacks}
                    onChange={(e) => setDeletePendingCallbacks(e.target.checked)}
                  />
                  <span>
                    Eliminar {agentResetPreview.pendingCallbacksCount} callback
                    {agentResetPreview.pendingCallbacksCount !== 1 ? 's' : ''} pendiente
                    {agentResetPreview.pendingCallbacksCount !== 1 ? 's' : ''} de este agente
                  </span>
                </label>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Motivo (opcional)</label>
                <textarea
                  className="input min-h-[72px] resize-y"
                  value={agentResetReason}
                  onChange={(e) => setAgentResetReason(e.target.value)}
                  placeholder="Ej. fin de campaña, reasignación de cartera..."
                  maxLength={500}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Escribe <span className="font-mono font-bold text-orange-600">RESETEAR</span> para confirmar:
                </label>
                <input
                  type="text"
                  className="input font-mono"
                  placeholder="RESETEAR"
                  value={agentResetConfirmText}
                  onChange={(e) => setAgentResetConfirmText(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button onClick={closeAgentResetModal} className="flex-1 btn-secondary" disabled={agentResetMutation.isPending}>
                  Cancelar
                </button>
                <button
                  onClick={() => agentResetMutation.mutate()}
                  disabled={
                    agentResetConfirmText !== 'RESETEAR' ||
                    agentResetMutation.isPending ||
                    agentResetPreviewLoading ||
                    !agentResetPreview
                  }
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <RotateCcw size={15} />
                  {agentResetMutation.isPending ? 'Reseteando...' : 'Confirmar reset'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Zone peligrosa (solo admin) ── */}
      {isAdmin && (
        <>
          <div className="card overflow-hidden border-gray-200">
            <button
              type="button"
              onClick={() => setShowDangerZone((v) => !v)}
              className="w-full px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                {showDangerZone ? (
                  <ChevronDown size={16} className="text-gray-500" />
                ) : (
                  <ChevronRight size={16} className="text-gray-500" />
                )}
                <h2 className="font-semibold text-gray-600">Zona peligrosa</h2>
              </div>
            </button>
            {showDangerZone && (
              <div className="p-5 bg-red-50 space-y-3">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-sm font-medium text-red-700">Resetear campaña</p>
                    <p className="text-xs text-red-500 mt-0.5">
                      Elimina todos los clientes, importaciones, asignaciones, llamadas y callbacks.<br />
                      Los usuarios (agentes y admin) <strong>no se borran</strong>.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowReset(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
                  >
                    <Trash2 size={15} /> Resetear campaña
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Reset confirmation modal ── */}
          {showReset && (
            <>
              <div className="fixed inset-0 bg-black/40 z-40" onClick={() => { setShowReset(false); setResetConfirmText('') }} />
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                      <AlertTriangle size={20} className="text-red-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">¿Resetear toda la campaña?</h3>
                      <p className="text-sm text-gray-500 mt-1">Esta acción es <strong>irreversible</strong>. Se eliminarán permanentemente:</p>
                    </div>
                  </div>

                  {resetPreview && (
                    <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-2 text-sm">
                      {[
                        ['Clientes', resetPreview.clients],
                        ['Importaciones', resetPreview.importBatches],
                        ['Asignaciones', resetPreview.assignments],
                        ['Llamadas', resetPreview.callLogs],
                        ['Callbacks', resetPreview.callbacks],
                      ].map(([label, count]) => (
                        <div key={label as string} className="flex justify-between">
                          <span className="text-gray-500">{label as string}</span>
                          <span className="font-semibold text-red-700">{count as number}</span>
                        </div>
                      ))}
                      <div className="col-span-2 border-t border-gray-200 pt-2 flex justify-between">
                        <span className="text-green-700 font-medium">Usuarios (se conservan)</span>
                        <span className="font-semibold text-green-700">{resetPreview.users}</span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700">
                      Escribe <span className="font-mono font-bold text-red-600">RESETEAR</span> para confirmar:
                    </label>
                    <input
                      type="text"
                      className="input font-mono"
                      placeholder="RESETEAR"
                      value={resetConfirmText}
                      onChange={(e) => setResetConfirmText(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => { setShowReset(false); setResetConfirmText('') }}
                      className="flex-1 btn-secondary"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => resetMutation.mutate()}
                      disabled={resetConfirmText !== 'RESETEAR' || resetMutation.isPending}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      <Trash2 size={15} />
                      {resetMutation.isPending ? 'Reseteando...' : 'Confirmar reset'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
