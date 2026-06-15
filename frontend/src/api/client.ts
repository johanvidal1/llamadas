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

// ─── Users ────────────────────────────────────────────────
export const getUsers = () => api.get('/users').then((r) => r.data)
export const createUser = (data: object) => api.post('/users', data).then((r) => r.data)
export const updateUser = (id: string, data: object) =>
  api.put(`/users/${id}`, data).then((r) => r.data)
export const deleteUser = (id: string) => api.delete(`/users/${id}`).then((r) => r.data)

// ─── Imports ──────────────────────────────────────────────
export const getImports = () => api.get('/imports').then((r) => r.data)
export const getImport = (id: string) => api.get(`/imports/${id}`).then((r) => r.data)
export const deleteImport = (id: string) => api.delete(`/imports/${id}`).then((r) => r.data)
export const uploadImport = (file: File) => {
  const form = new FormData()
  form.append('file', file)
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
  conflict: {
    hasConflict: boolean
    otherAgentNames: string[]
  }
}

export const previewAssignment = (data: {
  agentId: string
  batchId?: string
  count?: number
}) => api.post<AssignmentPreview>('/assignments/preview', data).then((r) => r.data)

export const createAssignment = (data: {
  agentId: string
  batchId?: string
  count?: number
  clientIds?: string[]
  contactIds?: string[]
}) =>
  api.post('/assignments', data).then((r) => r.data)

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
