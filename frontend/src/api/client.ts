import axios from 'axios'

// En producción VITE_API_URL apunta al backend (ej: https://llamadas-backend.onrender.com)
// En desarrollo usa el proxy de Vite (/api → localhost:3001)
const BASE_URL = (import.meta.env.VITE_API_URL ?? '').length > 0
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isLoginRequest = err.config?.url?.includes('/auth/login')
    if (err.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// ─── Auth ─────────────────────────────────────────────────
export const login = (email: string, password: string) =>
  api.post('/auth/login', { email, password }).then((r) => r.data)

export const getMe = () => api.get('/auth/me').then((r) => r.data)

// ─── Contact (public, no auth required) ───────────────────
export type ContactFormPayload = {
  nombre: string
  empresa?: string
  email: string
  asunto: 'soporte' | 'comercial' | 'demo'
  mensaje: string
}

export type ContactFormResult =
  | { ok: true; message: string }
  | { ok: false; smtpNotConfigured: true; error: string }
  | { ok: false; smtpNotConfigured?: false; error: string }

export async function submitContactForm(
  payload: ContactFormPayload
): Promise<ContactFormResult> {
  try {
    const { data } = await api.post<{ ok: boolean; message: string }>('/contact', payload)
    return { ok: true, message: data.message }
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status
      const body = err.response?.data as { error?: string; smtpNotConfigured?: boolean } | undefined
      if (status === 503 && body?.smtpNotConfigured) {
        return {
          ok: false,
          smtpNotConfigured: true,
          error: body.error ?? 'SMTP no configurado',
        }
      }
      if (body?.error) {
        return { ok: false, error: body.error }
      }
    }
    throw err
  }
}

// ─── Users ────────────────────────────────────────────────
export type AppUser = {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'AGENT'
  isSuperAdmin?: boolean
  active: boolean
  createdAt?: string
  _count: {
    assignments: number
    callLogs: number
    callbacks: number
    imports: number
  }
}

export const getUsers = () => api.get<AppUser[]>('/users').then((r) => r.data)
export const createUser = (data: object) => api.post('/users', data).then((r) => r.data)
export const updateUser = (id: string, data: object) =>
  api.put(`/users/${id}`, data).then((r) => r.data)
export const deactivateUser = (id: string) => updateUser(id, { active: false })
export const reactivateUser = (id: string) => updateUser(id, { active: true })
export const deleteUser = (id: string) => api.delete(`/users/${id}`).then((r) => r.data)

// ─── Imports ──────────────────────────────────────────────
export const getImports = () => api.get('/imports').then((r) => r.data)
export const getImport = (id: string) => api.get(`/imports/${id}`).then((r) => r.data)
export const patchImport = (id: string, data: { blocked: boolean }) =>
  api.patch(`/imports/${id}`, data).then((r) => r.data)
export const deleteImport = (id: string) => api.delete(`/imports/${id}`).then((r) => r.data)

export type UploadImportOptions = {
  confirmDuplicate?: boolean
  displayName?: string
}

export type DuplicateFileWarning = {
  error: 'duplicate_file_warning'
  severity: 'filename' | 'filename_and_size' | 'size_only'
  existingBatch: {
    id: string
    filename: string
    fileSizeBytes: number | null
    createdAt: string
    sourceRowCount?: number | null
    companyCount: number
    contactCount: number
  }
}

export const uploadImport = (file: File, options?: UploadImportOptions) => {
  const form = new FormData()
  form.append('file', file)
  if (options?.confirmDuplicate) {
    form.append('confirmDuplicate', 'true')
  }
  if (options?.displayName?.trim()) {
    form.append('displayName', options.displayName.trim())
  }
  return api.post('/imports', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

// ─── Clients ──────────────────────────────────────────────
export const getClients = (params?: object) =>
  api.get('/clients', { params }).then((r) => r.data)
export const getClient = (id: string) => api.get(`/clients/${id}`).then((r) => r.data)
export const updateClient = (id: string, data: object) =>
  api.put(`/clients/${id}`, data).then((r) => r.data)

export const updateContact = (
  id: string,
  data: { telefono?: string | null; email?: string | null; dni?: string | null }
) => api.put(`/contacts/${id}`, data).then((r) => r.data)

export const downloadImportExport = async (id: string, agentId?: string) => {
  const response = await api.get(`/imports/${id}/export`, {
    params: agentId ? { agentId } : undefined,
    responseType: 'blob',
  })
  const disposition = response.headers['content-disposition'] as string | undefined
  let filename = 'export.xlsx'
  const match = disposition?.match(/filename="([^"]+)"/)
  if (match?.[1]) filename = match[1]
  const url = window.URL.createObjectURL(new Blob([response.data]))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.URL.revokeObjectURL(url)
}

// ─── Assignments ──────────────────────────────────────────
export const getAssignments = () => api.get('/assignments').then((r) => r.data)

export type AssignmentPreview = {
  requestedCount: number
  contactIds: string[]
  completeBoundary: boolean
  boundaryCompany: {
    id: string
    ruc: string
    razonSocial: string | null
    included: number
    total: number
    missing: number
  } | null
  suggestions: {
    expandTo: number
    expandAdd: number
    shrinkTo: number
    shrinkRemove: number
    expandContactIds: string[]
    shrinkContactIds: string[]
  } | null
  conflictWarning: {
    hasMixedAgents: boolean
    assignedToOthers: number
    agents: { id: string; name: string }[]
  } | null
}

export const previewAssignment = (data: {
  agentId: string
  batchId?: string
  count?: number
}) => api.post<AssignmentPreview>('/assignments/preview', data).then((r) => r.data)

export type AssignmentResult = {
  assigned: number
  skipped: number
}

export const createAssignment = (data: {
  agentId: string
  batchId?: string
  count?: number
  clientIds?: string[]
  contactIds?: string[]
}) =>
  api.post<AssignmentResult>('/assignments', data).then((r) => r.data)

export const deleteAssignment = (id: string) =>
  api.delete(`/assignments/${id}`).then((r) => r.data)

// ─── Calls ────────────────────────────────────────────────
export const getCalls = (params?: object) =>
  api.get('/calls', { params }).then((r) => r.data)
export const logCall = (data: object) => api.post('/calls', data).then((r) => r.data)

// ─── Callbacks ────────────────────────────────────────────
export const getCallbacks = (params?: object) =>
  api.get('/callbacks', { params }).then((r) => r.data)
export const createCallback = (data: object) =>
  api.post('/callbacks', data).then((r) => r.data)
export const updateCallback = (id: string, data: object) =>
  api.put(`/callbacks/${id}`, data).then((r) => r.data)

// ─── Dashboard ────────────────────────────────────────────
export const getDashboardStats = (batchId?: string) =>
  api.get('/dashboard/stats', { params: batchId ? { batchId } : undefined }).then((r) => r.data)
export const getAgentStats = () => api.get('/dashboard/agents-stats').then((r) => r.data)
export const getReports = (agentId?: string) =>
  api.get('/dashboard/reports', { params: agentId ? { agentId } : undefined }).then((r) => r.data)
export const getMyBatches = () => api.get('/dashboard/my-batches').then((r) => r.data)

// ─── Admin ─────────────────────────────────────────────────────────────────────
export const getResetPreview = () => api.get('/admin/reset-campaign/preview').then((r) => r.data)
export const resetCampaign = () => api.post('/admin/reset-campaign', { confirm: 'RESETEAR' }).then((r) => r.data)
