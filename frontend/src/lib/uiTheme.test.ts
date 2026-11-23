import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  UI_THEME_STORAGE_KEY,
  clearLegacyUiTheme,
  readUiTheme,
  useUiTheme,
} from './uiTheme.ts'

function section(name: string) {
  console.log(`\n• ${name}`)
}

section('readUiTheme ignores a stored "new"')
{
  const store = new Map<string, string>([[UI_THEME_STORAGE_KEY, 'new']])
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    removeItem: (k: string) => void store.delete(k),
  }
  assert.equal(readUiTheme(), 'classic')
  console.log('  ✓ classic with storage=new')

  clearLegacyUiTheme()
  assert.equal(store.has(UI_THEME_STORAGE_KEY), false)
  assert.equal(readUiTheme(), 'classic')
  console.log('  ✓ stale key removed')
  delete (globalThis as { localStorage?: unknown }).localStorage
}

section('clearLegacyUiTheme never throws')
{
  clearLegacyUiTheme({
    removeItem: () => {
      throw new Error('blocked')
    },
  })
  console.log('  ✓ storage errors swallowed')
}

section('useUiTheme API is a classic-only no-op')
{
  // Not a hook call in React context: the implementation has no hooks.
  const [theme, setTheme] = useUiTheme()
  assert.equal(theme, 'classic')
  setTheme('new')
  assert.equal(readUiTheme(), 'classic')
  console.log('  ✓ setter is a no-op')
}

section('User avatar menu has no Interfaz block')
{
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(here, '..', 'components', 'UserAvatarMenu.tsx'), 'utf8')
  assert.equal(/aria-label="Interfaz"/.test(src), false)
  assert.equal(/Nuevo|Clásico|useUiTheme/.test(src), false)
  console.log('  ✓ menu source has no selector')
}

console.log('\nuiTheme tests passed')
