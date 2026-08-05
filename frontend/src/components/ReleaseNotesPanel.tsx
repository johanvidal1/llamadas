import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react'
import {
  createReleaseNote,
  deleteReleaseNote,
  getReleaseNotes,
  type ReleaseNote,
  updateReleaseNote,
} from '../api/client'

const RELEASE_HISTORY_PREVIEW = 5

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** Minimal safe markdown: **bold**, *italic*, _italic_ — no HTML. */
function renderInlineMarkdown(text: string): ReactNode {
  const TOKEN = /(\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_)/g
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = TOKEN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    if (match[2] !== undefined) {
      nodes.push(<strong key={key++}>{match[2]}</strong>)
    } else if (match[3] !== undefined) {
      nodes.push(<em key={key++}>{match[3]}</em>)
    } else if (match[4] !== undefined) {
      nodes.push(<em key={key++}>{match[4]}</em>)
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  if (nodes.length === 0) return text
  if (nodes.length === 1 && typeof nodes[0] === 'string') return nodes[0]
  return nodes
}

function todayIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dateLabelEs(isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return isoDate
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return `${day} de ${MONTHS_ES[month - 1]} de ${year}`
}

function apiErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const msg = (err.response?.data as { error?: string } | undefined)?.error
    if (msg) return msg
  }
  return fallback
}

type EditorState =
  | { mode: 'create' }
  | { mode: 'edit'; note: ReleaseNote }
  | null

export default function ReleaseNotesPanel({ isSystemOwner }: { isSystemOwner: boolean }) {
  const queryClient = useQueryClient()
  const itemsTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [showFullHistory, setShowFullHistory] = useState(false)
  const [editor, setEditor] = useState<EditorState>(null)
  const [formDate, setFormDate] = useState(todayIso())
  const [formItemsText, setFormItemsText] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const { data: releases = [], isLoading, isError } = useQuery({
    queryKey: ['release-notes'],
    queryFn: getReleaseNotes,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['release-notes'] })

  const createMut = useMutation({
    mutationFn: createReleaseNote,
    onSuccess: () => {
      invalidate()
      setEditor(null)
    },
    onError: (err) => setFormError(apiErrorMessage(err, 'No se pudo crear la novedad')),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { date: string; items: string[] } }) =>
      updateReleaseNote(id, data),
    onSuccess: () => {
      invalidate()
      setEditor(null)
    },
    onError: (err) => setFormError(apiErrorMessage(err, 'No se pudo guardar la novedad')),
  })

  const deleteMut = useMutation({
    mutationFn: deleteReleaseNote,
    onSuccess: () => invalidate(),
  })

  const openCreate = () => {
    setFormDate(todayIso())
    setFormItemsText('')
    setFormError(null)
    setEditor({ mode: 'create' })
  }

  const openEdit = (note: ReleaseNote) => {
    setFormDate(note.date)
    setFormItemsText(note.items.join('\n'))
    setFormError(null)
    setEditor({ mode: 'edit', note })
  }

  const wrapSelection = (prefix: string, suffix: string) => {
    const el = itemsTextareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = formItemsText.slice(start, end)
    const next = formItemsText.slice(0, start) + prefix + selected + suffix + formItemsText.slice(end)
    setFormItemsText(next)
    requestAnimationFrame(() => {
      el.focus()
      const innerStart = start + prefix.length
      el.setSelectionRange(innerStart, innerStart + selected.length)
    })
  }

  const parseItems = () =>
    formItemsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

  const submitEditor = (e: FormEvent) => {
    e.preventDefault()
    const items = parseItems()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formDate)) {
      setFormError('Fecha inválida (usa YYYY-MM-DD)')
      return
    }
    if (items.length === 0) {
      setFormError('Agrega al menos un bullet (una línea por ítem)')
      return
    }
    setFormError(null)
    if (editor?.mode === 'create') {
      createMut.mutate({ date: formDate, items })
    } else if (editor?.mode === 'edit') {
      updateMut.mutate({ id: editor.note.id, data: { date: formDate, items } })
    }
  }

  const handleDelete = (note: ReleaseNote) => {
    if (
      !confirm(
        `¿Eliminar las novedades del ${note.dateLabel}?\nEsta acción no se puede deshacer.`
      )
    ) {
      return
    }
    deleteMut.mutate(note.id)
  }

  const visible =
    showFullHistory || releases.length <= RELEASE_HISTORY_PREVIEW
      ? releases
      : releases.slice(0, RELEASE_HISTORY_PREVIEW)

  const saving = createMut.isPending || updateMut.isPending

  if (isLoading) {
    return (
      <div className="card p-6">
        <p className="text-sm text-gray-500">Cargando novedades…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="card p-6">
        <p className="text-sm text-red-600">No se pudieron cargar las novedades del sistema.</p>
      </div>
    )
  }

  if (releases.length === 0 && !isSystemOwner) {
    return null
  }

  return (
    <div className="card p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <Sparkles size={18} className="text-blue-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-900">Novedades del sistema</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {releases[0]
                  ? `Última actualización: ${releases[0].dateLabel}`
                  : 'Sin novedades publicadas'}
              </p>
            </div>
            {isSystemOwner && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 shrink-0"
              >
                <Plus size={16} />
                Añadir
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {visible.map((release) => (
          <section key={release.id}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="text-sm font-medium text-gray-800">{release.dateLabel}</h3>
              {isSystemOwner && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Editar"
                    onClick={() => openEdit(release)}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    title="Eliminar"
                    onClick={() => handleDelete(release)}
                    disabled={deleteMut.isPending}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
            <ul className="space-y-2.5 list-disc list-outside pl-5 text-sm text-gray-600">
              {release.items.map((item) => (
                <li key={item} className="leading-relaxed">
                  {renderInlineMarkdown(item)}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {releases.length === 0 && isSystemOwner && (
          <p className="text-sm text-gray-500">
            Aún no hay novedades. Usa «Añadir» para publicar la primera.
          </p>
        )}
      </div>

      {releases.length > RELEASE_HISTORY_PREVIEW && !showFullHistory && (
        <button
          type="button"
          onClick={() => setShowFullHistory(true)}
          className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
        >
          Ver historial
        </button>
      )}

      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="release-note-editor-title"
            className="w-full max-w-lg bg-white rounded-xl shadow-xl p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 id="release-note-editor-title" className="font-semibold text-gray-900">
                {editor.mode === 'create' ? 'Añadir novedad' : 'Editar novedad'}
              </h3>
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="p-1 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitEditor} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="rn-date">
                  Fecha (YYYY-MM-DD)
                </label>
                <input
                  id="rn-date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="input w-full"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">{dateLabelEs(formDate)}</p>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-sm font-medium text-gray-700" htmlFor="rn-items">
                    Ítems (uno por línea)
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Negrita (**texto**)"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => wrapSelection('**', '**')}
                      className="min-w-[1.75rem] px-1.5 py-0.5 rounded border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50"
                    >
                      N
                    </button>
                    <button
                      type="button"
                      title="Cursiva (*texto*)"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => wrapSelection('*', '*')}
                      className="min-w-[1.75rem] px-1.5 py-0.5 rounded border border-gray-200 text-sm italic text-gray-700 hover:bg-gray-50"
                    >
                      C
                    </button>
                  </div>
                </div>
                <textarea
                  id="rn-items"
                  ref={itemsTextareaRef}
                  value={formItemsText}
                  onChange={(e) => setFormItemsText(e.target.value)}
                  rows={8}
                  className="input w-full font-mono text-sm"
                  placeholder="Beneficio o cambio visible para el usuario…"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Usa **texto** para negrita y *texto* para cursiva
                </p>
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditor(null)}
                  className="btn-secondary"
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
