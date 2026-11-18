import assert from 'node:assert/strict'
import {
  FILE_IN_USE_TOAST,
  FileInUseError,
  isFileInUseError,
  MAX_LOCKED_FILE_RETRIES,
  saveBlobWithPicker,
} from './downloadFile.ts'

function section(name: string) {
  console.log(`\n• ${name}`)
}

type FakeHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>
    close: () => Promise<void>
  }>
}

const fallbackClicks: string[] = []
const pickerSuggestedNames: string[] = []

function installWindow(picker?: (options: { suggestedName: string }) => Promise<FakeHandle>) {
  fallbackClicks.length = 0
  pickerSuggestedNames.length = 0
  const g = globalThis as typeof globalThis & {
    window: {
      showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FakeHandle>
      URL: { createObjectURL: (blob: Blob) => string; revokeObjectURL: (url: string) => void }
    }
    document: { createElement: (tag: string) => { href: string; download: string; click: () => void } }
  }
  g.window = {
    showSaveFilePicker: picker
      ? async (options) => {
          pickerSuggestedNames.push(options.suggestedName)
          return picker(options)
        }
      : undefined,
    URL: {
      createObjectURL: () => 'blob:mock',
      revokeObjectURL: () => undefined,
    },
  }
  g.document = {
    createElement: () => {
      const el = {
        href: '',
        download: '',
        click: () => {
          fallbackClicks.push(el.download)
        },
      }
      return el
    },
  }
}

const blob = new Blob(['pdf'], { type: 'application/pdf' })

function lockedHandle(): FakeHandle {
  return {
    createWritable: async () => {
      throw new DOMException('Permission denied', 'NotAllowedError')
    },
  }
}

function writeFailHandle(): FakeHandle {
  return {
    createWritable: async () => ({
      write: async () => {
        throw new DOMException('No modification allowed', 'NoModificationAllowedError')
      },
      close: async () => undefined,
    }),
  }
}

function okHandle(onWrite?: () => void): FakeHandle {
  return {
    createWritable: async () => ({
      write: async () => {
        onWrite?.()
      },
      close: async () => undefined,
    }),
  }
}

async function main() {
  section('AbortError returns false and stays silent (no fallback download)')
  installWindow(async () => {
    throw new DOMException('The user aborted a request.', 'AbortError')
  })
  const abortLocked: string[] = []
  assert.equal(
    await saveBlobWithPicker(blob, 'Propuesta.pdf', { onLocked: (msg) => abortLocked.push(msg) }),
    false
  )
  assert.deepEqual(fallbackClicks, [])
  assert.deepEqual(abortLocked, [])

  section('NotAllowedError on createWritable does not fall through to <a download>')
  const lockedToasts: string[] = []
  installWindow(async () => lockedHandle())
  assert.equal(
    await saveBlobWithPicker(blob, 'Propuesta.pdf', { onLocked: (msg) => lockedToasts.push(msg) }),
    false
  )
  assert.equal(lockedToasts.length, MAX_LOCKED_FILE_RETRIES)
  assert.ok(lockedToasts.every((msg) => msg === FILE_IN_USE_TOAST))
  assert.equal(pickerSuggestedNames.length, MAX_LOCKED_FILE_RETRIES)
  assert.ok(pickerSuggestedNames.every((name) => name === 'Propuesta.pdf'))
  assert.deepEqual(fallbackClicks, [])

  section('NoModificationAllowedError on write does not fall through')
  const writeLocked: string[] = []
  installWindow(async () => writeFailHandle())
  assert.equal(
    await saveBlobWithPicker(blob, 'Propuesta.pdf', { onLocked: (msg) => writeLocked.push(msg) }),
    false
  )
  assert.equal(writeLocked.length, MAX_LOCKED_FILE_RETRIES)
  assert.deepEqual(fallbackClicks, [])

  section('first writable fails locked, second picker succeeds → true')
  let pickerCalls = 0
  let wrote = false
  const retryToasts: string[] = []
  installWindow(async () => {
    pickerCalls += 1
    if (pickerCalls === 1) return lockedHandle()
    return okHandle(() => {
      wrote = true
    })
  })
  assert.equal(
    await saveBlobWithPicker(blob, 'Propuesta.pdf', { onLocked: (msg) => retryToasts.push(msg) }),
    true
  )
  assert.equal(pickerCalls, 2)
  assert.deepEqual(retryToasts, [FILE_IN_USE_TOAST])
  assert.equal(wrote, true)
  assert.deepEqual(pickerSuggestedNames, ['Propuesta.pdf', 'Propuesta.pdf'])
  assert.deepEqual(fallbackClicks, [])

  section('cancel after lock → false no extra throw')
  let cancelCalls = 0
  const cancelToasts: string[] = []
  installWindow(async () => {
    cancelCalls += 1
    if (cancelCalls === 1) return lockedHandle()
    throw new DOMException('The user aborted a request.', 'AbortError')
  })
  const result = await saveBlobWithPicker(blob, 'Propuesta.pdf', {
    onLocked: (msg) => cancelToasts.push(msg),
  })
  assert.equal(result, false)
  assert.equal(cancelCalls, 2)
  assert.deepEqual(cancelToasts, [FILE_IN_USE_TOAST])
  assert.deepEqual(fallbackClicks, [])

  section('successful picker write returns true')
  let wroteOk = false
  installWindow(async () =>
    okHandle(() => {
      wroteOk = true
    })
  )
  assert.equal(await saveBlobWithPicker(blob, 'Propuesta.pdf'), true)
  assert.equal(wroteOk, true)
  assert.deepEqual(fallbackClicks, [])

  section('FileInUseError helpers still identify the Spanish message')
  const fileErr = new FileInUseError()
  assert.equal(isFileInUseError(fileErr), true)
  assert.equal(fileErr.message, FILE_IN_USE_TOAST)

  console.log('\ndownloadFile smoke test ok')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
