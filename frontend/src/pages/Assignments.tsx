import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getUsers,
  getImports,
  getClients,
  createAssignment,
  previewAssignment,
  getAssignmentRuns,
  getAssignmentRunCompanies,
  getUntrackedCompanies,
  previewReleaseRun,
  previewReleaseLegacy,
  releaseRunRemainder,
  releaseLegacyRemainder,
  type AssignmentPreview,
  type AssignmentResult,
  type AssignmentRun,
  type AssignmentRunCompany,
  type ReleasePreview,
} from '../api/client'
import toast from 'react-hot-toast'
import { UserCheck, Users, AlertCircle, X, ChevronDown, ChevronRight, History, PackageOpen } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { DispositionBadge } from '../components/StatusBadge'
import { getResponseOption } from '../config/responseOptions'

function batchLabel(batch: { displayName?: string | null; filename: string }) {
  return batch.displayName?.trim() || batch.filename
}

function normalizeSearch(s: string) {
  return s.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

function matchesCompanySearch(c: AssignmentRunCompany, q: string) {
  const needle = normalizeSearch(q)
  if (!needle) return true
  return (
    normalizeSearch(c.ruc).includes(needle) ||
    normalizeSearch(c.razonSocial ?? '').includes(needle)
  )
}

function formatRunActivityDates(firstCallAt: string | null, lastCallAt: string | null): string | null {
  if (!lastCallAt) return null
  const last = new Date(lastCallAt)
  if (!firstCallAt) {
    return `Última: ${format(last, 'd MMM HH:mm', { locale: es })}`
  }
  const first = new Date(firstCallAt)
  const sameDay = format(first, 'yyyy-MM-dd') === format(last, 'yyyy-MM-dd')
  if (sameDay) {
    return `Última: ${format(last, 'd MMM HH:mm', { locale: es })}`
  }
  return `Primera–última: ${format(first, 'd MMM', { locale: es })} – ${format(last, 'd MMM', { locale: es })}`
}

function RunActivityMetrics({ run }: { run: AssignmentRun }) {
  const showReleasedHint =
    (run.status === 'PARTIALLY_RELEASED' || run.status === 'CLOSED') && run.releasedAt
  const releasedHint = showReleasedHint
    ? `Liberada ${format(new Date(run.releasedAt!), 'd MMM yyyy, HH:mm', { locale: es })}`
    : null
  const dateLine = formatRunActivityDates(run.firstCallAt, run.lastCallAt)

  if (run.callCount === 0) {
    return (
      <div className="text-xs text-gray-500 leading-snug">
        <p>Sin registros aún</p>
        {releasedHint && <p className="text-gray-400 mt-0.5">{releasedHint}</p>}
      </div>
    )
  }

  return (
    <div className="text-xs text-gray-600 leading-snug">
      <p className="whitespace-nowrap">
        {run.callCount} llam. · {run.contactedCompanies} contact. · {run.pendingCompanies} pend.
      </p>
      {dateLine && <p className="text-gray-500 mt-0.5 whitespace-nowrap">{dateLine}</p>}
      {releasedHint && <p className="text-gray-400 mt-0.5 whitespace-nowrap">{releasedHint}</p>}
    </div>
  )
}

type AssignableImport = {
  id: string
  filename: string
  displayName?: string | null
  blocked?: boolean
  companyCount: number
  contactCount: number
  unassignedCompanyCount: number
}

function importAvailabilityLabel(unassigned: number, total: number) {
  return `${unassigned} sin asignar de ${total}`
}

export default function Assignments() {
  const [agentId, setAgentId] = useState('')
  const [batchId, setBatchId] = useState('')
  const [count, setCount] = useState<number | ''>('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewModal, setPreviewModal] = useState<AssignmentPreview | null>(null)
  const [pendingAssignCount, setPendingAssignCount] = useState<number | null>(null)
  const qc = useQueryClient()

  type AssignVars = Parameters<typeof createAssignment>[0] & { expectedCount?: number }

  // Drawer state — agent detail
  const [drawerAgentId, setDrawerAgentId] = useState<string | null>(null)
  const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({})
  const [runCompanies, setRunCompanies] = useState<Record<string, AssignmentRunCompany[]>>({})
  const [loadingRunCompanies, setLoadingRunCompanies] = useState<Record<string, boolean>>({})
  const [runCompanyFilter, setRunCompanyFilter] = useState<Record<string, string>>({})

  const [releaseModal, setReleaseModal] = useState<{
    run: AssignmentRun
    agentId: string
  } | null>(null)
  const [releasePreview, setReleasePreview] = useState<ReleasePreview | null>(null)
  const [releaseReason, setReleaseReason] = useState('')
  const [releaseLoading, setReleaseLoading] = useState(false)
  const [releaseSubmitting, setReleaseSubmitting] = useState(false)

  const toggleRun = async (run: AssignmentRun, agentIdForRun: string) => {
    const runId = run.id
    const willExpand = !expandedRuns[runId]
    setExpandedRuns((prev) => ({ ...prev, [runId]: willExpand }))
    if (willExpand && !runCompanies[runId]) {
      setLoadingRunCompanies((prev) => ({ ...prev, [runId]: true }))
      try {
        const data = run.isLegacy && run.importBatchId
          ? await getUntrackedCompanies(agentIdForRun, run.importBatchId)
          : await getAssignmentRunCompanies(runId)
        setRunCompanies((prev) => ({ ...prev, [runId]: data.companies }))
      } catch {
        toast.error('Error al cargar empresas de la asignación')
        setExpandedRuns((prev) => ({ ...prev, [runId]: false }))
      } finally {
        setLoadingRunCompanies((prev) => ({ ...prev, [runId]: false }))
      }
    }
  }

  const openReleaseModal = async (run: AssignmentRun, agentIdForRun: string) => {
    setReleaseModal({ run, agentId: agentIdForRun })
    setReleasePreview(null)
    setReleaseReason('')
    setReleaseLoading(true)
    try {
      const preview = run.isLegacy && run.importBatchId
        ? await previewReleaseLegacy(agentIdForRun, run.importBatchId)
        : await previewReleaseRun(run.id)
      setReleasePreview(preview)
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Error al previsualizar la liberación'
      toast.error(message)
      setReleaseModal(null)
    } finally {
      setReleaseLoading(false)
    }
  }

  const closeReleaseModal = () => {
    if (releaseSubmitting) return
    setReleaseModal(null)
    setReleasePreview(null)
    setReleaseReason('')
  }

  const handleReleaseConfirm = async () => {
    if (!releaseModal || !releasePreview) return
    if (releasePreview.blockedByCallbacks && releasePreview.blockedByCallbacks > 0) return
    if (releasePreview.releasableCount === 0) {
      toast.error('No hay empresas pendientes para liberar')
      return
    }

    setReleaseSubmitting(true)
    try {
      const { run, agentId: agentIdForRun } = releaseModal
      const reason = releaseReason.trim() || undefined
      const result = run.isLegacy && run.importBatchId
        ? await releaseLegacyRemainder(agentIdForRun, run.importBatchId, reason)
        : await releaseRunRemainder(run.id, reason)

      closeReleaseModal()
      qc.invalidateQueries({ queryKey: ['assignmentRuns', agentIdForRun] })
      qc.invalidateQueries({ queryKey: ['assignmentRuns'] })
      qc.invalidateQueries({ queryKey: ['clients', 'unassigned'] })
      qc.invalidateQueries({ queryKey: ['imports'] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['reports'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })

      toast.success(
        `Liberadas ${result.releasedCompanies} empresas (${result.releasedContacts} contactos). ` +
          `${result.retainedCompanies} empresas retenidas por trabajo del agente.`
      )
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: string; blockedByCallbacks?: number } } })
        ?.response?.data
      toast.error(data?.error ?? 'Error al liberar remanente')
    } finally {
      setReleaseSubmitting(false)
    }
  }

  const canReleaseRun = (run: AssignmentRun) => {
    if (run.isLegacy) return true
    return !run.status || run.status === 'ACTIVE'
  }

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: getUsers })
  const { data: imports = [] } = useQuery({ queryKey: ['imports'], queryFn: getImports })

  const assignableImports = (imports as AssignableImport[]).filter((b) => !b.blocked)

  const assignableImportTotals = assignableImports.reduce(
    (acc, b) => ({
      unassigned: acc.unassigned + (b.unassignedCompanyCount ?? 0),
      total: acc.total + b.companyCount,
    }),
    { unassigned: 0, total: 0 }
  )

  useEffect(() => {
    if (!batchId) return
    const selected = imports.find((b: { id: string; blocked?: boolean }) => b.id === batchId)
    if (selected?.blocked) {
      setBatchId('')
    }
  }, [imports, batchId])

  const { data: latestRunsData } = useQuery({
    queryKey: ['assignmentRuns', agentId],
    queryFn: () => getAssignmentRuns(agentId),
    enabled: !!agentId,
  })
  const latestRun = latestRunsData?.runs[0] ?? null

  const { data: drawerRunsData, isLoading: loadingDrawerRuns } = useQuery({
    queryKey: ['assignmentRuns', drawerAgentId],
    queryFn: () => getAssignmentRuns(drawerAgentId!),
    enabled: !!drawerAgentId,
  })

  const drawerRuns: AssignmentRun[] = drawerRunsData?.runs ?? []
  const drawerRunsSummary = drawerRuns.length > 0
    ? {
        totalCompanies: drawerRuns.reduce((sum, run) => sum + run.companyCount, 0),
        assignmentCount: drawerRuns.length,
        fileCount: new Set(drawerRuns.map((run) => run.importBatchId ?? 'none')).size,
      }
    : null

  const agents = users.filter(
    (u: { role: string; active: boolean }) => u.role === 'AGENT' && u.active
  )

  // Count of unassigned registros (contacts) in selected batch
  const { data: unassignedData } = useQuery({
    queryKey: ['clients', 'unassigned', batchId],
    queryFn: () =>
      getClients({
        unassigned: true,
        batchId: batchId || undefined,
        limit: 1,
      }),
    enabled: true,
  })
  const unassignedCompanies = unassignedData?.total ?? 0
  const unassignedContacts = unassignedData?.contactCount ?? 0

  const mutation = useMutation({
    mutationFn: ({ expectedCount: _, ...vars }: AssignVars) => createAssignment(vars),
    onSuccess: (data: AssignmentResult, variables: AssignVars) => {
      if (variables.expectedCount != null) {
        setCount(data.assignedCompanies)
      }
      setPendingAssignCount(null)
      setPreviewModal(null)

      const unassignedKey = ['clients', 'unassigned', batchId]
      qc.setQueryData(
        unassignedKey,
        (old: { total?: number; contactCount?: number } | undefined) => {
          if (old?.total == null) return old
          return {
            ...old,
            total: Math.max(0, old.total - data.assignedCompanies),
            contactCount: Math.max(0, (old.contactCount ?? 0) - data.assignedContacts),
          }
        }
      )
      qc.invalidateQueries({ queryKey: unassignedKey })
      qc.invalidateQueries({ queryKey: ['imports'] })
      qc.invalidateQueries({ queryKey: ['clients', 'unassigned'] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['assignmentRuns', variables.agentId] })
      if (drawerAgentId) {
        qc.invalidateQueries({ queryKey: ['assignmentRuns', drawerAgentId] })
      }

      toast.success(`✅ ${data.assignedCompanies} empresas asignadas`)
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setPendingAssignCount(null)
      toast.error(err?.response?.data?.error ?? 'Error al asignar empresas')
    },
  })

  const assignPayload = (opts?: { count?: number; contactIds?: string[] }) => ({
    agentId,
    batchId: batchId || undefined,
    ...opts,
  })

  const runAssign = (opts?: { count?: number; contactIds?: string[]; expectedCount?: number }) => {
    const { expectedCount, ...payloadOpts } = opts ?? {}
    if (expectedCount != null) setPendingAssignCount(expectedCount)
    mutation.mutate({ ...assignPayload(payloadOpts), expectedCount })
  }

  const handleAssign = async () => {
    if (!agentId) {
      toast.error('Selecciona un agente')
      return
    }
    setPreviewLoading(true)
    try {
      const preview = await previewAssignment({
        agentId,
        batchId: batchId || undefined,
        count: count === '' ? undefined : count,
      })
      if (preview.companyIds.length === 0) {
        toast.error('No hay empresas disponibles para asignar')
        return
      }
      if (preview.conflictWarning?.hasMixedAgents) {
        setPreviewModal(preview)
        return
      }
      runAssign({
        contactIds: preview.contactIds,
        expectedCount: preview.assignedCompanies,
      })
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Error al previsualizar la asignación'
      toast.error(message)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handlePreviewChoice = () => {
    if (!previewModal) return
    runAssign({
      contactIds: previewModal.contactIds,
      expectedCount: previewModal.assignedCompanies,
    })
  }

  const selectedAgent = agents.find(
    (a: { id: string }) => a.id === agentId
  ) as { name: string } | undefined

  const selectedBatch = batchId
    ? assignableImports.find((b) => b.id === batchId)
    : undefined

  const nextAssignCount =
    pendingAssignCount ??
    (count === '' ? unassignedCompanies : Math.min(count, unassignedCompanies))

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Asignar empresas a agentes</h1>
        <p className="text-gray-500 text-sm mt-1">
          Distribuye empresas (RUC) entre tu equipo; todos los contactos de cada empresa se asignan juntos
        </p>
      </div>

      {/* Assignment form */}
      <div className="card p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Agent selector */}
          <div>
            <label className="label">Agente *</label>
            <select
              className="input"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              <option value="">Seleccionar agente...</option>
              {agents.map((a: {
                id: string
                name: string
                assignedCompanies?: number
                _count?: { assignments: number }
              }) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.assignedCompanies ?? 0} empresas)
                </option>
              ))}
            </select>
          </div>

          {/* Batch selector */}
          <div>
            <label className="label">Importación (opcional)</label>
            <select
              className="input"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
            >
              <option value="">
                Todos los archivos ({importAvailabilityLabel(
                  assignableImportTotals.unassigned,
                  assignableImportTotals.total
                )})
              </option>
              {assignableImports.map((b) => (
                <option key={b.id} value={b.id}>
                  {batchLabel(b)} ({importAvailabilityLabel(
                    b.unassignedCompanyCount ?? 0,
                    b.companyCount
                  )})
                </option>
              ))}
            </select>
          </div>

          {/* Count */}
          <div>
            <label className="label">Cantidad de empresas</label>
            <input
              type="number"
              className="input"
              min={1}
              max={unassignedCompanies || 9999}
              value={count}
              placeholder="Todos los disponibles"
              onChange={(e) => setCount(e.target.value === '' ? '' : Number(e.target.value))}
            />
            {unassignedCompanies > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Máx. {unassignedCompanies} sin asignar
              </p>
            )}
          </div>
        </div>

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-blue-500 shrink-0 mt-0.5" />
          <dl className="text-sm space-y-2 flex-1 min-w-0">
            {selectedAgent && (count === '' || count > 0) && unassignedCompanies > 0 && (
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <dt className="text-blue-700 font-medium shrink-0">Próxima asignación</dt>
                <dd className="text-blue-800 font-bold">
                  {pendingAssignCount != null ? (
                    <>
                      Se asignarán {nextAssignCount} empresas a {selectedAgent.name}
                    </>
                  ) : (
                    <>
                      Se asignarán hasta {nextAssignCount} empresas a {selectedAgent.name}
                    </>
                  )}
                </dd>
              </div>
            )}
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <dt className="text-blue-700 font-medium shrink-0">Disponibles</dt>
              <dd className="text-blue-800 font-medium">
                {selectedBatch ? (
                  <>
                    {unassignedCompanies} sin asignar de {selectedBatch.companyCount} en{' '}
                    {batchLabel(selectedBatch)}
                  </>
                ) : (
                  <>
                    {unassignedCompanies} sin asignar de {assignableImportTotals.total} (todos los
                    archivos)
                  </>
                )}
              </dd>
            </div>
            {latestRun && (
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <dt className="text-green-700 font-medium shrink-0">Última asignación</dt>
                <dd className="text-green-700">
                  {latestRun.companyCount} empresas ·{' '}
                  {format(new Date(latestRun.assignedAt), "d MMM yyyy, HH:mm", { locale: es })}
                  {latestRun.assignedBy?.name && <> · por {latestRun.assignedBy.name}</>}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleAssign}
            disabled={previewLoading || mutation.isPending || !agentId || unassignedCompanies === 0}
            className="btn-primary"
          >
            <UserCheck size={18} />
            {previewLoading
              ? 'Verificando...'
              : mutation.isPending
                ? 'Asignando...'
                : 'Asignar empresas'}
          </button>
          {unassignedCompanies === 0 && (
            <p className="text-sm text-amber-600 flex items-center gap-1">
              <AlertCircle size={14} />
              No hay empresas disponibles para asignar
            </p>
          )}
        </div>
      </div>

      {/* Conflict warning modal (edge case) */}
      {previewModal?.conflictWarning?.hasMixedAgents && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => !mutation.isPending && setPreviewModal(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Conflicto de asignación</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Algunas empresas seleccionadas ya tienen contactos asignados a otros agentes.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !mutation.isPending && setPreviewModal(null)}
                  className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
                  aria-label="Cerrar"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <p>
                  Contactos asignados a{' '}
                  <strong>
                    {previewModal.conflictWarning.agents.map((a) => a.name).join(', ')}
                  </strong>
                  . Continuar puede repartir contactos de la misma empresa entre agentes.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={handlePreviewChoice}
                  className="btn-primary justify-center"
                >
                  Asignar de todos modos ({previewModal.assignedCompanies} empresas,{' '}
                  {previewModal.assignedContacts} contactos)
                </button>
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => setPreviewModal(null)}
                  className="btn-secondary justify-center"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Agents summary */}
      <div>
        <h2 className="font-semibold text-gray-900 mb-4">Estado de asignaciones por agente</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map(
            (a: {
              id: string
              name: string
              email: string
              assignedCompanies?: number
              _count: { assignments: number; callLogs: number }
            }) => (
              <div
                key={a.id}
                className="card p-5 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
                onClick={() => { setDrawerAgentId(a.id); setExpandedRuns({}) }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-sm">
                    {a.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{a.name}</p>
                    <p className="text-xs text-gray-400">{a.email}</p>
                  </div>
                </div>
                <div className="flex gap-4 text-sm">
                  <div>
                    <p className="text-xl font-bold text-gray-900">{a.assignedCompanies ?? 0}</p>
                    <p className="text-xs text-gray-500">Empresas</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{a._count.callLogs}</p>
                    <p className="text-xs text-gray-500">Llamadas</p>
                  </div>
                </div>
              </div>
            )
          )}
          {agents.length === 0 && (
            <div className="col-span-3 card p-8 text-center text-gray-400">
              <Users size={32} className="mx-auto mb-2" />
              <p>No hay agentes activos. Crea uno en la sección "Agentes".</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Agent detail drawer ── */}
      {drawerAgentId && (() => {
        const agent = agents.find((a: { id: string }) => a.id === drawerAgentId) as {
          id: string; name: string; email: string
          assignedCompanies?: number
          _count: { assignments: number; callLogs: number }
        } | undefined
        return (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/30 z-40"
              onClick={() => setDrawerAgentId(null)}
            />

            {/* Panel */}
            <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 flex flex-col">
              {/* Header */}
              <div className="p-5 border-b bg-gray-50 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold shrink-0">
                      {agent?.name.charAt(0) ?? '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{agent?.name}</p>
                      <p className="text-xs text-gray-500 truncate">{agent?.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setDrawerAgentId(null)}
                    className="p-2 rounded-lg hover:bg-gray-200 text-gray-500 shrink-0"
                    aria-label="Cerrar"
                  >
                    <X size={20} />
                  </button>
                </div>
                <div className="flex items-center gap-6 text-center">
                  <div>
                    <p className="text-xl font-bold text-gray-900">{agent?.assignedCompanies ?? 0}</p>
                    <p className="text-xs text-gray-500">Empresas</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{drawerRuns.length}</p>
                    <p className="text-xs text-gray-500">Asignaciones</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{agent?._count.callLogs ?? 0}</p>
                    <p className="text-xs text-gray-500">Llamadas</p>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <History size={16} className="text-blue-500" />
                  Historial de asignaciones
                </h3>

                {drawerRunsSummary && (
                  <div className="sticky top-0 z-10 -mx-5 px-5 py-2.5 bg-white/95 backdrop-blur border-b border-gray-100 text-sm text-gray-600">
                    <strong className="text-gray-900">{drawerRunsSummary.totalCompanies}</strong> empresas en{' '}
                    <strong className="text-gray-900">{drawerRunsSummary.assignmentCount}</strong> asignaciones desde{' '}
                    <strong className="text-gray-900">{drawerRunsSummary.fileCount}</strong>{' '}
                    {drawerRunsSummary.fileCount === 1 ? 'archivo' : 'archivos'}
                  </div>
                )}

                {loadingDrawerRuns && (
                  <p className="text-center text-gray-400 py-12">Cargando historial...</p>
                )}
                {!loadingDrawerRuns && drawerRuns.length === 0 && (
                  <div className="text-center text-gray-400 py-12">
                    <History size={36} className="mx-auto mb-2" />
                    <p>Este agente no tiene asignaciones registradas</p>
                    <p className="text-xs mt-1">Las asignaciones anteriores al historial no aparecen aquí</p>
                  </div>
                )}

                {drawerRuns.map((run) => {
                  const isOpen = expandedRuns[run.id] ?? false
                  const companies = runCompanies[run.id] ?? []
                  const filterQuery = runCompanyFilter[run.id] ?? ''
                  const filteredCompanies = companies.filter((c) =>
                    matchesCompanySearch(c, filterQuery)
                  )
                  const loadingCompanies = loadingRunCompanies[run.id] ?? false
                  const showRelease = canReleaseRun(run) && drawerAgentId

                  return (
                    <div key={run.id} className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="flex items-stretch bg-gray-50">
                        <button
                          className="flex-1 flex items-center justify-between p-4 hover:bg-gray-100 transition-colors text-left min-w-0"
                          onClick={() => toggleRun(run, drawerAgentId!)}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <History size={16} className="text-blue-500 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-base font-bold text-gray-900">
                                {run.companyCount} empresa{run.companyCount !== 1 ? 's' : ''}
                                {run.isLegacy && (
                                  <span className="ml-2 text-xs font-normal text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                                    Anterior
                                  </span>
                                )}
                                {!run.isLegacy && run.status && run.status !== 'ACTIVE' && (
                                  <span className="ml-2 text-xs font-normal text-gray-600 bg-gray-200/80 px-1.5 py-0.5 rounded">
                                    {run.status === 'PARTIALLY_RELEASED'
                                      ? 'Parcialmente liberada'
                                      : run.status === 'CLOSED'
                                        ? 'Cerrada'
                                        : run.status}
                                  </span>
                                )}
                              </p>
                              <p className="text-sm text-gray-600 mt-0.5">
                                {format(new Date(run.assignedAt), "d MMM yyyy, HH:mm", { locale: es })}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-200/80 text-xs text-gray-700 truncate max-w-full">
                                  {run.filename ?? 'Todas las importaciones'}
                                </span>
                                <span className="text-xs text-gray-400">
                                  Por {run.assignedBy.name}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 ml-3">
                            {isOpen ? (
                              <ChevronDown size={16} className="text-gray-400" />
                            ) : (
                              <ChevronRight size={16} className="text-gray-400" />
                            )}
                          </div>
                        </button>
                        <div className="hidden sm:flex shrink-0 flex-col justify-center px-3 border-l border-gray-200 min-w-0 max-w-[12rem]">
                          <RunActivityMetrics run={run} />
                        </div>
                        {showRelease && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              openReleaseModal(run, drawerAgentId!)
                            }}
                            className="shrink-0 px-3 border-l border-gray-200 text-xs font-medium text-amber-800 hover:bg-amber-50 flex flex-col items-center justify-center gap-1 min-w-[5.5rem]"
                            title="Liberar empresas no trabajadas"
                          >
                            <PackageOpen size={16} />
                            Liberar remanente
                          </button>
                        )}
                      </div>

                      {isOpen && (
                        <div className="border-t border-gray-100">
                          {loadingCompanies && (
                            <p className="text-center text-gray-400 py-6 text-sm">Cargando empresas...</p>
                          )}
                          {!loadingCompanies && companies.length === 0 && (
                            <p className="text-center text-gray-400 py-6 text-sm">Sin empresas en esta asignación</p>
                          )}
                          {!loadingCompanies && companies.length > 0 && (
                            <div>
                              <div className="px-4 py-2 border-b border-gray-100">
                                <input
                                  type="text"
                                  placeholder="Buscar por RUC o razón social"
                                  value={filterQuery}
                                  onChange={(e) =>
                                    setRunCompanyFilter((prev) => ({
                                      ...prev,
                                      [run.id]: e.target.value,
                                    }))
                                  }
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                                {filterQuery.trim() && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    Mostrando {filteredCompanies.length} de {companies.length}
                                  </p>
                                )}
                              </div>
                              {filteredCompanies.length === 0 ? (
                                <p className="text-center text-gray-400 py-6 text-sm">
                                  Ninguna empresa coincide
                                </p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-gray-100 bg-gray-50/80 text-left text-xs text-gray-500 uppercase tracking-wide">
                                        <th className="px-4 py-2 font-medium">RUC</th>
                                        <th className="px-4 py-2 font-medium">Razón social</th>
                                        <th className="px-4 py-2 font-medium">Respuesta</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                      {filteredCompanies.map((company) => {
                                        const aclaracion =
                                          company.lastAclaracion ??
                                          (company.lastDisposition
                                            ? getResponseOption(company.lastDisposition)?.aclaracion
                                            : undefined)
                                        return (
                                        <tr key={company.id} className="hover:bg-gray-50">
                                          <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                                            {company.ruc}
                                          </td>
                                          <td className="px-4 py-2 text-gray-900 truncate max-w-[200px]">
                                            {company.razonSocial || '—'}
                                          </td>
                                          <td className="px-4 py-2">
                                            {company.lastDisposition ? (
                                              <div className="flex flex-wrap items-center gap-1.5">
                                                <DispositionBadge disposition={company.lastDisposition} />
                                                {aclaracion ? (
                                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                                    {aclaracion}
                                                  </span>
                                                ) : null}
                                              </div>
                                            ) : (
                                              <span className="text-gray-300 text-xs">Pendiente</span>
                                            )}
                                          </td>
                                        </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )
      })()}

      {/* Release remainder modal */}
      {releaseModal && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[60]"
            onClick={closeReleaseModal}
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Liberar remanente</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Las empresas sin llamadas del agente volverán al pool sin asignar.
                    Las empresas ya trabajadas se mantienen asignadas.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeReleaseModal}
                  disabled={releaseSubmitting}
                  className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
                  aria-label="Cerrar"
                >
                  <X size={20} />
                </button>
              </div>

              {releaseLoading && (
                <p className="text-center text-gray-400 py-6 text-sm">Calculando remanente...</p>
              )}

              {!releaseLoading && releasePreview && (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-2xl font-bold text-amber-900">{releasePreview.releasableCount}</p>
                      <p className="text-amber-800 text-xs mt-0.5">Empresas a liberar</p>
                      <p className="text-amber-700/80 text-xs">{releasePreview.releasableContactCount} contactos</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-2xl font-bold text-green-900">{releasePreview.retainedCount}</p>
                      <p className="text-green-800 text-xs mt-0.5">Empresas retenidas</p>
                      <p className="text-green-700/80 text-xs">Con llamadas del agente</p>
                    </div>
                  </div>

                  {releasePreview.blockedByCallbacks != null && releasePreview.blockedByCallbacks > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 flex items-start gap-2">
                      <AlertCircle size={16} className="shrink-0 mt-0.5" />
                      <p>
                        No se puede liberar:{' '}
                        <strong>{releasePreview.blockedByCallbacks}</strong>{' '}
                        empresa{releasePreview.blockedByCallbacks !== 1 ? 's' : ''} con devoluciones
                        de llamada pendientes del agente. Complete o reasigne esas devoluciones primero.
                      </p>
                    </div>
                  )}

                  {releasePreview.releasableCount === 0 && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600">
                      No hay empresas pendientes para liberar en esta asignación.
                    </div>
                  )}

                  {releasePreview.releasableCompanies.length > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-gray-600 hover:text-gray-900">
                        Ver empresas a liberar ({releasePreview.releasableCompanies.length})
                      </summary>
                      <ul className="mt-2 max-h-32 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
                        {releasePreview.releasableCompanies.map((c) => (
                          <li key={c.id} className="px-3 py-1.5 text-xs text-gray-700">
                            <span className="font-medium">{c.ruc}</span>
                            {c.razonSocial && <span className="text-gray-500"> · {c.razonSocial}</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <div>
                    <label className="label">Motivo (opcional)</label>
                    <textarea
                      className="input min-h-[4rem] resize-y"
                      value={releaseReason}
                      onChange={(e) => setReleaseReason(e.target.value)}
                      placeholder="Ej.: Agente de baja, reasignación de cartera..."
                      disabled={releaseSubmitting}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={
                        releaseSubmitting ||
                        releasePreview.releasableCount === 0 ||
                        (releasePreview.blockedByCallbacks != null && releasePreview.blockedByCallbacks > 0)
                      }
                      onClick={handleReleaseConfirm}
                      className="btn-primary justify-center"
                    >
                      {releaseSubmitting
                        ? 'Liberando...'
                        : `Confirmar liberación (${releasePreview.releasableCount} empresas)`}
                    </button>
                    <button
                      type="button"
                      disabled={releaseSubmitting}
                      onClick={closeReleaseModal}
                      className="btn-secondary justify-center"
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
