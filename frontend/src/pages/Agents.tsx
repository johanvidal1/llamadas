import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getUsers, createUser, updateUser, deleteUser, getResetPreview, resetCampaign } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { UserPlus, UserX, Edit2, Check, X, Shield, Phone, Trash2, AlertTriangle } from 'lucide-react'

interface User {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'AGENT'
  active: boolean
  _count: { assignments: number; callLogs: number }
}

interface FormState {
  name: string
  email: string
  password: string
  role: 'ADMIN' | 'AGENT'
}

const emptyForm: FormState = { name: '', email: '', password: '', role: 'AGENT' }

export default function Agents() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [showReset, setShowReset] = useState(false)
  const [resetConfirmText, setResetConfirmText] = useState('')
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      toast.success('Usuario desactivado')
      qc.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate(form)
  }

  const handleEdit = (u: User) => {
    setEditId(u.id)
    setForm({ name: u.name, email: u.email, password: '', role: u.role })
  }

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editId) return
    const payload: Partial<FormState> = { name: form.name, email: form.email, role: form.role }
    if (form.password) payload.password = form.password
    updateMutation.mutate({ id: editId, data: payload })
  }

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de agentes</h1>
          <p className="text-gray-500 text-sm mt-1">Administra los usuarios del sistema</p>
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
              <select
                className="input"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as 'ADMIN' | 'AGENT' })}
              >
                <option value="AGENT">Agente</option>
                <option value="ADMIN">Administrador</option>
              </select>
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

      {/* Users table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Cargando...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Usuario</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rol</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Asignados</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Llamadas</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u: User) => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 text-xs font-bold">
                        {u.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{u.name}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${u.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {u.role === 'ADMIN' ? <Shield size={11} className="inline mr-1" /> : <Phone size={11} className="inline mr-1" />}
                      {u.role === 'ADMIN' ? 'Admin' : 'Agente'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{u._count.assignments}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{u._count.callLogs}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`badge ${u.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleEdit(u)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                        title="Editar"
                      >
                        <Edit2 size={15} />
                      </button>
                      {u.active && (
                        <button
                          onClick={() => {
                            if (confirm(`¿Desactivar a ${u.name}?`)) {
                              deleteMutation.mutate(u.id)
                            }
                          }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-600"
                          title="Desactivar"
                        >
                          <UserX size={15} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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
