import { useEffect, useState } from 'react'

export const UI_THEME_STORAGE_KEY = 'optickUiTheme'

export type UiTheme = 'classic' | 'new'

export function readUiTheme(): UiTheme {
  try {
    return localStorage.getItem(UI_THEME_STORAGE_KEY) === 'new' ? 'new' : 'classic'
  } catch {
    return 'classic'
  }
}

export function applyUiTheme(theme: UiTheme) {
  document.documentElement.setAttribute('data-ui', theme)
}

export function writeUiTheme(theme: UiTheme) {
  try {
    localStorage.setItem(UI_THEME_STORAGE_KEY, theme)
  } catch {
    // Storage can be blocked; the attribute still applies for this document.
  }
  applyUiTheme(theme)
  window.dispatchEvent(new CustomEvent('optick-ui-theme-change'))
}

export function useUiTheme(): [UiTheme, (theme: UiTheme) => void] {
  const [theme, setTheme] = useState<UiTheme>(() => readUiTheme())

  useEffect(() => {
    const sync = () => setTheme(readUiTheme())
    const onStorage = (event: StorageEvent) => {
      if (event.key === UI_THEME_STORAGE_KEY) sync()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('optick-ui-theme-change', sync)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('optick-ui-theme-change', sync)
    }
  }, [])

  const setUiTheme = (next: UiTheme) => {
    writeUiTheme(next)
    setTheme(next)
  }

  return [theme, setUiTheme]
}
