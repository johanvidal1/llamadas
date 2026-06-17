import { useState } from 'react'
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
  type AppUser,
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
} from 'lucide-react'

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

function roleLabel(u: AppUser) {
  if (u.isSuperAdmin) return 'Super admin'
  if (u.role === 'ADMIN') return 'Admin'
  return 'Agente'
}

function roleBadgeClass(u: AppUser) {
  if (u.isSuperAdmin) return 'bg-amber-100 text-amber-800'
  if (u.role === 'ADMIN') return 'bg-purple-100 text-purple-700'
  return 'bg-blue-100 text-blue-700'
}

function isAdminUser(u: AppUser) {
  return u.role === 'ADMIN' || u.isSuperAdmin === true
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
  isSuperAdmin = false,
  muted = false,
}: {
  users: AppUser[]
  onEdit: (u: AppUser) => void
  onDeactivate?: (u: AppUser) => void
  onReactivate?: (u: AppUser) => void
  onDelete: (u: AppUser) => void
  currentUserId?: string
  isSuperAdmin?: boolean
  muted?: boolean
}) {
  if (users.length === 0) {
    return <div className="p-8 text-center text-gray-400 text-sm">No hay usuarios en esta sección</div>
  }

  return (
    <table className="w-full text-sm">
      <thead className={`border-b border-gray-200 ${muted ? 'bg-gray-50/80' : 'bg-gray-50'}`}>
        <tr>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Usuario</th>
          <th className="text-left px-4 py-3 font-medium text-gray-600">Rol</th>
          <th className="text-center px-4 py-3 font-medium text-gray-600">Asignados</th>
          <th className="text-center px-4 py-3 font-medium text-gray-600">Llamadas</th>
          <th className="text-center px-4 py-3 font-medium text-gray-600">Callbacks</th>
          <th className="text-center px-4 py-3 font-medium text-gray-600">Importaciones</th>
          <th className="text-right px-4 py-3 font-medium text-gray-600">Acciones</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {users.map((u) => {
          const adminTarget = isAdminUser(u)
          const canManageAdmin = !adminTarget || isSuperAdmin
          const canDelete =
            canManageAdmin &&
            !u.isSuperAdmin &&
            !hasHistory(u) &&
            u.id !== currentUserId
          const deleteTooltip = u.isSuperAdmin
            ? 'No se puede eliminar al super administrador'
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
            <tr key={u.id} className={`hover:bg-gray-50 ${muted ? 'text-gray-500' : ''}`}>
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
                <span className={`badge ${roleBadgeClass(u)}`}>
                  {u.role === 'ADMIN' || u.isSuperAdmin ? (
                    <Shield size={11} className="inline mr-1" />
                  ) : (
                    <Phone size={11} className="inline mr-1" />
                  )}
                  {roleLabel(u)}
                </span>
              </td>
              <td className="px-4 py-3 text-center">{u._count.assignments}</td>
              <td className="px-4 py-3 text-center">{u._count.callLogs}</td>
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
          )
        })}
      </tbody>
    </table>
  )
}

export default function Agents() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const isSuperAdmin = user?.isSuperAdmin === true
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [showReset, setShowReset] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const qc = useQueryClient()

  const { data: resetPreview } = useQuery({
    queryKey: ['reset-preview'],
    queryFn: getResetPreview,
    enabled: showReset,
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

  const agentCount = users.filter((u) => u.role === 'AGENT').length
  const regularAdminCount = users.filter((u) => u.role === 'ADMIN' && !u.isSuperAdmin).length
  const editingUser = editId ? users.find((u) => u.id === editId) : null
  const editingAdmin = editingUser ? isAdminUser(editingUser) : false
  const canEditRole = !editingAdmin || isSuperAdmin
  const atAgentLimit = agentCount >= MAX_AGENTS
  const atAdminLimit = regularAdminCount >= MAX_REGULAR_ADMINS

  const activeUsers = users.filter((u) => u.active)
  const inactiveUsers = users.filter((u) => !u.active)

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

  const handleDelete = (u: AppUser) => {
    if (confirm(`¿Eliminar permanentemente a ${u.name}? Esta acción no se puede deshacer.`)) {
      deleteMutation.mutate(u.id)
    }
  }

  return (
    <div className="p-8 space-y-8">
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
                  value={roleLabel(editingUser!)}
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
      <div className="card overflow-hidden">
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
            isSuperAdmin={isSuperAdmin}
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
            <UserTable
              users={inactiveUsers}
              onEdit={handleEdit}
              onReactivate={handleReactivate}
              onDelete={handleDelete}
              currentUserId={user?.id}
              isSuperAdmin={isSuperAdmin}
              muted
            />
          )}
        </div>
      )}

      {/* ── Zone peligrosa (solo admin) ── */}
      {isAdmin && (
        <>
          <div className="border border-red-200 rounded-xl p-5 bg-red-50 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-600" />
              <h2 className="font-semibold text-red-800 text-sm">Zona peligrosa</h2>
            </div>
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
