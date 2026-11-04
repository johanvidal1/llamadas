export function mobileDigits(numero?: string | null): string {
  return (numero ?? '').replace(/\D/g, '')
}

/** Peru cellphone only: 9XXXXXXXX, 51 9XXXXXXXX, +51 9XXXXXXXX. */
export function peruMobileDigits(raw?: string | null): string | null {
  const digits = mobileDigits(raw)
  if (/^9\d{8}$/.test(digits)) return digits
  if (/^51[9]\d{8}$/.test(digits)) return digits.slice(2)
  return null
}

export function isDisplayableTelefono2(raw?: string | null): boolean {
  return peruMobileDigits(raw) != null
}

export function isValidMobileLineNumber(numero?: string | null): boolean {
  return mobileDigits(numero).length >= 9
}

export function dedupeMobileLinesByNumber<T extends { numeroTelefono?: string | null }>(lines: T[]): T[] {
  const seen = new Set<string>()
  return lines.filter((line) => {
    const key = mobileDigits(line.numeroTelefono)
    if (key.length < 9) return false
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
