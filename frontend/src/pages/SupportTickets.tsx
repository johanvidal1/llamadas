import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  api,
  getSupportTickets,
  patchSupportTicket,
  type SupportTicket,
  type SupportTicketAttachment,
} from '../api/client'
import CreateSupportTicketModal from '../components/CreateSupportTicketModal'

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Abierto',
  PENDING: 'Pendiente',
  CLOSED: 'Cerrado',
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  PENDING: 'bg-amber-100 text-amber-800',
  CLOSED: 'bg-gray-100 text-gray-600',
}

function readStructured(ctx: Record<string, unknown> | null | undefined) {
  if (!ctx) return null
  const whatHappened = typeof ctx.whatHappened === 'string' ? ctx.whatHappened : null
  const whatExpected = typeof ctx.whatExpected === 'string' ? ctx.whatExpected : null
  const stepsToReproduce =
    typeof ctx.stepsToReproduce === 'string' ? ctx.stepsToReproduce : null
  if (!whatHappened && !whatExpected && !stepsToReproduce) return null
  return { whatHappened, whatExpected, stepsToReproduce }
}

function TicketAttachmentThumb({
  ticketId,
  attachment,
}: {
  ticketId: string
  attachment: SupportTicketAttachment
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    void api
      .get(`/support-tickets/${ticketId}/attachments/${attachment.id}`, {
        responseType: 'blob',
      })
      .then((r) => {
        objectUrl = URL.createObjectURL(r.data as Blob)
        if (!cancelled) setUrl(objectUrl)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [ticketId, attachment.id])

  if (!url) {
    return (
      <div className="w-20 h-20 rounded-lg border border-gray-200 bg-gray-100 animate-pulse" />
    )
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <img
        src={url}
        alt={attachment.originalName || 'Adjunto'}
        className="w-20 h-20 rounded-lg object-cover border border-gray-200 hover:opacity-90"
      />
    </a>
  )
}

export default function SupportTickets() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['support-tickets', statusFilter],
    queryFn: () => getSupportTickets(statusFilter ? { status: statusFilter } : undefined),
  })

  const patchMut = useMutation({
    mutationFn: ({
      id,
      status,
      adminNote,
    }: {
      id: string
      status?: 'OPEN' | 'PENDING' | 'CLOSED'
      adminNote?: string | null
    }) => patchSupportTicket(id, { status, adminNote }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['support-tickets'] })
    },
  })

  const tickets = data?.tickets ?? []

  const openTicket = (t: SupportTicket) => {
    setExpandedId(t.id)
    setNoteDraft(t.adminNote ?? '')
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Soporte</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tickets del espacio (tenant)</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
          Nuevo ticket
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { value: '', label: 'Todos' },
          { value: 'OPEN', label: 'Abiertos' },
          { value: 'PENDING', label: 'Pendientes' },
          { value: 'CLOSED', label: 'Cerrados' },
        ].map((opt) => (
          <button
            key={opt.value || 'all'}
            type="button"
            onClick={() => setStatusFilter(opt.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === opt.value
                ? 'bg-green-700 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-gray-500">Cargando…</p>}
      {error && <p className="text-sm text-red-600">Error al cargar tickets</p>}

      {!isLoading && tickets.length === 0 && (
        <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded-xl px-4 py-8 text-center">
          No hay tickets{statusFilter ? ' con este estado' : ''}.
        </p>
      )}

      <div className="space-y-2">
        {tickets.map((t) => {
          const expanded = expandedId === t.id
          const structured = readStructured(t.context)
          const attachments = t.attachments ?? []
          return (
            <div
              key={t.id}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden"
            >
              <button
                type="button"
                onClick={() => (expanded ? setExpandedId(null) : openTicket(t))}
                className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-2 hover:bg-gray-50"
              >
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[t.status] ?? STATUS_STYLES.OPEN}`}
                >
                  {STATUS_LABELS[t.status] ?? t.status}
                </span>
                <span className="font-medium text-gray-900 text-sm flex-1 min-w-0 truncate">
                  {t.subject}
                </span>
                <span className="text-xs text-gray-500 truncate">
                  {t.createdBy.name} · {format(new Date(t.createdAt), 'dd/MM/yy HH:mm')}
                </span>
              </button>

              {expanded && (
                <div className="border-t border-gray-100 px-4 py-3 space-y-3 bg-gray-50/50">
                  {structured ? (
                    <div className="space-y-3 text-sm text-gray-700">
                      {structured.whatHappened && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            ¿Qué ocurrió?
                          </p>
                          <p className="mt-1 whitespace-pre-wrap">{structured.whatHappened}</p>
                        </div>
                      )}
                      {structured.whatExpected && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            ¿Qué esperabas?
                          </p>
                          <p className="mt-1 whitespace-pre-wrap">{structured.whatExpected}</p>
                        </div>
                      )}
                      {structured.stepsToReproduce && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            Pasos a reproducir
                          </p>
                          <p className="mt-1 whitespace-pre-wrap">{structured.stepsToReproduce}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{t.body}</p>
                  )}

                  {attachments.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        Imágenes
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {attachments.map((a) => (
                          <TicketAttachmentThumb key={a.id} ticketId={t.id} attachment={a} />
                        ))}
                      </div>
                    </div>
                  )}

                  {t.elevatedByAdmin && (
                    <p className="text-xs text-gray-500">
                      Autorizado por: {t.elevatedByAdmin.name} ({t.elevatedByAdmin.email})
                    </p>
                  )}
                  {t.context && typeof t.context === 'object' && (
                    <details className="text-xs text-gray-500">
                      <summary className="cursor-pointer">Contexto técnico</summary>
                      <pre className="mt-1 overflow-auto bg-white border border-gray-200 rounded p-2 text-[11px]">
                        {JSON.stringify(t.context, null, 2)}
                      </pre>
                    </details>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {(['OPEN', 'PENDING', 'CLOSED'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={patchMut.isPending || t.status === s}
                        onClick={() => patchMut.mutate({ id: t.id, status: s })}
                        className={`px-2.5 py-1 rounded text-xs font-medium border ${
                          t.status === s
                            ? 'border-green-600 text-green-800 bg-green-50'
                            : 'border-gray-200 text-gray-600 hover:bg-white'
                        }`}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>

                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Nota interna</span>
                    <textarea
                      rows={2}
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={patchMut.isPending}
                    onClick={() =>
                      patchMut.mutate({ id: t.id, adminNote: noteDraft.trim() || null })
                    }
                    className="btn-secondary text-sm"
                  >
                    Guardar nota
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <CreateSupportTicketModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void qc.invalidateQueries({ queryKey: ['support-tickets'] })}
      />
    </div>
  )
}
