import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getClients, getUsers, getImports } from '../api/client'
import { StatusBadge } from '../components/StatusBadge'
import { Search, Phone, User, CalendarClock } from 'lucide-react'
import { format, isPast, isToday } from 'date-fns'
import { es } from 'date-fns/locale'

const STATUS_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'IN_PROGRESS', label: 'En progreso' },
  { value: 'INTERESTED', label: 'Interesados' },
  { value: 'NOT_INTERESTED', label: 'No interesados' },
  { value: 'DO_NOT_CALL', label: 'No llamar' },
]

export default function Clients() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [agentId, setAgentId] = useState('')
  const [batchId, setBatchId] = useState('')
  const [page, setPage] = useState(1)

  const { data: usersData = [] } = useQuery({ queryKey: ['users'], queryFn: getUsers })
  const agents = (usersData as { id: string; name: string; role: string; active: boolean }[])
    .filter((u) => u.role === 'AGENT' && u.active)

  const { data: imports = [] } = useQuery({ queryKey: ['imports'], queryFn: getImports })
  const batches = imports as { id: string; filename: string; createdAt: string; totalRecords: number }[]

  const { data, isLoading } = useQuery({
    queryKey: ['clients', { search, status, agentId, batchId, page }],
    queryFn: () => getClients({
      search: search || undefined,
      status: status || undefined,
      agentId: agentId || undefined,
      batchId: batchId || undefined,
      page,
      limit: 50,
    }),
  })

  const clients = data?.clients ?? []
  const total = data?.total ?? 0
  const selectedBatch = batchId ? batches.find((b) => b.id === batchId) : null

  return (
    <div className="p-8 space-y-6">
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
              {(search || status || agentId) && ` · filtrados`}
            </>
          ) : (
            <>{total} clientes en total{(search || status || agentId) && ' · filtrados'}</>
          )}
        </p>
      </div>

      {/* Filters */}
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

        {/* Agent filter */}
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

        {/* Batch filter */}
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

        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setStatus(f.value); setPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                status === f.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
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
                  contacts: { nombre: string; tipoContacto?: string; telefono?: string }[]
                  assignment?: { agent?: { name: string } }
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
                      {c.assignment?.agent?.name ?? (
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
