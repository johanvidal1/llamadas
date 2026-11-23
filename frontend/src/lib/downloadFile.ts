import toast from 'react-hot-toast'

type SaveFilePickerOptions = {
  suggestedName: string
  types?: Array<{
    description: string
    accept: Record<string, string[]>
  }>
}

type FileSystemWritableFileStream = {
  write: (data: Blob) => Promise<void>
  close: () => Promise<void>
}

type FileSystemFileHandle = {
  createWritable: () => Promise<FileSystemWritableFileStream>
}

declare global {
  interface Window {
    showSaveFilePicker?: (options: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
  }
}

export const FILE_IN_USE_TOAST =
  'Cierra el PDF abierto con ese nombre y vuelve a guardar, o elige otro nombre.'

/** Toast + reopen Save As this many times when the chosen file is locked. */
export const MAX_LOCKED_FILE_RETRIES = 5

export class FileInUseError extends Error {
  readonly code = 'FILE_IN_USE' as const
  constructor(message = FILE_IN_USE_TOAST) {
    super(message)
    this.name = 'FileInUseError'
  }
}

export function isFileInUseError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  if (err instanceof FileInUseError) return true
  const rec = err as { name?: string; code?: string }
  return rec.name === 'FileInUseError' || rec.code === 'FILE_IN_USE'
}

export type SaveBlobWithPickerOptions = {
  /** Called once per locked pick (before reopening the picker). Skips the default toast. */
  onLocked?: (message: string) => void
}

function errorName(err: unknown): string {
  if (!err || typeof err !== 'object') return ''
  return String((err as { name?: unknown }).name ?? '')
}

function isAbortError(err: unknown): boolean {
  return errorName(err) === 'AbortError'
}

function isLockedFileError(err: unknown): boolean {
  const name = errorName(err)
  if (
    name === 'NotAllowedError' ||
    name === 'NoModificationAllowedError' ||
    name === 'InvalidStateError' ||
    name === 'FileInUseError'
  ) {
    return true
  }
  const rec = err as { code?: string }
  if (rec.code === 'FILE_IN_USE') return true
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /in use|locked|being used|no modification allowed/i.test(msg)
}

function notifyLocked(onLocked?: (message: string) => void) {
  if (onLocked) {
    onLocked(FILE_IN_USE_TOAST)
    return
  }
  toast.error(FILE_IN_USE_TOAST)
}

function extensionFromFilename(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

function mimeTypeForExtension(ext: string): string {
  switch (ext) {
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'xls':
      return 'application/vnd.ms-excel'
    case 'csv':
      return 'text/csv'
    case 'zip':
      return 'application/zip'
    case 'pdf':
      return 'application/pdf'
    case 'png':
      return 'image/png'
    default:
      return 'application/octet-stream'
  }
}

function pickerTypesForFilename(filename: string) {
  const ext = extensionFromFilename(filename)
  const mime = mimeTypeForExtension(ext)
  return [
    {
      description: ext ? ext.toUpperCase() : 'Archivo',
      accept: { [mime]: ext ? [`.${ext}`] : [] },
    },
  ]
}

async function writeBlobToHandle(handle: FileSystemFileHandle, blob: Blob) {
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
}

/**
 * Saves a blob using the File System Access API when available (user picks save location).
 * Falls back to a regular download link. Returns false if the user cancels the picker.
 * Locked/open files toast and reopen Save As (same suggestedName) instead of `<a download>`.
 */
export async function saveBlobWithPicker(
  blob: Blob,
  suggestedName: string,
  options?: SaveBlobWithPickerOptions
): Promise<boolean> {
  if (typeof window.showSaveFilePicker === 'function') {
    const pickerOpts: SaveFilePickerOptions = {
      suggestedName,
      types: pickerTypesForFilename(suggestedName),
    }
    let lockedTries = 0

    while (true) {
      try {
        const handle = await window.showSaveFilePicker(pickerOpts)
        await writeBlobToHandle(handle, blob)
        return true
      } catch (err) {
        if (isAbortError(err)) {
          return false
        }
        if (isLockedFileError(err)) {
          notifyLocked(options?.onLocked)
          lockedTries += 1
          if (lockedTries >= MAX_LOCKED_FILE_RETRIES) {
            return false
          }
          continue
        }
        break
      }
    }
  }

  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = suggestedName
  link.click()
  window.URL.revokeObjectURL(url)
  return true
}

export function filenameFromContentDisposition(disposition: string | undefined): string | null {
  if (!disposition) return null
  const rfc5987 = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (rfc5987?.[1]) {
    try {
      return decodeURIComponent(rfc5987[1])
    } catch {
      return rfc5987[1]
    }
  }
  const quoted = disposition.match(/filename="([^"]+)"/)
  if (quoted?.[1]) return quoted[1]
  const unquoted = disposition.match(/filename=([^;\s]+)/)
  return unquoted?.[1] ?? null
}
