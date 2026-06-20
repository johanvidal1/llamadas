import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getClients, getUsers, getImports } from '../api/client'
import { StatusBadge, DispositionBadge } from '../components/StatusBadge'
import {
  AGENT_PIPELINE_FUNNEL,
  PIPELINE_FILTER_OPERATIONAL,
  VALID_PIPELINE_FILTERS,
  getPipelineFilterLabel,
} from '../config/companyPipeline'
import { DISPOSITION_COLORS, getResponseOption } from '../config/responseOptions'
import { Search, Phone, User, CalendarClock, ArrowLeft } from 'lucide-react'
import { format, isPast, isToday } from 'date-fns'
import { es } from 'date-fns/locale'

function pipelineFilterToParams(filter: string): Record<string, string | undefined> {
  if (!filter) return {}
  if (filter === 'PENDING') return { status: 'PENDING' }
  return { disposition: filter }
}

export default function Clients() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialFilter = searchParams.get('filter') ?? ''
  const initialAgentId = searchParams.get('agentId') ?? ''
  const fromParam = searchParams.get('from')
  const returnToReports = fromParam === 'reports'
  const returnToDashboard = fromParam === 'dashboard'
  const deepLinkFilter = VALID_PIPELINE_FILTERS.has(initialFilter) ? initialFilter : ''

  const [search, setSearch] = useState('')
  const [pipelineFilter, setPipelineFilter] = useState(deepLinkFilter)
  const [agentId, setAgentId] = useState(initialAgentId)
  const [batchId, setBatchId] = useState('')
  const [page, setPage] = useState(1)

  const { data: usersData = [] } = useQuery({ queryKey: ['users'], queryFn: getUsers })
  const agents = (usersData as { id: string; name: string; role: string; active: boolean }[])
    .filter((u) => u.role === 'AGENT' && u.active)

  const { data: imports = [] } = useQuery({ queryKey: ['imports'], queryFn: getImports })
  const batches = imports as { id: string; filename: string; createdAt: string; totalRecords: number }[]

  const { data, isLoading } = useQuery({
    queryKey: ['clients', { search, pipelineFilter, agentId, batchId, page }],
    queryFn: () => getClients({
      search: search || undefined,
      agentId: agentId || undefined,
      batchId: batchId || undefined,
      page,
      limit: 50,
      ...pipelineFilterToParams(pipelineFilter),
    }),
  })

  const clients = data?.clients ?? []
  const total = data?.total ?? 0
  const selectedBatch = batchId ? batches.find((b) => b.id === batchId) : null
  const hasActiveFilters = !!(search || pipelineFilter || agentId)

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 text-sm mt-1">
            {selectedBatch ? (
              <>
                <span className="font-semibold text-gray-700">{total}</span>
                {' de '}
                <span className="font-semibold text-gray-700">{selectedBatch.totalRecords}</span>
                {' clientes en '}
                <span className="text-gray-600 italic">{selectedBatch.filename}</span>
                {hasActiveFilters && ` · filtrados`}
              </>
            ) : (
              <>{total} clientes en total{hasActiveFilters && ' · filtrados'}</>
            )}
            {pipelineFilter && (
              <span className="text-gray-400 ml-1.5">
                · {getPipelineFilterLabel(pipelineFilter)}
              </span>
            )}
          </p>
        </div>
        {returnToReports && (
          <button
            type="button"
            onClick={() => navigate('/reports')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors shrink-0"
          >
            <ArrowLeft size={15} />
            Volver a reportes
            {pipelineFilter ? (
              <span className="text-gray-400 font-normal">
                ({getPipelineFilterLabel(pipelineFilter)})
              </span>
            ) : null}
          </button>
        )}
        {returnToDashboard && (
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors shrink-0"
          >
            <ArrowLeft size={15} />
            Volver al inicio
            {pipelineFilter ? (
              <span className="text-gray-400 font-normal">
                ({getPipelineFilterLabel(pipelineFilter)})
              </span>
            ) : null}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="input pl-9"
              placeholder="Buscar por RUC, razón social, contacto..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>

          {agents.length > 0 && (
            <select
              className="input w-auto min-w-[160px]"
              value={agentId}
              onChange={(e) => { setAgentId(e.target.value); setPage(1) }}
            >
              <option value="">Todos los agentes</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}

          {batches.length > 0 && (
            <select
              className="input w-auto min-w-[180px]"
              value={batchId}
              onChange={(e) => { setBatchId(e.target.value); setPage(1) }}
            >
              <option value="">Todos los lotes</option>
              {batches.map((b, i) => (
                <option key={b.id} value={b.id}>
                  {i === 0 ? '★ ' : ''}{b.filename.replace(/\.[^.]+$/, '')} · {format(new Date(b.createdAt), 'd MMM yy', { locale: es })}
                </option>
              ))}
            </select>
          )}

          <select
            className="input w-auto min-w-[180px]"
            value={PIPELINE_FILTER_OPERATIONAL.some((f) => f.value === pipelineFilter) ? pipelineFilter : ''}
            onChange={(e) => { setPipelineFilter(e.target.value); setPage(1) }}
          >
            {PIPELINE_FILTER_OPERATIONAL.map((f) => (
              <option key={f.value || 'all'} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {AGENT_PIPELINE_FUNNEL.map((f) => {
            const isActive = pipelineFilter === f.key
            const dispClasses = DISPOSITION_COLORS[f.key]
            return (
              <button
                key={f.key}
                type="button"
                title={f.fullLabel}
                onClick={() => { setPipelineFilter(isActive ? '' : f.key); setPage(1) }}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 min-w-[5.5rem] text-center rounded-lg text-xs font-medium transition-colors border shrink-0 ${
                  isActive
                    ? dispClasses
                      ? `${dispClasses.split(' border-l-')[0]} border-current ring-2 ring-offset-1 ring-green-500`
                      : 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className="text-xs leading-tight max-w-[8rem] text-balance">
                  {f.shortLabel ?? f.label}
                </span>
                <span className="text-[10px] font-semibold opacity-80">
                  {f.aclaracion}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Cargando...</div>
        ) : clients.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <User size={40} className="mx-auto mb-2" />
            <p>No se encontraron clientes</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">RUC</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Razón Social</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contactos</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Agente asignado</th>
                {!batchId && <th className="text-left px-4 py-3 font-medium text-gray-600">Lote</th>}
                <th className="text-left px-4 py-3 font-medium text-gray-600">Agendado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Respuesta</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Llamadas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clients.map(
                (c: {
                  id: string
                  ruc: string
                  razonSocial?: string
                  status: string
                  lastDisposition?: string | null
                  lastAclaracion?: string | null
                  contacts: { nombre: string; tipoContacto?: string; telefono?: string; assignment?: { agent?: { name: string } } }[]
                  importBatch?: { filename: string; createdAt: string }
                  callbacks?: { scheduledAt: string; notes?: string }[]
                  _count: { callLogs: number }
                }) => {
                  const nextCb = c.callbacks?.[0]
                  const cbDate = nextCb ? new Date(nextCb.scheduledAt) : null
                  const cbStyle = cbDate
                    ? isPast(cbDate) && !isToday(cbDate)
                      ? 'text-red-600 bg-red-50 border border-red-200'
                      : isToday(cbDate)
                      ? 'text-amber-700 bg-amber-50 border border-amber-200'
                      : 'text-blue-700 bg-blue-50 border border-blue-200'
                    : ''
                  const primaryContact = c.contacts?.[0]
                  const agentNames = [
                    ...new Set(
                      c.contacts
                        .filter((ct) => ct.assignment?.agent?.name)
                        .map((ct) => ct.assignment!.agent!.name)
                    ),
                  ]
                  const aclaracion =
                    c.lastAclaracion ??
                    (c.lastDisposition
                      ? getResponseOption(c.lastDisposition)?.aclaracion
                      : undefined)
                  return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{c.ruc}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{c.razonSocial || <span className="text-gray-400 italic text-xs">Sin razón social</span>}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {primaryContact ? (
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">{primaryContact.nombre}</p>
                          {primaryContact.telefono && (
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              <Phone size={11} />{primaryContact.telefono}
                            </div>
                          )}
                          {c.contacts.length > 1 && (
                            <p className="text-xs text-blue-500">+{c.contacts.length - 1} más</p>
                          )}
                        </div>
                      ) : <span className="text-gray-300 text-xs">Sin contactos</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {agentNames.length > 0 ? (
                        <span>{agentNames.join(', ')}</span>
                      ) : (
                        <span className="text-gray-300">Sin asignar</span>
                      )}
                    </td>
                    {!batchId && (
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px]">
                        {c.importBatch ? (
                          <span title={c.importBatch.filename}>
                            {c.importBatch.filename.replace(/\.[^.]+$/, '').slice(0, 18)}
                            <span className="text-gray-400 ml-1">
                              {format(new Date(c.importBatch.createdAt), 'd MMM', { locale: es })}
                            </span>
                          </span>
                        ) : '—'}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {cbDate ? (
                        <span
                          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${cbStyle}`}
                          title={nextCb?.notes ?? ''}
                        >
                          <CalendarClock size={11} />
                          {format(cbDate, 'dd/MM HH:mm', { locale: es })}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {c.lastDisposition ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <DispositionBadge disposition={c.lastDisposition} />
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
                    <td className="px-4 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">
                      {c._count.callLogs}
                    </td>
                  </tr>
                  )
                }
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > 50 && (
        <div className="flex items-center justify-between text-sm text-gray-500">
          <p>
            Mostrando {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} de {total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary py-1.5"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 50 >= total}
              className="btn-secondary py-1.5"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
