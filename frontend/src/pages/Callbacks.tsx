import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getCallbacks, updateCallback } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import { CalendarClock, CheckCircle2, Clock, Phone, ChevronDown, ChevronUp } from 'lucide-react'
import { format, isToday, isTomorrow, isPast } from 'date-fns'
import { es } from 'date-fns/locale'

interface Callback {
  id: string
  scheduledAt: string
  notes?: string
  completed: boolean
  completedAt?: string
  company: {
    id: string
    ruc: string
    razonSocial?: string
    status: string
    contacts: { nombre: string; tipoContacto?: string; telefono?: string }[]
  }
  agent: { name: string }
}

function dateLabel(date: string): { label: string; classes: string } {
  const d = new Date(date)
  if (isToday(d)) return { label: 'Hoy', classes: 'bg-amber-100 text-amber-700' }
  if (isTomorrow(d)) return { label: 'Mañana', classes: 'bg-blue-100 text-blue-700' }
  if (isPast(d)) return { label: 'Vencido', classes: 'bg-red-100 text-red-700' }
  return { label: format(d, 'd MMM', { locale: es }), classes: 'bg-gray-100 text-gray-700' }
}

export default function Callbacks() {
  const { isAdmin } = useAuth()
  const [showCompleted, setShowCompleted] = useState(false)
  const qc = useQueryClient()

  const { data: callbacks = [], isLoading } = useQuery({
    queryKey: ['callbacks', { completed: false }],
    queryFn: () => getCallbacks({ completed: false }),
    refetchInterval: 60000,
  })

  const { data: doneCallbacks = [] } = useQuery({
    queryKey: ['callbacks', { completed: true }],
    queryFn: () => getCallbacks({ completed: true }),
    enabled: showCompleted,
  })

  const completeMutation = useMutation({
    mutationFn: (id: string) => updateCallback(id, { completed: true }),
    onSuccess: () => {
      toast.success('Callback marcado como completado')
      qc.invalidateQueries({ queryKey: ['callbacks'] })
    },
  })

  const pending = callbacks as Callback[]
  const done = doneCallbacks as Callback[]

  const todayCount = pending.filter((c) => isToday(new Date(c.scheduledAt))).length
  const overdueCount = pending.filter((c) => isPast(new Date(c.scheduledAt)) && !isToday(new Date(c.scheduledAt))).length

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Agenda de Callbacks</h1>
        <p className="text-gray-500 text-sm mt-1">
          Llamadas de seguimiento programadas
        </p>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <Clock size={16} className="text-amber-600" />
          <span className="text-sm font-medium text-amber-700">{todayCount} para hoy</span>
        </div>
        {overdueCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
            <CalendarClock size={16} className="text-red-600" />
            <span className="text-sm font-medium text-red-700">{overdueCount} vencidos</span>
          </div>
        )}
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg">
          <CalendarClock size={16} className="text-gray-500" />
          <span className="text-sm font-medium text-gray-600">{pending.length} pendientes</span>
        </div>
      </div>

      {/* Pending callbacks */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : pending.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <CheckCircle2 size={40} className="mx-auto mb-2 text-green-400" />
          <p className="font-medium text-green-600">¡Todo al día!</p>
          <p className="text-sm mt-1">No hay callbacks pendientes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((cb) => {
            const { label, classes } = dateLabel(cb.scheduledAt)
            const isPastDate = isPast(new Date(cb.scheduledAt)) && !isToday(new Date(cb.scheduledAt))

            return (
              <div
                key={cb.id}
                className={`card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isPastDate ? 'border-red-200 bg-red-50/30' : ''
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                    <Phone size={18} className="text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{cb.company.razonSocial || cb.company.ruc}</p>
                    <p className="text-sm text-gray-500">
                      {cb.company.contacts?.[0]?.nombre ?? '—'}
                      {cb.company.contacts?.[0]?.telefono ? (
                        <> · <a href={`tel:${cb.company.contacts[0].telefono}`} className="hover:text-blue-600 font-mono">{cb.company.contacts[0].telefono}</a></>
                      ) : null}
                    </p>
                    {cb.notes && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{cb.notes}</p>
                    )}
                    {isAdmin && (
                      <p className="text-xs text-gray-400">Agente: {cb.agent.name}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                  <div className="text-right">
                    <span className={`badge ${classes}`}>{label}</span>
                    <p className="text-xs text-gray-400 mt-1">
                      {format(new Date(cb.scheduledAt), 'HH:mm')}h
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('¿Marcar este callback como completado?')) {
                        completeMutation.mutate(cb.id)
                      }
                    }}
                    disabled={completeMutation.isPending}
                    className="btn-success py-2 px-3 min-h-[44px]"
                    title="Marcar como completado"
                  >
                    <CheckCircle2 size={15} />
                    Completado
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Completed callbacks toggle */}
      <div>
        <button
          onClick={() => setShowCompleted(!showCompleted)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
        >
          {showCompleted ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {showCompleted ? 'Ocultar completados' : 'Ver callbacks completados'}
        </button>

        {showCompleted && done.length > 0 && (
          <div className="mt-4 space-y-2 opacity-60">
            {done.slice(0, 20).map((cb) => (
              <div key={cb.id} className="card p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">{cb.company.razonSocial || cb.company.ruc}</p>
                  <p className="text-xs text-gray-400">{cb.company.contacts?.[0]?.telefono ?? '—'}</p>
                </div>
                <div className="text-right">
                  <span className="badge bg-green-100 text-green-700">Completado</span>
                  <p className="text-xs text-gray-400 mt-1">
                    {format(new Date(cb.scheduledAt), "d MMM 'a las' HH:mm", { locale: es })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
