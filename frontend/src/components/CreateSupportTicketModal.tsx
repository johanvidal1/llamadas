import { useRef, useState } from 'react'
import { ImagePlus, LifeBuoy, X } from 'lucide-react'
import { createSupportTicket } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { hasValidElevation } from '../lib/adminElevation'
import AdminElevationModal from './AdminElevationModal'

type Props = {
  open: boolean
  onClose: () => void
  onCreated?: () => void
}

const MAX_IMAGES = 5
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function buildTicketContext(): Record<string, unknown> {
  return {
    url: window.location.href,
    pathname: window.location.pathname,
    search: window.location.search,
    view: window.location.pathname,
    userAgent: navigator.userAgent,
    batchId: new URLSearchParams(window.location.search).get('batchId') || undefined,
    companyId: new URLSearchParams(window.location.search).get('companyId') || undefined,
    filter: new URLSearchParams(window.location.search).get('filter') || undefined,
  }
}

type PreviewFile = { file: File; url: string }

export default function CreateSupportTicketModal({ open, onClose, onCreated }: Props) {
  const { isAdmin } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [subject, setSubject] = useState('')
  const [whatHappened, setWhatHappened] = useState('')
  const [whatExpected, setWhatExpected] = useState('')
  const [stepsToReproduce, setStepsToReproduce] = useState('')
  const [images, setImages] = useState<PreviewFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [needsElevation, setNeedsElevation] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  if (!open) return null

  const clearImagePreviews = (list: PreviewFile[]) => {
    for (const item of list) URL.revokeObjectURL(item.url)
  }

  const resetForm = () => {
    setSubject('')
    setWhatHappened('')
    setWhatExpected('')
    setStepsToReproduce('')
    setImages((prev) => {
      clearImagePreviews(prev)
      return []
    })
    setError(null)
    setSuccessMsg(null)
    setNeedsElevation(false)
  }

  const handleClose = () => {
    if (submitting) return
    resetForm()
    onClose()
  }

  const addImages = (fileList: FileList | null) => {
    if (!fileList?.length) return
    setError(null)
    const next: PreviewFile[] = [...images]
    for (const file of Array.from(fileList)) {
      if (next.length >= MAX_IMAGES) {
        setError(`Máximo ${MAX_IMAGES} imágenes`)
        break
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        setError('Solo JPG, PNG o WEBP')
        continue
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError('Cada imagen debe pesar máximo 5 MB')
        continue
      }
      next.push({ file, url: URL.createObjectURL(file) })
    }
    setImages(next)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const removeImage = (index: number) => {
    setImages((prev) => {
      const copy = [...prev]
      const [removed] = copy.splice(index, 1)
      if (removed) URL.revokeObjectURL(removed.url)
      return copy
    })
  }

  const submitTicket = async () => {
    setError(null)
    setSubmitting(true)
    try {
      await createSupportTicket({
        subject: subject.trim(),
        whatHappened: whatHappened.trim(),
        whatExpected: whatExpected.trim(),
        stepsToReproduce: stepsToReproduce.trim(),
        context: buildTicketContext(),
        images: images.map((i) => i.file),
      })
      setSuccessMsg('Ticket enviado. El administrador lo verá en Soporte.')
      setSubject('')
      setWhatHappened('')
      setWhatExpected('')
      setStepsToReproduce('')
      setImages((prev) => {
        clearImagePreviews(prev)
        return []
      })
      onCreated?.()
      window.setTimeout(() => {
        resetForm()
        onClose()
      }, 1200)
    } catch (err: unknown) {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code
      if (code === 'ADMIN_ELEVATION_REQUIRED') {
        setNeedsElevation(true)
        setError('Se requiere autorización de administrador.')
      } else {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'No se pudo crear el ticket'
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isAdmin && !hasValidElevation()) {
      setNeedsElevation(true)
      return
    }
    await submitTicket()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={handleClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
              <LifeBuoy size={18} className="text-blue-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Ticket de soporte</h2>
              <p className="text-sm text-gray-500 mt-1">
                {isAdmin
                  ? 'Describe el problema. Se incluirá el contexto de la pantalla actual.'
                  : 'Requiere autorización de un administrador. Se incluirá el contexto de la pantalla.'}
              </p>
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">Asunto</span>
            <input
              type="text"
              required
              minLength={3}
              maxLength={200}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Resumen breve"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">¿Qué ocurrió?</span>
            <textarea
              required
              minLength={5}
              maxLength={5000}
              rows={3}
              value={whatHappened}
              onChange={(e) => setWhatHappened(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              placeholder="Describe el problema observado"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">¿Qué esperabas?</span>
            <textarea
              required
              minLength={5}
              maxLength={5000}
              rows={3}
              value={whatExpected}
              onChange={(e) => setWhatExpected(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
              placeholder="Comportamiento esperado"
            />
          </label>

          <div className="space-y-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Pasos a reproducir</span>
              <textarea
                required
                minLength={5}
                maxLength={5000}
                rows={3}
                value={stepsToReproduce}
                onChange={(e) => setStepsToReproduce(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                placeholder="1. … 2. … 3. …"
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => addImages(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={images.length >= MAX_IMAGES}
                className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:text-blue-900 disabled:opacity-50"
              >
                <ImagePlus size={16} />
                Adjuntar imágenes ({images.length}/{MAX_IMAGES})
              </button>
              <span className="text-xs text-gray-400">JPG/PNG/WEBP · máx. 5 MB c/u</span>
            </div>

            {images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {images.map((img, i) => (
                  <div
                    key={img.url}
                    className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-gray-50"
                  >
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center"
                      aria-label="Quitar imagen"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
          {successMsg && (
            <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">{successMsg}</p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <button type="submit" disabled={submitting} className="btn-primary justify-center flex-1">
              {submitting ? 'Enviando…' : 'Enviar ticket'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="btn-secondary justify-center flex-1"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>

      <AdminElevationModal
        open={needsElevation}
        passwordHint="Un administrador debe autorizar la creación del ticket con su contraseña."
        onClose={() => setNeedsElevation(false)}
        onSuccess={() => {
          setNeedsElevation(false)
          void submitTicket()
        }}
      />
    </>
  )
}
