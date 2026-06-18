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

/**
 * Saves a blob using the File System Access API when available (user picks save location).
 * Falls back to a regular download link. Returns false if the user cancels the picker.
 */
export async function saveBlobWithPicker(blob: Blob, suggestedName: string): Promise<boolean> {
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: pickerTypesForFilename(suggestedName),
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return true
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return false
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
  const quoted = disposition.match(/filename="([^"]+)"/)
  if (quoted?.[1]) return quoted[1]
  const unquoted = disposition.match(/filename=([^;\s]+)/)
  return unquoted?.[1] ?? null
}
