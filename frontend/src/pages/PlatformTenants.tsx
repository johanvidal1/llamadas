import { FormEvent, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Check, Loader2, PauseCircle, PlayCircle, X } from 'lucide-react'
import axios from 'axios'
import {
  createPlatformTenant,
  listPlatformTenants,
  patchPlatformTenantStatus,
  type PlatformTenant,
} from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'

/** Hosts that resolve to Optick (crm) — hide page elsewhere. */
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

const emptyForm = {
  name: '',
  slug: '',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
}

function statusBadge(status: string) {
  if (status === 'ACTIVE') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
        Activo
      </span>
    )
  }
  if (status === 'SUSPENDED') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
        Suspendido
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
      {status}
    </span>
  )
}

export default function PlatformTenants() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [createdUrl, setCreatedUrl] = useState<string | null>(null)

  const isPlatformUser =
    user?.isSystemOwner === true || user?.isSuperAdmin === true
  const allowed = isOptickHost() && isPlatformUser

  const tenantsQuery = useQuery({
    queryKey: ['platform-tenants'],
    queryFn: listPlatformTenants,
    enabled: allowed,
  })

  const createMutation = useMutation({
    mutationFn: createPlatformTenant,
    onSuccess: (data) => {
      setCreatedUrl(data.url)
      setForm(emptyForm)
      setShowForm(false)
      setFormError(null)
      void queryClient.invalidateQueries({ queryKey: ['platform-tenants'] })
    },
    onError: (err: unknown) => {
      if (axios.isAxiosError(err)) {
        setFormError(
          (err.response?.data as { error?: string } | undefined)?.error ??
            'No se pudo crear el tenant'
        )
        return
      }
      setFormError('No se pudo crear el tenant')
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'SUSPENDED' }) =>
      patchPlatformTenantStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['platform-tenants'] })
    },
  })

  if (!allowed) {
    return <Navigate to="/" replace />
  }

  const handleCreate = (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setCreatedUrl(null)
    createMutation.mutate({
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase(),
      adminName: form.adminName.trim(),
      adminEmail: form.adminEmail.trim(),
      adminPassword: form.adminPassword,
    })
  }

  const slugHint = form.slug.trim()
    ? `https://${form.slug.trim().toLowerCase()}.optickcloud.com`
    : 'https://{slug}.optickcloud.com'

  return (
    <div className="p-4 sm:p-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenants (plataforma)</h1>
          <p className="text-gray-500 text-sm mt-1">
            Alta de clientes Optick — solo super-admin / dueño del sistema
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowForm(true)
            setFormError(null)
            setCreatedUrl(null)
          }}
          className="btn-primary"
        >
          <Building2 size={18} />
          Nuevo tenant
        </button>
      </div>

      {createdUrl && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          Tenant creado. URL pública:{' '}
          <a href={createdUrl} className="font-medium underline" target="_blank" rel="noreferrer">
            {createdUrl}
          </a>
          <span className="block mt-1 text-green-800/80 text-xs">
            En staging, el DNS público `*.optickcloud.com` apunta a prod. Verifica con Host header
            contra Caddy/API de staging (ver docs/TENANT-ONBOARDING.md).
          </span>
        </div>
      )}

      {showForm && (
        <div className="card p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Crear tenant</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Nombre del cliente *</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                minLength={2}
                placeholder="Acme Call Center"
              />
            </div>
            <div>
              <label className="label">Slug (subdominio) *</label>
              <input
                className="input font-mono"
                value={form.slug}
                onChange={(e) =>
                  setForm({
                    ...form,
                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                  })
                }
                required
                minLength={2}
                maxLength={48}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                placeholder="acme-test"
              />
              <p className="text-xs text-gray-400 mt-1">{slugHint}</p>
            </div>
            <div>
              <label className="label">Nombre del admin *</label>
              <input
                className="input"
                value={form.adminName}
                onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                required
                minLength={2}
                placeholder="Admin Acme"
              />
            </div>
            <div>
              <label className="label">Email del admin *</label>
              <input
                type="email"
                className="input"
                value={form.adminEmail}
                onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                required
                placeholder="admin@acme.com"
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">Contraseña del admin *</label>
              <input
                type="password"
                className="input"
                value={form.adminPassword}
                onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                required
                minLength={6}
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            {formError && (
              <p className="md:col-span-2 text-sm text-red-600">{formError}</p>
            )}
            <div className="md:col-span-2 flex gap-3">
              <button
                type="submit"
                className="btn-primary"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Check size={16} />
                )}
                Crear tenant
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowForm(false)
                  setForm(emptyForm)
                  setFormError(null)
                }}
              >
                <X size={16} />
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Tenants existentes</h2>
        </div>
        {tenantsQuery.isLoading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Cargando…</div>
        ) : tenantsQuery.isError ? (
          <div className="p-8 text-center text-red-600 text-sm">
            No se pudo cargar la lista de tenants
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 sm:px-6 py-3 font-medium">Nombre</th>
                  <th className="px-4 sm:px-6 py-3 font-medium">Slug</th>
                  <th className="px-4 sm:px-6 py-3 font-medium">Estado</th>
                  <th className="px-4 sm:px-6 py-3 font-medium">Creado</th>
                  <th className="px-4 sm:px-6 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(tenantsQuery.data ?? []).map((t: PlatformTenant) => (
                  <tr key={t.id} className="hover:bg-gray-50/80">
                    <td className="px-4 sm:px-6 py-3 font-medium text-gray-900">{t.name}</td>
                    <td className="px-4 sm:px-6 py-3 font-mono text-gray-700">{t.slug}</td>
                    <td className="px-4 sm:px-6 py-3">{statusBadge(t.status)}</td>
                    <td className="px-4 sm:px-6 py-3 text-gray-500">
                      {new Date(t.createdAt).toLocaleString('es-PE')}
                    </td>
                    <td className="px-4 sm:px-6 py-3">
                      {t.slug === 'crm' ? (
                        <span className="text-xs text-gray-400">Optick</span>
                      ) : t.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900"
                          disabled={statusMutation.isPending}
                          onClick={() =>
                            statusMutation.mutate({ id: t.id, status: 'SUSPENDED' })
                          }
                        >
                          <PauseCircle size={14} />
                          Suspender
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs text-green-700 hover:text-green-900"
                          disabled={statusMutation.isPending}
                          onClick={() =>
                            statusMutation.mutate({ id: t.id, status: 'ACTIVE' })
                          }
                        >
                          <PlayCircle size={14} />
                          Reactivar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
