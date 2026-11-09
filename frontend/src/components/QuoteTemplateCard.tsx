import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ChevronDown, ChevronRight, ImagePlus, Star, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  createQuoteTemplate,
  deleteQuoteTemplate,
  deleteQuoteTemplateImage,
  getQuoteTemplateAsset,
  getQuoteSettings,
  getQuoteTemplates,
  patchQuoteSettings,
  patchQuoteTemplate,
  uploadQuoteTemplateImage,
  type QuoteTemplate,
} from '../api/client'

function apiError(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
  return msg ?? fallback
}

function TemplateThumb({
  templateId,
  slot,
  promoId,
  cacheKey,
  alt,
}: {
  templateId: string
  slot: 'letterhead' | 'signature' | 'promo'
  promoId?: string
  cacheKey: string
  alt: string
}) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let url: string | null = null
    let cancel = false
    getQuoteTemplateAsset(templateId, slot, promoId)
      .then((blob) => {
        if (cancel) return
        url = URL.createObjectURL(blob)
        setSrc(url)
      })
      .catch(() => {
        if (!cancel) setSrc(null)
      })
    return () => {
      cancel = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [templateId, slot, promoId, cacheKey])
  if (!src) return <div className="h-12 w-16 rounded-md bg-gray-100" />
  return <img src={src} alt={alt} className="h-12 w-16 rounded-md border border-gray-200 bg-gray-50 object-contain" />
}

export default function QuoteTemplateCard() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const slotRef = useRef<'letterhead' | 'signature' | 'promo'>('letterhead')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [greeting, setGreeting] = useState('')
  const [farewell, setFarewell] = useState('')
  const [newName, setNewName] = useState('')
  const [newGreeting, setNewGreeting] = useState('')
  const [newFarewell, setNewFarewell] = useState('')
  const [newDefault, setNewDefault] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['quote-templates'],
    queryFn: getQuoteTemplates,
  })
  const { data: quoteSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ['quote-settings'],
    queryFn: getQuoteSettings,
  })
  const shareEnabled = quoteSettings?.shareEnabled === true

  const selected =
    templates.find((item) => item.id === selectedId) ??
    templates.find((item) => item.isDefault) ??
    templates[0] ??
    null

  useEffect(() => {
    if (selectedId && templates.some((item) => item.id === selectedId)) return
    const next = templates.find((item) => item.isDefault) ?? templates[0]
    setSelectedId(next?.id ?? null)
  }, [templates, selectedId])

  useEffect(() => {
    if (!selected) return
    setName(selected.name)
    setGreeting(selected.greeting)
    setFarewell(selected.farewell)
  }, [selected])

  const refresh = () => qc.invalidateQueries({ queryKey: ['quote-templates'] })

  const save = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('Sin formato')
      return patchQuoteTemplate(selected.id, { name, greeting, farewell })
    },
    onSuccess: () => {
      refresh()
      toast.success('Formato guardado')
    },
    onError: (err: unknown) => toast.error(apiError(err, 'No se pudo guardar el formato')),
  })

  const makeDefault = useMutation({
    mutationFn: (id: string) => patchQuoteTemplate(id, { isDefault: true }),
    onSuccess: () => {
      refresh()
      toast.success('Formato predeterminado actualizado')
    },
    onError: (err: unknown) => toast.error(apiError(err, 'No se pudo marcar el formato')),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteQuoteTemplate(id),
    onSuccess: () => {
      setSelectedId(null)
      refresh()
      toast.success('Formato borrado')
    },
    onError: (err: unknown) => toast.error(apiError(err, 'No se pudo borrar el formato')),
  })

  const create = useMutation({
    mutationFn: () =>
      createQuoteTemplate({
        name: newName,
        greeting: newGreeting,
        farewell: newFarewell,
        isDefault: newDefault,
      }),
    onSuccess: (created) => {
      setCreating(false)
      setNewName('')
      setNewGreeting('')
      setNewFarewell('')
      setNewDefault(false)
      setSelectedId(created.id)
      setExpandedId(created.id)
      refresh()
      toast.success('Formato creado')
    },
    onError: (err: unknown) => toast.error(apiError(err, 'No se pudo crear el formato')),
  })

  const upload = useMutation({
    mutationFn: (file: File) => {
      if (!selected) throw new Error('Sin formato')
      return uploadQuoteTemplateImage(selected.id, slotRef.current, file)
    },
    onSuccess: () => {
      refresh()
      toast.success('Imagen guardada')
    },
    onError: (err: unknown) => toast.error(apiError(err, 'No se pudo subir la imagen')),
  })

  const clearImage = useMutation({
    mutationFn: (slot: { kind: 'letterhead' | 'signature' | 'promo'; promoId?: string }) => {
      if (!selected) throw new Error('Sin formato')
      return deleteQuoteTemplateImage(selected.id, slot.kind, slot.promoId)
    },
    onSuccess: () => {
      refresh()
      toast.success('Imagen quitada')
    },
    onError: (err: unknown) => toast.error(apiError(err, 'No se pudo quitar la imagen')),
  })

  function pick(slot: 'letterhead' | 'signature' | 'promo') {
    slotRef.current = slot
    fileRef.current?.click()
  }

  function toggleFormat(id: string) {
    setExpandedId((current) => (current === id ? null : id))
    const item = templates.find((row) => row.id === id)
    if (!item || selectedId === id) {
      setSelectedId(id)
      return
    }
    setSelectedId(id)
    setName(item.name)
    setGreeting(item.greeting)
    setFarewell(item.farewell)
  }

  const shareToggle = useMutation({
    mutationFn: (next: boolean) => patchQuoteSettings(next),
    onSuccess: (data) => {
      qc.setQueryData(['quote-settings'], data)
      toast.success(data.shareEnabled ? 'WhatsApp y correo activados' : 'WhatsApp y correo desactivados')
    },
    onError: (err: unknown) => toast.error(apiError(err, 'No se pudo guardar el ajuste')),
  })

  return (
    <div className="card p-4 space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">Formato Cotización PDF</h2>
        <p className="mt-1 text-xs text-gray-500">
          El PDF se arma con piezas. Abre un formato para editar el saludo, la despedida, el membrete, la firma
          y las imágenes. El predeterminado es el que usa Descargar PDF.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">Compartir por WhatsApp y correo</p>
          <p className="mt-0.5 text-xs text-gray-500">
            Apagado: en la propuesta solo queda Descargar PDF.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={shareEnabled}
          aria-label="Compartir por WhatsApp y correo"
          disabled={settingsLoading || shareToggle.isPending}
          onClick={() => shareToggle.mutate(!shareEnabled)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            shareEnabled ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              shareEnabled ? 'left-5' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      {isLoading ? (
        <div className="h-16 animate-pulse rounded-lg bg-gray-100" />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            {templates.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-500">Todavía no hay formatos.</p>
            ) : (
              templates.map((item) => {
                const open = expandedId === item.id
                return (
                  <div key={item.id} className="border-b border-gray-100 last:border-b-0">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => toggleFormat(item.id)}
                      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm ${
                        open ? 'bg-blue-50/80' : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      {open ? (
                        <ChevronDown size={16} className="shrink-0 text-gray-400" />
                      ) : (
                        <ChevronRight size={16} className="shrink-0 text-gray-400" />
                      )}
                      <span className="min-w-0 truncate font-medium text-gray-900">{item.name}</span>
                      {item.isDefault ? (
                        <Badge className="border-transparent bg-blue-600 text-white hover:bg-blue-600">
                          Predeterminado
                        </Badge>
                      ) : null}
                    </button>
                    {open && selected?.id === item.id ? (
                      <div className="border-t border-gray-100 bg-gray-50/70 px-3 py-3">
                        <TemplateEditor
                          template={selected}
                          name={name}
                          greeting={greeting}
                          farewell={farewell}
                          busy={save.isPending || makeDefault.isPending || remove.isPending || upload.isPending || clearImage.isPending}
                          onName={setName}
                          onGreeting={setGreeting}
                          onFarewell={setFarewell}
                          onSave={() => save.mutate()}
                          onDefault={() => makeDefault.mutate(selected.id)}
                          onDelete={() => {
                            if (window.confirm(`¿Borrar el formato ${selected.name}?`)) remove.mutate(selected.id)
                          }}
                          onPick={pick}
                          onClearLetterhead={() => clearImage.mutate({ kind: 'letterhead' })}
                          onClearSignature={() => clearImage.mutate({ kind: 'signature' })}
                          onClearPromo={(promoId) => clearImage.mutate({ kind: 'promo', promoId })}
                        />
                      </div>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setCreating((open) => !open)}>
            Añadir formato
          </Button>

          {creating ? (
            <form
              className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
              onSubmit={(e) => {
                e.preventDefault()
                create.mutate()
              }}
            >
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del formato"
                className="bg-white"
                maxLength={80}
                required
              />
              <textarea
                className="input min-h-[72px] resize-y bg-white"
                value={newGreeting}
                onChange={(e) => setNewGreeting(e.target.value)}
                placeholder="Saludo del PDF"
                maxLength={2000}
                required
              />
              <textarea
                className="input min-h-[72px] resize-y bg-white"
                value={newFarewell}
                onChange={(e) => setNewFarewell(e.target.value)}
                placeholder="Despedida del PDF"
                maxLength={2000}
                required
              />
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={newDefault}
                  onChange={(e) => setNewDefault(e.target.checked)}
                />
                Formato predeterminado
              </label>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={create.isPending} className="bg-blue-600 text-white hover:bg-blue-700">
                  {create.isPending ? 'Creando…' : 'Crear formato'}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setCreating(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          ) : null}
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) upload.mutate(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

function TemplateEditor({
  template,
  name,
  greeting,
  farewell,
  busy,
  onName,
  onGreeting,
  onFarewell,
  onSave,
  onDefault,
  onDelete,
  onPick,
  onClearLetterhead,
  onClearSignature,
  onClearPromo,
}: {
  template: QuoteTemplate
  name: string
  greeting: string
  farewell: string
  busy: boolean
  onName: (value: string) => void
  onGreeting: (value: string) => void
  onFarewell: (value: string) => void
  onSave: () => void
  onDefault: () => void
  onDelete: () => void
  onPick: (slot: 'letterhead' | 'signature' | 'promo') => void
  onClearLetterhead: () => void
  onClearSignature: () => void
  onClearPromo: (promoId: string) => void
}) {
  return (
    <div className="ml-6 space-y-4 border-l border-gray-200 pl-3">
      <div className="flex flex-wrap items-center gap-2">
        {template.isDefault ? (
          <Badge className="border-transparent bg-blue-600 text-white hover:bg-blue-600">
            <Star className="mr-1 size-3" />
            Predeterminado
          </Badge>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onDefault}>
            Usar como predeterminado
          </Button>
        )}
        {!template.isDefault ? (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onDelete}>
            <Trash2 />
            Borrar
          </Button>
        ) : null}
      </div>

      <div className="space-y-1">
        <label className="label" htmlFor="quote-template-name">
          Nombre
        </label>
        <Input id="quote-template-name" value={name} onChange={(e) => onName(e.target.value)} maxLength={80} className="bg-white" />
      </div>

      <section className="space-y-1">
        <h3 className="text-sm font-semibold text-gray-800">Saludo</h3>
        <textarea
          id="quote-template-greeting"
          aria-label="Saludo"
          className="input min-h-[72px] resize-y bg-white"
          value={greeting}
          onChange={(e) => onGreeting(e.target.value)}
          maxLength={2000}
        />
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-semibold text-gray-800">Despedida</h3>
        <textarea
          id="quote-template-farewell"
          aria-label="Despedida"
          className="input min-h-[72px] resize-y bg-white"
          value={farewell}
          onChange={(e) => onFarewell(e.target.value)}
          maxLength={2000}
        />
        <Button type="button" size="sm" disabled={busy} onClick={onSave} className="bg-blue-600 text-white hover:bg-blue-700">
          {busy ? 'Guardando…' : 'Guardar texto'}
        </Button>
      </section>

      <ImageSlot
        title="Membrete"
        hint="JPG o PNG, arriba del PDF"
        filled={template.hasLetterhead}
        disabled={busy}
        onPick={() => onPick('letterhead')}
        onClear={onClearLetterhead}
      >
        {template.hasLetterhead ? (
          <TemplateThumb
            templateId={template.id}
            slot="letterhead"
            cacheKey={template.updatedAt}
            alt="Membrete"
          />
        ) : null}
      </ImageSlot>
      <ImageSlot
        title="Firma"
        hint="Al pie, junto a la despedida"
        filled={template.hasSignature}
        disabled={busy}
        onPick={() => onPick('signature')}
        onClear={onClearSignature}
      >
        {template.hasSignature ? (
          <TemplateThumb
            templateId={template.id}
            slot="signature"
            cacheKey={template.updatedAt}
            alt="Firma"
          />
        ) : null}
      </ImageSlot>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-800">Imágenes</h3>
        <p className="text-xs text-gray-500">Hasta 4, en una franja pequeña del PDF.</p>
        <div className="flex flex-wrap gap-2">
          {template.promos.map((promo) => (
            <div key={promo.id} className="relative">
              <TemplateThumb
                templateId={template.id}
                slot="promo"
                promoId={promo.id}
                cacheKey={promo.id}
                alt="Imagen de la propuesta"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => onClearPromo(promo.id)}
                className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 text-gray-500 shadow ring-1 ring-gray-200 hover:text-red-600"
                aria-label="Quitar imagen"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || template.promos.length >= 4}
          onClick={() => onPick('promo')}
        >
          <ImagePlus />
          Añadir
        </Button>
      </section>
    </div>
  )
}

function ImageSlot({
  title,
  hint,
  filled,
  disabled,
  onPick,
  onClear,
  children,
}: {
  title: string
  hint: string
  filled: boolean
  disabled: boolean
  onPick: () => void
  onClear: () => void
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      <p className="text-xs text-gray-500">{hint}</p>
      {children}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onPick}>
          <ImagePlus />
          {filled ? 'Cambiar' : 'Subir'}
        </Button>
        {filled ? (
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={onClear}>
            Quitar
          </Button>
        ) : null}
      </div>
    </div>
  )
}
