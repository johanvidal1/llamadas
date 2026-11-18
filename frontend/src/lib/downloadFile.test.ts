import assert from 'node:assert/strict'
import {
  FILE_IN_USE_TOAST,
  FileInUseError,
  isFileInUseError,
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

function installWindow(picker?: () => Promise<FakeHandle>) {
  fallbackClicks.length = 0
  const g = globalThis as typeof globalThis & {
    window: {
      showSaveFilePicker?: (options: unknown) => Promise<FakeHandle>
      URL: { createObjectURL: (blob: Blob) => string; revokeObjectURL: (url: string) => void }
    }
    document: { createElement: (tag: string) => { href: string; download: string; click: () => void } }
  }
  g.window = {
    showSaveFilePicker: picker,
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

async function main() {
  section('AbortError returns false and stays silent (no fallback download)')
  installWindow(async () => {
    throw new DOMException('The user aborted a request.', 'AbortError')
  })
  assert.equal(await saveBlobWithPicker(blob, 'Propuesta.pdf'), false)
  assert.deepEqual(fallbackClicks, [])

  section('NotAllowedError on createWritable throws FileInUseError without <a download>')
  installWindow(async () => ({
    createWritable: async () => {
      throw new DOMException('Permission denied', 'NotAllowedError')
    },
  }))
  await assert.rejects(
    () => saveBlobWithPicker(blob, 'Propuesta.pdf'),
    (err: unknown) => {
      assert.equal(isFileInUseError(err), true)
      assert.equal(err instanceof FileInUseError, true)
      assert.equal((err as Error).message, FILE_IN_USE_TOAST)
      return true
    }
  )
  assert.deepEqual(fallbackClicks, [])

  section('NoModificationAllowedError on write throws without fallback')
  installWindow(async () => ({
    createWritable: async () => ({
      write: async () => {
        throw new DOMException('No modification allowed', 'NoModificationAllowedError')
      },
      close: async () => undefined,
    }),
  }))
  await assert.rejects(() => saveBlobWithPicker(blob, 'Propuesta.pdf'), (err: unknown) => isFileInUseError(err))
  assert.deepEqual(fallbackClicks, [])

  section('successful picker write returns true')
  let wrote = false
  installWindow(async () => ({
    createWritable: async () => ({
      write: async () => {
        wrote = true
      },
      close: async () => undefined,
    }),
  }))
  assert.equal(await saveBlobWithPicker(blob, 'Propuesta.pdf'), true)
  assert.equal(wrote, true)
  assert.deepEqual(fallbackClicks, [])

  console.log('\ndownloadFile smoke test ok')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
