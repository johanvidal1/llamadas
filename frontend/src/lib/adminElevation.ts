const STORAGE_KEY = 'adminElevation'

export type StoredElevation = {
  token: string
  expiresAt: number
  adminName?: string
  adminEmail?: string
}

export function getStoredElevation(): StoredElevation | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredElevation
    if (!parsed?.token || !parsed?.expiresAt) return null
    if (Date.now() >= parsed.expiresAt) {
      clearStoredElevation()
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function storeElevation(data: StoredElevation): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function clearStoredElevation(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}

export function hasValidElevation(): boolean {
  return getStoredElevation() !== null
}
