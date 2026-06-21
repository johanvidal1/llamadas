import { useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth } from 'date-fns'
import { History, RefreshCw } from 'lucide-react'
import { getCalls, getMyBatches, getUsers, type GetCallsParams } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { RecentCallRow } from '../components/RecentCallRow'
import { AGENT_PIPELINE_FUNNEL } from '../config/companyPipeline'
import { getDispositionLabel } from '../config/responseOptions'

const LIMIT_OPTIONS = [25, 50, 100, 200] as const
const OPERATIONAL_DISPOSITIONS = ['VOLVER_A_LLAMAR', 'NO_INTERESADO', 'NO_CONTESTA'] as const

type FilterState = {
  limit: number
  from: string
  to: string
  timeFrom: string
  timeTo: string
  disposition: string
  batchId: string
  agentId: string
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
  const defaultDates = !params.has('from') && !params.has('to')
  return {
    limit,
    from: defaultDates ? monthStartLocal() : (params.get('from') ?? ''),
    to: defaultDates ? todayLocal() : (params.get('to') ?? ''),
    timeFrom: params.get('timeFrom') ?? '',
    timeTo: params.get('timeTo') ?? '',
    disposition: params.has('disposition')
      ? (params.get('disposition') ?? '')
      : 'FUNNEL',
    batchId: params.get('batchId') ?? '',
    agentId: params.get('agentId') ?? '',
  }
}

function filtersToSearchParams(filters: FilterState): URLSearchParams {
  const next = new URLSearchParams()
  if (filters.limit !== 50) next.set('limit', String(filters.limit))
  if (filters.from) next.set('from', filters.from)
  if (filters.to) next.set('to', filters.to)
  if (filters.timeFrom) next.set('timeFrom', filters.timeFrom)
  if (filters.timeTo) next.set('timeTo', filters.timeTo)
  next.set('disposition', filters.disposition)
  if (filters.batchId) next.set('batchId', filters.batchId)
  if (filters.agentId) next.set('agentId', filters.agentId)
  return next
}

function filtersToApiParams(filters: FilterState, isAdmin: boolean): GetCallsParams {
  const params: GetCallsParams = { limit: filters.limit }
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
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => readFilters(searchParams), [searchParams])

  useEffect(() => {
    const needsDates = !searchParams.has('from') && !searchParams.has('to')
    const needsDisposition = !searchParams.has('disposition')
    if (needsDates || needsDisposition) {
      const next = new URLSearchParams(searchParams)
      if (needsDates) {
        next.set('from', monthStartLocal())
        next.set('to', todayLocal())
      }
      if (needsDisposition) {
        next.set('disposition', 'FUNNEL')
      }
      setSearchParams(next, { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const updateFilters = (patch: Partial<FilterState>) => {
    const next = { ...filters, ...patch }
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

  const handleCallClick = (call: (typeof calls)[number]) => {
    const params = new URLSearchParams()
    params.set('companyId', call.company.id)
    if (call.contact?.id) params.set('contactId', call.contact.id)
    navigate(`/my-leads?${params.toString()}`)
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
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
                {OPERATIONAL_DISPOSITIONS.map((code) => (
                  <option key={code} value={code}>
                    {getDispositionLabel(code)}
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
          <div className="space-y-1">
            {calls.map((call) => (
              <RecentCallRow
                key={call.id}
                call={call}
                showAgent={isAdmin}
                onClick={() => handleCallClick(call)}
              />
            ))}
          </div>
        )}
        {calls.length < total && (
          <p className="text-xs text-gray-400 text-center mt-4 pt-4 border-t border-gray-100">
            Mostrando {calls.length} de {total}. Acota fechas o sube el límite para ver más.
          </p>
        )}
      </div>
    </div>
  )
}
