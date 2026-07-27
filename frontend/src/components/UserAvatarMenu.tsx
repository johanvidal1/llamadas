import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Camera, LogOut, Trash2 } from 'lucide-react'
import {
  deleteAvatar,
  fetchMyAvatarBlob,
  uploadAvatar,
} from '../api/client'
import { useAuth } from '../contexts/AuthContext'

type PresenceTone = 'online' | 'recent' | 'offline'

type Props = {
  presence: PresenceTone
  isAdmin: boolean
  onLogout: () => void
}

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 2 * 1024 * 1024

function presenceDotClass(tone: PresenceTone): string {
  if (tone === 'online') return 'bg-emerald-400 ring-white'
  if (tone === 'recent') return 'bg-amber-400 ring-white'
  return 'bg-gray-400 ring-white'
}

function presenceLabel(tone: PresenceTone): string {
  if (tone === 'online') return 'En línea'
  if (tone === 'recent') return 'Ausente'
  return 'Desconectado'
}

export default function UserAvatarMenu({ presence, isAdmin, onLogout }: Props) {
  const { user, updateUser } = useAuth()
  const [open, setOpen] = useState(false)
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!user?.hasAvatar) {
      setAvatarSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return
    }
    let objectUrl: string | null = null
    let cancelled = false
    fetchMyAvatarBlob()
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setAvatarSrc((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return objectUrl
        })
      })
      .catch(() => {
        if (!cancelled) {
          setAvatarSrc((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return null
          })
        }
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [user?.hasAvatar, user?.id, user?.avatarVersion])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const initials = (user?.name?.charAt(0) || '?').toUpperCase()

  const handleFile = async (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) return
    if (!ALLOWED.has(file.type)) {
      toast.error('Solo JPG, PNG o WEBP')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error('Máximo 2 MB')
      return
    }
    setUploading(true)
    try {
      const next = await uploadAvatar(file)
      updateUser({
        hasAvatar: next.hasAvatar ?? true,
        avatarVersion: Date.now(),
      })
      toast.success('Foto actualizada')
      setOpen(false)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'No se pudo subir la foto')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    setUploading(true)
    try {
      await deleteAvatar()
      updateUser({ hasAvatar: false, avatarVersion: Date.now() })
      toast.success('Foto eliminada')
      setOpen(false)
    } catch {
      toast.error('No se pudo eliminar la foto')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center gap-2 rounded-lg p-1 pr-1.5 hover:bg-white/10 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
        title={user?.name}
      >
        <span className="relative shrink-0">
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt=""
              className="w-8 h-8 rounded-full object-cover ring-2 ring-white/30"
            />
          ) : (
            <span
              className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ring-2 ring-white/30 ${
                isAdmin ? 'bg-green-600' : 'bg-blue-600'
              }`}
            >
              {initials}
            </span>
          )}
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ${presenceDotClass(presence)}`}
            title={presenceLabel(presence)}
            aria-hidden
          />
        </span>
        <span className="hidden sm:block text-left min-w-0 max-w-[9rem]">
          <span className="block text-white text-xs font-medium truncate leading-tight">
            {user?.name}
          </span>
          <span className="block text-white/70 text-[10px] truncate leading-tight">
            {isAdmin ? 'Administrador' : 'Agente'}
          </span>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200 bg-white shadow-xl z-[60] py-1 overflow-hidden"
        >
          <div className="px-3 py-2.5 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1.5">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${presenceDotClass(presence).split(' ')[0]}`} />
              {presenceLabel(presence)}
            </p>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files)}
          />

          <button
            type="button"
            role="menuitem"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Camera size={15} className="text-gray-400" />
            {user?.hasAvatar ? 'Cambiar foto' : 'Subir foto'}
          </button>

          {user?.hasAvatar ? (
            <button
              type="button"
              role="menuitem"
              disabled={uploading}
              onClick={() => void handleRemove()}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Trash2 size={15} className="text-gray-400" />
              Quitar foto
            </button>
          ) : null}

          <div className="my-1 border-t border-gray-100" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut size={15} />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}

/** Compact avatar chip for mobile drawer (no menu). */
export function UserAvatarChip({
  name,
  hasAvatar,
  isAdmin,
  presence,
}: {
  name?: string
  hasAvatar?: boolean
  isAdmin: boolean
  presence: PresenceTone
}) {
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!hasAvatar) {
      setAvatarSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      return
    }
    let objectUrl: string | null = null
    let cancelled = false
    fetchMyAvatarBlob()
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setAvatarSrc((prev) => {
          if (prev) URL.revokeObjectURL(prev)
          return objectUrl
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [hasAvatar])

  const initials = (name?.charAt(0) || '?').toUpperCase()

  return (
    <span className="relative shrink-0">
      {avatarSrc ? (
        <img src={avatarSrc} alt="" className="w-8 h-8 rounded-full object-cover" />
      ) : (
        <span
          className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${
            isAdmin ? 'bg-green-600' : 'bg-blue-600'
          }`}
        >
          {initials}
        </span>
      )}
      <span
        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${presenceDotClass(presence)}`}
        aria-hidden
      />
    </span>
  )
}
