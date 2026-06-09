import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getUsers, getImports, getClients, createAssignment } from '../api/client'
import toast from 'react-hot-toast'
import { UserCheck, Users, AlertCircle, X, Package, ChevronDown, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { StatusBadge, STATUS_CONFIG } from '../components/StatusBadge'

export default function Assignments() {
  const [agentId, setAgentId] = useState('')
  const [batchId, setBatchId] = useState('')
  const [count, setCount] = useState<number | ''>('')
  const qc = useQueryClient()

  // Drawer state — agent detail
  const [drawerAgentId, setDrawerAgentId] = useState<string | null>(null)
  const [expandedBatches, setExpandedBatches] = useState<Record<string, boolean>>({})
  const [batchSearch, setBatchSearch] = useState<Record<string, string>>({})

  const toggleBatch = (id: string) =>
    setExpandedBatches((prev) => ({ ...prev, [id]: !prev[id] }))

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: getUsers })
  const { data: imports = [] } = useQuery({ queryKey: ['imports'], queryFn: getImports })

  // Query clients for the selected agent in the drawer
  const { data: drawerClientsData, isLoading: loadingDrawer } = useQuery({
    queryKey: ['clients', 'agent-drawer', drawerAgentId],
    queryFn: () => getClients({ agentId: drawerAgentId!, limit: 500 }),
    enabled: !!drawerAgentId,
  })
  const drawerClients: Array<{
    id: string; name: string; phone: string; status: string
    importBatch?: { id: string; filename: string; createdAt: string }
    _count: { callLogs: number; callbacks: number }
  }> = drawerClientsData?.clients ?? []

  // Group drawer clients by batch
  type BatchGroup = {
    id: string; filename: string; createdAt: string
    clients: typeof drawerClients
  }
  const drawerBatches: BatchGroup[] = []
  const seenBatchIds = new Set<string>()
  drawerClients.forEach((c) => {
    const b = c.importBatch
    if (!b) return
    if (!seenBatchIds.has(b.id)) {
      seenBatchIds.add(b.id)
      drawerBatches.push({ id: b.id, filename: b.filename, createdAt: b.createdAt, clients: [] })
    }
    drawerBatches.find((bg) => bg.id === b.id)!.clients.push(c)
  })
  drawerBatches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const agents = users.filter(
    (u: { role: string; active: boolean }) => u.role === 'AGENT' && u.active
  )

  // Count of unassigned clients in selected batch
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
  const unassignedTotal = unassignedData?.total ?? 0

  const mutation = useMutation({
    mutationFn: (data: object) => createAssignment(data),
    onSuccess: (data) => {
      toast.success(`✅ ${data.assigned} clientes asignados`)
      qc.invalidateQueries({ queryKey: ['clients'] })
      qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      toast.error(err?.response?.data?.error ?? 'Error al asignar clientes')
    },
  })

  const handleAssign = () => {
    if (!agentId) {
      toast.error('Selecciona un agente')
      return
    }
    mutation.mutate({
      agentId,
      batchId: batchId || undefined,
      count: count === '' ? undefined : count,
    })
  }

  const selectedAgent = agents.find(
    (a: { id: string }) => a.id === agentId
  ) as { name: string } | undefined

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Asignar clientes a agentes</h1>
        <p className="text-gray-500 text-sm mt-1">
          Distribuye los clientes importados entre tu equipo de trabajo
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
              {agents.map((a: { id: string; name: string; _count?: { assignments: number } }) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a._count?.assignments ?? 0} asignados)
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
              <option value="">Todos los archivos</option>
              {imports.map(
                (b: { id: string; filename: string; totalRecords: number }) => (
                  <option key={b.id} value={b.id}>
                    {b.filename} ({b.totalRecords} registros)
                  </option>
                )
              )}
            </select>
          </div>

          {/* Count */}
          <div>
            <label className="label">Cantidad de clientes</label>
            <input
              type="number"
              className="input"
              min={1}
              max={unassignedTotal || 9999}
              value={count}
              placeholder="Todos los disponibles"
              onChange={(e) => setCount(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
        </div>

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-blue-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-blue-800 font-medium">
              Clientes sin asignar disponibles:{' '}
              <span className="font-bold">{unassignedTotal}</span>
              {batchId && ' en esta importación'}
            </p>
            {selectedAgent && (count === '' || count > 0) && (
              <p className="text-blue-600 mt-1">
                Se asignarán hasta{' '}
                <strong>{count === '' ? unassignedTotal : Math.min(count, unassignedTotal)}</strong>{' '}
                clientes a <strong>{selectedAgent.name}</strong>
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleAssign}
            disabled={mutation.isPending || !agentId || unassignedTotal === 0}
            className="btn-primary"
          >
            <UserCheck size={18} />
            {mutation.isPending ? 'Asignando...' : 'Asignar clientes'}
          </button>
          {unassignedTotal === 0 && (
            <p className="text-sm text-amber-600 flex items-center gap-1">
              <AlertCircle size={14} />
              No hay clientes disponibles para asignar
            </p>
          )}
        </div>
      </div>

      {/* Agents summary */}
      <div>
        <h2 className="font-semibold text-gray-900 mb-4">Estado de asignaciones por agente</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map(
            (a: {
              id: string
              name: string
              email: string
              _count: { assignments: number; callLogs: number }
            }) => (
              <div
                key={a.id}
                className="card p-5 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
                onClick={() => { setDrawerAgentId(a.id); setExpandedBatches({}); setBatchSearch({}) }}
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
                    <p className="text-xl font-bold text-gray-900">{a._count.assignments}</p>
                    <p className="text-xs text-gray-500">Asignados</p>
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
              <div className="flex items-center justify-between p-5 border-b bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold">
                    {agent?.name.charAt(0) ?? '?'}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{agent?.name}</p>
                    <p className="text-xs text-gray-500">{agent?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-center">
                  <div>
                    <p className="text-xl font-bold text-gray-900">{agent?._count.assignments ?? 0}</p>
                    <p className="text-xs text-gray-500">Asignados</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{agent?._count.callLogs ?? 0}</p>
                    <p className="text-xs text-gray-500">Llamadas</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{drawerBatches.length}</p>
                    <p className="text-xs text-gray-500">Lotes</p>
                  </div>
                  <button
                    onClick={() => setDrawerAgentId(null)}
                    className="p-2 rounded-lg hover:bg-gray-200 text-gray-500"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {loadingDrawer && (
                  <p className="text-center text-gray-400 py-12">Cargando lotes...</p>
                )}
                {!loadingDrawer && drawerBatches.length === 0 && (
                  <div className="text-center text-gray-400 py-12">
                    <Package size={36} className="mx-auto mb-2" />
                    <p>Este agente no tiene clientes asignados</p>
                  </div>
                )}
                {drawerBatches.map((batch, idx) => {
                  const isOpen = expandedBatches[batch.id] ?? idx === 0
                  const search = (batchSearch[batch.id] ?? '').toLowerCase()
                  const filtered = search
                    ? batch.clients.filter(
                        (c) =>
                          c.name.toLowerCase().includes(search) ||
                          c.phone.toLowerCase().includes(search)
                      )
                    : batch.clients

                  // Status counts
                  const statusCounts: Record<string, number> = {}
                  batch.clients.forEach((c) => {
                    statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1
                  })

                  return (
                    <div key={batch.id} className="border border-gray-200 rounded-xl overflow-hidden">
                      {/* Batch header — clickable to expand */}
                      <button
                        className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                        onClick={() => toggleBatch(batch.id)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Package size={16} className="text-blue-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-gray-900 truncate">
                              {batch.filename}
                            </p>
                            <p className="text-xs text-gray-500">
                              {format(new Date(batch.createdAt), "d 'de' MMMM yyyy", { locale: es })}
                              {' · '}{batch.clients.length} clientes
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          {/* Mini status pills */}
                          {Object.entries(statusCounts).map(([s, n]) => (
                            <span
                              key={s}
                              className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[s]?.classes ?? 'bg-gray-100 text-gray-600'}`}
                            >
                              {STATUS_CONFIG[s]?.label ?? s} {n}
                            </span>
                          ))}
                          {isOpen ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                        </div>
                      </button>

                      {/* Client list */}
                      {isOpen && (
                        <div>
                          {batch.clients.length > 6 && (
                            <div className="px-4 py-2 border-b border-gray-100">
                              <input
                                type="text"
                                placeholder="Buscar nombre o teléfono..."
                                className="input py-1.5 text-sm"
                                value={batchSearch[batch.id] ?? ''}
                                onChange={(e) =>
                                  setBatchSearch((prev) => ({ ...prev, [batch.id]: e.target.value }))
                                }
                              />
                            </div>
                          )}
                          <div className="divide-y divide-gray-100">
                            {filtered.slice(0, 100).map((c) => (
                              <div key={c.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 text-sm">
                                <div className="min-w-0">
                                  <p className="font-medium text-gray-800 truncate">{c.name}</p>
                                  <p className="text-xs text-gray-500">{c.phone}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  {c._count.callLogs > 0 && (
                                    <span className="text-xs text-gray-400">{c._count.callLogs} llamada{c._count.callLogs !== 1 ? 's' : ''}</span>
                                  )}
                                  <StatusBadge status={c.status} />
                                </div>
                              </div>
                            ))}
                            {filtered.length === 0 && (
                              <p className="text-center text-gray-400 py-6 text-sm">Sin resultados</p>
                            )}
                            {filtered.length > 100 && (
                              <p className="text-center text-xs text-gray-400 py-2">
                                Mostrando 100 de {filtered.length}. Usa el buscador para filtrar.
                              </p>
                            )}
                          </div>
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
    </div>
  )
}
