import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth } from 'date-fns'
import { ArrowLeft, History, RefreshCw } from 'lucide-react'
import { getCalls, getMyBatches, getUsers, type GetCallsParams } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { RecentCallRow } from '../components/RecentCallRow'
import ClientRecordModal from '../components/ClientRecordModal'
import { AGENT_PIPELINE_FUNNEL } from '../config/companyPipeline'
import { ZERO_PROGRESS_OPTIONS } from '../config/responseOptions'

const LIMIT_OPTIONS = [25, 50, 100, 200] as const

type FilterState = {
  limit: number
  page: number
  from: string
  to: string
  timeFrom: string
  timeTo: string
  disposition: string
  batchId: string
  agentId: string
}

function CallHistoryPaginationBar({
  page,
  limit,
  total,
  onPageChange,
}: {
  page: number
  limit: number
  total: number
  onPageChange: (page: number) => void
}) {
  return (
    <div className="flex items-center justify-between text-sm text-gray-500">
      <p>
        Mostrando {(page - 1) * limit + 1}–{Math.min(page * limit, total)} de {total}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="btn-secondary py-1.5"
        >
          Anterior
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page * limit >= total}
          className="btn-secondary py-1.5"
        >
          Siguiente
        </button>
      </div>
    </div>
  )
}

function todayLocal(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function monthStartLocal(): string {
  return format(startOfMonth(new Date()), 'yyyy-MM-dd')
}

function readFilters(params: URLSearchParams): FilterState {
  const limitRaw = Number(params.get('limit'))
  const limit = LIMIT_OPTIONS.includes(limitRaw as (typeof LIMIT_OPTIONS)[number])
    ? limitRaw
    : 50
  const fromRaw = params.get('from')
  // `from=dashboard` is a nav hint from KPI cards, not a date filter
  const fromIsNavHint = fromRaw === 'dashboard'
  const defaultDates = (!params.has('from') && !params.has('to')) || fromIsNavHint
  const pageRaw = Number(params.get('page'))
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
  return {
    limit,
    page,
    from: defaultDates ? monthStartLocal() : (fromRaw ?? ''),
    to: defaultDates ? todayLocal() : (params.get('to') ?? ''),
    timeFrom: params.get('timeFrom') ?? '',
    timeTo: params.get('timeTo') ?? '',
    disposition: params.has('disposition')
      ? (params.get('disposition') ?? '')
      : '',
    batchId: params.get('batchId') ?? '',
    agentId: params.get('agentId') ?? '',
  }
}

function filtersToSearchParams(filters: FilterState): URLSearchParams {
  const next = new URLSearchParams()
  if (filters.limit !== 50) next.set('limit', String(filters.limit))
  if (filters.page !== 1) next.set('page', String(filters.page))
  if (filters.from) next.set('from', filters.from)
  if (filters.to) next.set('to', filters.to)
  if (filters.timeFrom) next.set('timeFrom', filters.timeFrom)
  if (filters.timeTo) next.set('timeTo', filters.timeTo)
  if (filters.disposition) next.set('disposition', filters.disposition)
  if (filters.batchId) next.set('batchId', filters.batchId)
  if (filters.agentId) next.set('agentId', filters.agentId)
  return next
}

function filtersToApiParams(filters: FilterState, isAdmin: boolean): GetCallsParams {
  const params: GetCallsParams = { limit: filters.limit, page: filters.page }
  if (filters.from) params.from = filters.from
  if (filters.to) params.to = filters.to
  if (filters.timeFrom) params.timeFrom = filters.timeFrom
  if (filters.timeTo) params.timeTo = filters.timeTo
  if (filters.batchId) params.batchId = filters.batchId
  if (isAdmin && filters.agentId) params.agentId = filters.agentId
  if (filters.disposition === 'FUNNEL') {
    params.funnel = true
  } else if (filters.disposition) {
    params.disposition = filters.disposition
  }
  return params
}

export default function CallHistory() {
  const { isAdmin } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  // Capture nav hint before date defaults overwrite `from` in the URL
  const [returnToDashboard] = useState(() => searchParams.get('from') === 'dashboard')
  const filters = useMemo(() => readFilters(searchParams), [searchParams])
  const [recordModal, setRecordModal] = useState<{ clientId: string } | null>(null)

  useEffect(() => {
    const fromVal = searchParams.get('from')
    const fromIsNavHint = fromVal === 'dashboard'
    const needsDates =
      (!searchParams.has('from') && !searchParams.has('to')) || fromIsNavHint
    if (needsDates) {
      const next = new URLSearchParams(searchParams)
      next.set('from', monthStartLocal())
      next.set('to', todayLocal())
      setSearchParams(next, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const updateFilters = (patch: Partial<FilterState>) => {
    const isPageOnly = Object.keys(patch).length === 1 && 'page' in patch
    const next = { ...filters, ...patch, ...(!isPageOnly ? { page: 1 } : {}) }
    setSearchParams(filtersToSearchParams(next), { replace: true })
  }

  const apiParams = useMemo(() => filtersToApiParams(filters, isAdmin), [filters, isAdmin])

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['calls', apiParams],
    queryFn: () => getCalls(apiParams),
  })

  const { data: myBatches } = useQuery({
    queryKey: ['my-batches'],
    queryFn: getMyBatches,
    enabled: !isAdmin,
  })

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: getUsers,
    enabled: isAdmin,
  })

  const agents = users.filter((u) => u.role === 'AGENT' && u.active)
  const calls = data?.calls ?? []
  const total = data?.total ?? 0
  const showPagination = total > 0

  const handleCallClick = (call: (typeof calls)[number]) => {
    setRecordModal({ clientId: call.company.id })
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <History size={24} className="text-blue-600" />
            Historial de llamadas
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {total > 0
              ? `${total} llamada${total === 1 ? '' : 's'} coincidente${total === 1 ? '' : 's'}`
              : 'Consulta y filtra tus registros de llamada'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {returnToDashboard && (
            <Link
              to="/"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft size={15} />
              Volver al Dashboard
            </Link>
          )}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Actualizar"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      <div className="card p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-500">Mostrar</span>
            <select
              value={filters.limit}
              onChange={(e) => updateFilters({ limit: Number(e.target.value) })}
              className="input w-full"
            >
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n === 200 ? 'Todas (máx. 200)' : `${n} registros`}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-500">Desde</span>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => updateFilters({ from: e.target.value })}
              className="input w-full"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-500">Hasta</span>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => updateFilters({ to: e.target.value })}
              className="input w-full"
            />
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => updateFilters({ from: todayLocal(), to: todayLocal() })}
              className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors w-full sm:w-auto"
            >
              Hoy
            </button>
          </div>

          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-500">Disposición</span>
            <select
              value={filters.disposition}
              onChange={(e) => updateFilters({ disposition: e.target.value })}
              className="input w-full"
            >
              <option value="">Todos</option>
              <option value="FUNNEL">Embudo comercial</option>
              <optgroup label="Etapas del embudo">
                {AGENT_PIPELINE_FUNNEL.map((row) => (
                  <option key={row.key} value={row.key}>
                    {row.fullLabel}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Operativas">
                {ZERO_PROGRESS_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-500">Hora desde</span>
            <input
              type="time"
              value={filters.timeFrom}
              onChange={(e) => updateFilters({ timeFrom: e.target.value })}
              className="input w-full"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-gray-500">Hora hasta</span>
            <input
              type="time"
              value={filters.timeTo}
              onChange={(e) => updateFilters({ timeTo: e.target.value })}
              className="input w-full"
            />
          </label>

          {!isAdmin && myBatches && myBatches.length > 0 && (
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-500">Lote</span>
              <select
                value={filters.batchId}
                onChange={(e) => updateFilters({ batchId: e.target.value })}
                className="input w-full"
              >
                <option value="">Todos los lotes</option>
                {myBatches.map((b: { id: string; filename: string }) => (
                  <option key={b.id} value={b.id}>
                    {b.filename.replace(/\.[^.]+$/, '')}
                  </option>
                ))}
              </select>
            </label>
          )}

          {isAdmin && (
            <label className="space-y-1">
              <span className="text-xs font-medium text-gray-500">Agente</span>
              <select
                value={filters.agentId}
                onChange={(e) => updateFilters({ agentId: e.target.value })}
                className="input w-full"
              >
                <option value="">Todos los agentes</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      <div className="card p-6">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : calls.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No hay llamadas con estos filtros</p>
        ) : (
          <>
            {showPagination && (
              <div className="pb-4 mb-4 border-b border-gray-100">
                <CallHistoryPaginationBar
                  page={filters.page}
                  limit={filters.limit}
                  total={total}
                  onPageChange={(page) => updateFilters({ page })}
                />
              </div>
            )}
            <div className="space-y-1">
              {calls.map((call) => (
                <RecentCallRow
                  key={call.id}
                  call={call}
                  showAgent={isAdmin}
                  title="Ver registro"
                  onClick={() => handleCallClick(call)}
                />
              ))}
            </div>
            {showPagination && (
              <div className="pt-4 mt-4 border-t border-gray-100">
                <CallHistoryPaginationBar
                  page={filters.page}
                  limit={filters.limit}
                  total={total}
                  onPageChange={(page) => updateFilters({ page })}
                />
              </div>
            )}
          </>
        )}
      </div>

      {recordModal && (
        <ClientRecordModal
          clientId={recordModal.clientId}
          agentFilterId={isAdmin && filters.agentId ? filters.agentId : undefined}
          initialFocus="history"
          onClose={() => setRecordModal(null)}
        />
      )}
    </div>
  )
}
