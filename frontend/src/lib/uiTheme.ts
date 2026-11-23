/**
 * The Clásico/Nuevo selector was removed: every user gets the classic UI.
 * The Nuevo skin code (CSS `[data-ui=new]`, MyLeads/Dashboard branches) stays dormant.
 */
export const UI_THEME_STORAGE_KEY = 'optickUiTheme'

export type UiTheme = 'classic' | 'new'

/** Always classic; any stored `new` is ignored. */
export function readUiTheme(): UiTheme {
  return 'classic'
}

export function applyUiTheme(theme: UiTheme = 'classic') {
  document.documentElement.setAttribute('data-ui', theme)
}

/** Best-effort removal of the stale preference key (silent migration to Clásico). */
export function clearLegacyUiTheme(storage?: Pick<Storage, 'removeItem'>) {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
    s?.removeItem(UI_THEME_STORAGE_KEY)
  } catch {
    // Storage can be blocked; nothing to clean.
  }
}

/** Run once on load: drop stale key and force `data-ui="classic"`. */
export function bootClassicUi() {
  clearLegacyUiTheme()
  applyUiTheme('classic')
}

/** Kept for API compatibility; the setter is a no-op and the theme is always classic. */
export function useUiTheme(): [UiTheme, (theme: UiTheme) => void] {
  return ['classic', () => {}]
}
