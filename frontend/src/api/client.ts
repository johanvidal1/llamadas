import axios from 'axios'
import { filenameFromContentDisposition, saveBlobWithPicker } from '../lib/downloadFile'

// Ubuntu multi-tenant: dejar VITE_API_URL vacío → BASE_URL = '/api' (same-origin).
// Si se fija (legado Render / API en otro origen), axios usa `${VITE_API_URL}/api`.
// Dev: proxy Vite (/api → localhost:3001).
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
      const code = err.response?.data?.code as string | undefined
      if (code === 'SESSION_REVOKED') {
        sessionStorage.setItem('sessionRevoked', '1')
      }
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
  isSystemOwner?: boolean
  active: boolean
  createdAt?: string
  assignedCompanies?: number
  pendingCompanies?: number
  assignmentRunCount?: number
  lastAssignmentAt?: string | null
  callsToday?: number
  callbacksToday?: number
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
export type ImportBatch = {
  id: string
  filename: string
  displayName?: string | null
  fileSizeBytes?: number | null
  sourceRowCount?: number | null
  totalRecords: number
  blocked?: boolean
  companyCount: number
  contactCount: number
  unassignedCompanyCount?: number
  hasOriginalFile?: boolean
  hasUpdates?: boolean
  createdAt: string
  importedBy: { name: string }
}

export const getImports = () => api.get<ImportBatch[]>('/imports').then((r) => r.data)
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
export type GetClientsParams = {
  page?: number
  limit?: number
  search?: string
  status?: string
  disposition?: string
  batchId?: string
  agentId?: string
  unassigned?: boolean
  registeredFrom?: string
  registeredTo?: string
  sortBy?: string
  includePipeline?: boolean
}

export type ClientsPipelineSummaryResponse = {
  pipelineCounts: Record<string, number>
  assignmentSummary?: {
    assignedCompanies: number
    pendingCompanies: number
    registeredCompanies: number
  }
  registrationCount?: number
  total?: number
  page?: number
  limit?: number
}

export type ClientsDaySummaryEntry = {
  dayKey: string
  count: number
  registered: number
  pending: number
}

export type ClientsDaySummaryResponse = {
  days: ClientsDaySummaryEntry[]
  total: number
}

/** Response shape for the Clients admin list (date filter fields optional). */
export type ClientListItem = {
  id: string
  ruc: string
  razonSocial?: string
  status: string
  lastDisposition?: string | null
  lastAclaracion?: string | null
  lastCalledAt?: string | null
  /** Earliest scoped call timestamp (first registration). */
  firstRegisteredAt?: string | null
  lastCallContactId?: string | null
  /** Agent who saved the most recent scoped call log. */
  lastCallAgent?: { id?: string; name: string } | null
  /** Scoped call-log count (matches lastCalledAt / disposition agent filter). */
  callLogCount?: number
  /** Calls to this company within the active registeredFrom/registeredTo filter. */
  periodCallCount?: number
  contacts: {
    id?: string
    nombre: string
    tipoContacto?: string
    telefono?: string
    assignment?: { agent?: { id?: string; name: string } }
  }[]
  importBatch?: { filename: string; createdAt: string }
  callbacks?: { scheduledAt: string; notes?: string }[]
  _count: { callLogs: number }
}

export type ClientsListResponse = {
  clients: ClientListItem[]
  total: number
  page: number
  limit: number
  registrationCount?: number
  pipelineCounts?: Record<string, number>
  assignmentSummary?: {
    assignedCompanies: number
    pendingCompanies: number
    registeredCompanies: number
  }
}

export const getClients = (params?: GetClientsParams) =>
  api.get('/clients', { params }).then((r) => r.data)

export const getClientsPipelineSummary = (params?: Omit<GetClientsParams, 'page' | 'limit' | 'sortBy' | 'includePipeline'>) =>
  api.get('/clients/pipeline-summary', { params }).then((r) => r.data as ClientsPipelineSummaryResponse)

export const getClientsDaySummary = (params?: Omit<GetClientsParams, 'page' | 'limit' | 'sortBy' | 'includePipeline'>) =>
  api.get('/clients/day-summary', { params }).then((r) => r.data as ClientsDaySummaryResponse)
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
  const filename = filenameFromContentDisposition(disposition) ?? 'export.xlsx'
  const blob = new Blob([response.data])
  return saveBlobWithPicker(blob, filename)
}

export const downloadImportOriginal = async (id: string) => {
  const response = await api.get(`/imports/${id}/original`, {
    responseType: 'blob',
  })
  const disposition = response.headers['content-disposition'] as string | undefined
  const filename = filenameFromContentDisposition(disposition) ?? 'import.xlsx'
  const blob = new Blob([response.data])
  return saveBlobWithPicker(blob, filename)
}

// ─── Assignments ──────────────────────────────────────────
export const getAssignments = () => api.get('/assignments').then((r) => r.data)

export type AssignmentPreview = {
  requestedCompanyCount: number
  companyIds: string[]
  contactIds: string[]
  assignedCompanies: number
  assignedContacts: number
  completeBoundary: boolean
  boundaryCompany: null
  suggestions: null
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
  assignedCompanies: number
  assignedContacts: number
  skipped: number
  runId?: string
}

export type AssignmentRun = {
  id: string
  assignedAt: string
  importBatchId: string | null
  filename: string | null
  companyCount: number
  contactCount: number
  assignedBy: { id: string; name: string }
  status?: 'ACTIVE' | 'PARTIALLY_RELEASED' | 'PAUSED' | 'CLOSED'
  releasedAt?: string | null
  isLegacy?: boolean
  isBeforeLastReset?: boolean
  callCount: number
  contactedCompanies: number
  pendingCompanies: number
  firstCallAt: string | null
  lastCallAt: string | null
}

export type AssignmentRunsResponse = {
  lastResetAt: string | null
  runs: AssignmentRun[]
  activeRuns: AssignmentRun[]
  archivedRuns: AssignmentRun[]
}

export type AssignmentRunCompany = {
  id: string
  ruc: string
  razonSocial: string | null
  status: string
  contactCount: number
  createdAt?: string
  lastDisposition?: string | null
  lastAclaracion?: string | null
  lastCalledAt?: string | null
  callLogCount?: number
}

export const getAssignmentRuns = (agentId: string, batchId?: string) =>
  api
    .get<AssignmentRunsResponse>('/assignments/runs', {
      params: { agentId, ...(batchId ? { batchId } : {}) },
    })
    .then((r) => r.data)

export const getAssignmentRunCompanies = (runId: string) =>
  api
    .get<{ companies: AssignmentRunCompany[] }>(`/assignments/runs/${runId}/companies`)
    .then((r) => r.data)

export const getUntrackedCompanies = (agentId: string, batchId: string) =>
  api
    .get<{ companies: AssignmentRunCompany[] }>('/assignments/untracked-companies', {
      params: { agentId, batchId },
    })
    .then((r) => r.data)

export type ReleasePreview = {
  run: {
    id: string | null
    isLegacy: boolean
    agentId: string
    importBatchId: string | null
    status: string | null
    companyCount: number
    contactCount: number
  }
  releasableCompanies: AssignmentRunCompany[]
  retainedCompanies: AssignmentRunCompany[]
  releasableCount: number
  retainedCount: number
  releasableContactCount: number
  blockedByCallbacks?: number
}

export type ReleaseResult = {
  releasedCompanies: number
  releasedContacts: number
  retainedCompanies: number
  status?: string
}

export const previewReleaseRun = (runId: string) =>
  api
    .post<ReleasePreview>(`/assignments/runs/${runId}/release-preview`)
    .then((r) => r.data)

export const releaseRunRemainder = (runId: string, reason?: string) =>
  api
    .post<ReleaseResult>(`/assignments/runs/${runId}/release-remainder`, { reason })
    .then((r) => r.data)

export const previewReleaseLegacy = (agentId: string, batchId: string) =>
  api
    .post<ReleasePreview>('/assignments/release-legacy-preview', { agentId, batchId })
    .then((r) => r.data)

export const releaseLegacyRemainder = (agentId: string, batchId: string, reason?: string) =>
  api
    .post<ReleaseResult>('/assignments/release-legacy', { agentId, batchId, reason })
    .then((r) => r.data)

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
export type CallLogListItem = {
  id: string
  disposition: string
  calledAt: string
  updatedAt?: string
  companyId: string
  company: { id: string; ruc: string; razonSocial?: string | null }
  contact?: { id: string; nombre: string; tipoContacto?: string | null } | null
  agent?: { name: string }
}

export type CallLogListResponse = {
  calls: CallLogListItem[]
  total: number
}

export type GetCallsParams = {
  clientId?: string
  agentId?: string
  limit?: number
  page?: number
  from?: string
  to?: string
  disposition?: string
  funnel?: boolean
  batchId?: string
  timeFrom?: string
  timeTo?: string
}

export const getCalls = (params?: GetCallsParams) =>
  api.get<CallLogListResponse>('/calls', { params }).then((r) => r.data)
export const logCall = (data: object) => api.post('/calls', data).then((r) => r.data)
export const updateCall = (id: string, data: object) =>
  api.put(`/calls/${id}`, data).then((r) => r.data)
export const deleteCall = (id: string) => api.delete(`/calls/${id}`).then((r) => r.data)

// ─── Callbacks ────────────────────────────────────────────
export const getCallbacks = (params?: object) =>
  api.get('/callbacks', { params }).then((r) => r.data)
export const createCallback = (data: object) =>
  api.post('/callbacks', data).then((r) => r.data)
export const updateCallback = (id: string, data: object) =>
  api.put(`/callbacks/${id}`, data).then((r) => r.data)

// ─── Dashboard ────────────────────────────────────────────
export type CompanyPipelineCounts = Record<string, number>

export type DashboardRecentCall = {
  id: string
  disposition: string
  calledAt: string
  company: { id: string; ruc: string; razonSocial?: string }
  contact?: { nombre: string } | null
  agent?: { name: string }
  nextCallback?: { scheduledAt: string; notes?: string } | null
}

/** Shape varies by role; fields are optional where not returned for that role. */
export type DashboardStats = {
  totalCalls: number
  pendingCallbacks: number
  recentCalls: DashboardRecentCall[]
  companyPipeline?: CompanyPipelineCounts
  assignedCompanies?: number
  assignedContacts?: number
  // admin
  totalClients?: number
  totalContacts?: number
  totalAgents?: number
  companyContactRate?: number
  contactsByStatus?: Record<string, number>
  companiesByStatus?: Record<string, number>
  clientsByStatus?: Record<string, number>
  // agent
  assignedClients?: number
  todayCallbacks?: number
}

export const getDashboardStats = (batchId?: string) =>
  api
    .get<DashboardStats>('/dashboard/stats', { params: batchId ? { batchId } : undefined })
    .then((r) => r.data)
export const getAgentStats = () => api.get('/dashboard/agents-stats').then((r) => r.data)
export type DailyActivityPoint = {
  date: string
  calls: number
  newRegistrations: number
  updatedRegistrations: number
  contactedCompanies?: number
}

export type HourlyActivityPoint = {
  hour: number
  calls: number
  newRegistrations: number
  updatedRegistrations: number
}

export type ReportTrendsResponse = {
  series: DailyActivityPoint[]
  from: string
  to: string
  granularity: CallActivityGranularity
  source: 'table' | 'sql'
}

export type ReportHourlyResponse = {
  date: string
  agentId: string
  series: HourlyActivityPoint[]
}

export type GetReportTrendsParams = {
  from?: string
  to?: string
  agentId?: string
  granularity?: CallActivityGranularity
}

export const getReportTrends = (params?: GetReportTrendsParams) =>
  api.get<ReportTrendsResponse>('/dashboard/reports/trends', { params }).then((r) => r.data)

export const getReportHourly = (params: { date?: string; agentId: string }) =>
  api.get<ReportHourlyResponse>('/dashboard/reports/hourly', { params }).then((r) => r.data)

export type ReportChartPeriod = 'day' | 'week' | 'month' | 'range'

export type AgentCallChartRow = {
  agentId: string
  name: string
  calls: number
  registered: number
}

export type AgentCallsChartResponse = {
  period: ReportChartPeriod
  date: string
  from: string
  to: string
  agents: AgentCallChartRow[]
}

export type CallHeatmapCell = {
  dow: number
  hour: number
  calls: number
}

export type CallHeatmapResponse = {
  from: string
  to: string
  cells: CallHeatmapCell[]
}

export type FunnelByPeriodResponse = {
  from: string
  to: string
  stages: Record<string, number>
  total: number
  registeredStages: Record<string, number>
  registeredTotal: number
}

export type ZeroByPeriodResponse = {
  from: string
  to: string
  dispositions: Record<string, number>
  total: number
  registeredDispositions: Record<string, number>
  registeredTotal: number
}

export const getReportAgentCalls = (params?: {
  period?: ReportChartPeriod
  date?: string
  from?: string
  to?: string
}) =>
  api
    .get<AgentCallsChartResponse>('/dashboard/reports/agent-calls', { params })
    .then((r) => r.data)

export const getReportFunnelByPeriod = (params: { from: string; to: string; agentId?: string }) =>
  api
    .get<FunnelByPeriodResponse>('/dashboard/reports/funnel-by-period', { params })
    .then((r) => r.data)

export const getReportZeroByPeriod = (params: { from: string; to: string; agentId?: string }) =>
  api
    .get<ZeroByPeriodResponse>('/dashboard/reports/zero-by-period', { params })
    .then((r) => r.data)

export const getReportCallHeatmap = (params?: { from?: string; to?: string; weeks?: number; agentId?: string }) =>
  api
    .get<CallHeatmapResponse>('/dashboard/reports/call-heatmap', { params })
    .then((r) => r.data)

export type SparklinePoint = { date: string; calls: number }

export type ReportsSection = 'summary' | 'agents' | 'batches'

export type ReportsSummaryResponse = Pick<
  ReportsResponse,
  | 'callsByDay'
  | 'dispositionBreakdown'
  | 'assignedCompanies'
  | 'companyPipeline'
  | 'companyDispositionCounts'
  | 'funnel'
>

export type ReportsAgentsResponse = Pick<ReportsResponse, 'agentPerformance'>

export type ReportsBatchesResponse = Pick<ReportsResponse, 'batchProgress'>

export const getReports = (
  agentId?: string,
  options?: { refresh?: boolean; sections?: ReportsSection[] }
) =>
  api
    .get<Partial<ReportsResponse>>('/dashboard/reports', {
      params: {
        ...(agentId ? { agentId } : {}),
        ...(options?.refresh ? { refresh: 'true' } : {}),
        ...(options?.sections?.length ? { sections: options.sections.join(',') } : {}),
      },
    })
    .then((r) => r.data)

export const getAgentReportRuns = (agentId: string, options?: { refresh?: boolean }) =>
  api
    .get<{ assignmentRuns: BatchAssignmentRunMetrics[] }>(
      `/dashboard/reports/agent/${agentId}/runs`,
      { params: options?.refresh ? { refresh: 'true' } : undefined }
    )
    .then((r) => r.data)

export type BatchReportBreakdownResponse =
  | { agentBreakdown: BatchAgentBreakdownRow[]; assignmentRuns?: undefined }
  | { assignmentRuns: BatchAssignmentRunMetrics[]; agentBreakdown?: undefined }

export const getBatchReportBreakdown = (batchId: string, agentId?: string) =>
  api
    .get<BatchReportBreakdownResponse>(`/dashboard/reports/batch/${batchId}/breakdown`, {
      params: agentId ? { agentId } : undefined,
    })
    .then((r) => r.data)

export type BatchAgentBreakdownRow = {
  agentId: string
  agentName: string
  assignedCompanies: number
  callCount: number
  contactedCompanies: number
  contactedPct: number
  inFunnel: number
  ventaCerrada: number
  assignmentRuns: BatchAssignmentRunMetrics[]
}

export type BatchProgressRow = {
  id: string
  filename: string
  createdAt: string
  batchTotalCompanies: number
  assignedCompanies: number
  assignedToAgentCompanies: number | null
  unassignedCompanies: number
  callCount: number
  contactedCompanies: number
  contactedPct: number
  inFunnel: number
  ventaCerrada: number
  pendingCompanies: number
  companyPipeline: Record<string, number>
  assignmentRuns?: BatchAssignmentRunMetrics[]
  agentBreakdown?: BatchAgentBreakdownRow[]
}

export type ReportsResponse = {
  agentPerformance: Array<{
    id: string
    name: string
    assigned: number
    assignedCompanies: number
    calledClients: number
    calledContacts: number
    companiesWithResponse: number
    companiesInFunnel: number
    totalCalls: number
    interested: number
    converted: number
    notInterested: number
    interestedRecords: number
    convertedRecords: number
    notInterestedRecords: number
    pendingRecords: number
    interestedCompanies: number
    convertedCompanies: number
    notInterestedCompanies: number
    pendingCompanies: number
    ventaCerrada: number
    closeRate: number
    contactRate: number
    companyContactRate: number
    conversionRate: number
    avgCallsPerClient: number
    avgCallsPerContact: number
    pendingCallbacks: number
    overdueCallbacks: number
    sparkline?: SparklinePoint[]
    assignmentRuns?: BatchAssignmentRunMetrics[]
  }>
  callsByDay: DailyActivityPoint[]
  dispositionBreakdown: { disposition: string; count: number }[]
  batchProgress: BatchProgressRow[]
  assignedCompanies: number
  companyPipeline: Record<string, number>
  companyDispositionCounts?: Record<string, number>
  funnel: {
    companies: {
      total: number
      assigned: number
      pending: number
      inProgress: number
      interested: number
      converted: number
      notInterested: number
      doNotCall: number
    }
  }
}

export type CallActivityGranularity = 'day' | 'week' | 'month'

export type CallActivityAgentStats = {
  agentId: string
  name: string
  totalCalls: number
  avgGapMinutes: number | null
  medianGapMinutes: number | null
  gapCount: number
}

export type CallActivityResponse = {
  series: { period: string; count: number }[]
  byAgent: CallActivityAgentStats[]
  totalCalls: number
  avgGapMinutes: number | null
  medianGapMinutes: number | null
  gapCount: number
  from: string
  to: string
  granularity: CallActivityGranularity
}

export type BatchAssignmentRunMetrics = {
  id: string
  isLegacy?: boolean
  assignedAt: string | null
  companyCount: number
  assignedBy: { name: string }
  batchLabel?: string
  callCount: number
  contactedCompanies: number
  contactedPct: number
  inFunnel: number
  ventaCerrada: number
  pendingCompanies: number
  closeRate: number
}

export type BatchDetail = {
  id: string
  filename: string
  createdAt: string
  batchTotalCompanies: number
  assignedCompanies: number
  assignedToAgentCompanies: number | null
  unassignedCompanies: number
  callCount: number
  contactedCompanies: number
  contactedPct: number
  inFunnel: number
  ventaCerrada: number
  pendingCompanies: number
  companyPipeline: Record<string, number>
  assignmentRuns?: BatchAssignmentRunMetrics[]
}

export type GetCallActivityParams = {
  agentId?: string
  batchId?: string
  from?: string
  to?: string
  granularity?: CallActivityGranularity
}

export const getCallActivity = (params?: GetCallActivityParams) =>
  api.get<CallActivityResponse>('/dashboard/call-activity', { params }).then((r) => r.data)

export const getBatchDetail = (batchId: string, agentId?: string) =>
  api
    .get<BatchDetail>(`/dashboard/batch/${batchId}`, {
      params: agentId ? { agentId } : undefined,
    })
    .then((r) => r.data)

export const getMyBatches = () => api.get('/dashboard/my-batches').then((r) => r.data)

// ─── Admin ─────────────────────────────────────────────────────────────────────
export const getResetPreview = () => api.get('/admin/reset-campaign/preview').then((r) => r.data)
export const resetCampaign = () => api.post('/admin/reset-campaign', { confirm: 'RESETEAR' }).then((r) => r.data)

export type AgentResetPreview = {
  agent: { id: string; name: string; email: string }
  callLogsToArchive: number
  pendingCompaniesToRelease: number
  workedCompaniesCount: number
  pendingCallbacksCount: number
  completedCallbacksCount: number
  sharedWithOtherAgentsCount: number
}

export type AgentResetResult = {
  message: string
  counts: {
    callLogsReassigned: number
    callbacksReassigned: number
    pendingCallbacksDeleted: number
    assignmentsDeleted: number
    runsClosed: number
    metricsDeleted: number
  }
}

export const getAgentResetPreview = (agentId: string) =>
  api.get<AgentResetPreview>(`/admin/agents/${agentId}/reset-preview`).then((r) => r.data)

export const resetAgent = (
  agentId: string,
  body: { confirm: 'RESETEAR'; deletePendingCallbacks: boolean; reason?: string }
) => api.post<AgentResetResult>(`/admin/agents/${agentId}/reset`, body).then((r) => r.data)

// ─── Presence ──────────────────────────────────────────────────────────────────
export type AgentPresenceStatus = 'online' | 'recent' | 'offline'

export type AgentSession = {
  browser: string | null
  os: string | null
  platform: string | null
  ipAddress: string | null
  currentRoute: string | null
  lastSeenAt: string
  loginAt: string
  deviceLabel: string | null
}

export type AgentPresence = {
  id: string
  name: string
  email: string
  status: AgentPresenceStatus
  sessions: AgentSession[]
}

export const sendHeartbeat = (payload: {
  deviceId: string
  currentRoute?: string
  platform?: string
  deviceLabel?: string
}) => api.post('/presence/heartbeat', payload)

export const sendPresenceLogout = (deviceId: string) =>
  api.post('/presence/logout', { deviceId })

export const getAgentPresence = () =>
  api.get<AgentPresence[]>('/presence/agents').then((r) => r.data)

export const revokeAgentSessions = (userId: string) =>
  api.post<{ ok: true }>(`/presence/agents/${userId}/revoke-sessions`).then((r) => r.data)

// ─── Platform (Optick super-admin / system owner) ─────────────────────────────
export type PlatformTenant = {
  id: string
  name: string
  slug: string
  status: string
  createdAt: string
}

export type CreatePlatformTenantPayload = {
  name: string
  slug: string
  adminEmail: string
  adminName: string
  adminPassword: string
}

export type CreatePlatformTenantResult = {
  tenant: { id: string; name: string; slug: string; status: string }
  admin: { id: string; email: string; name: string }
  url: string
}

export const listPlatformTenants = () =>
  api.get<PlatformTenant[]>('/platform/tenants').then((r) => r.data)

export const createPlatformTenant = (data: CreatePlatformTenantPayload) =>
  api.post<CreatePlatformTenantResult>('/platform/tenants', data).then((r) => r.data)

export const patchPlatformTenantStatus = (id: string, status: 'ACTIVE' | 'SUSPENDED') =>
  api
    .patch<PlatformTenant>(`/platform/tenants/${id}`, { status })
    .then((r) => r.data)
