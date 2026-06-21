export function mobileDigits(numero?: string | null): string {
  return (numero ?? '').replace(/\D/g, '')
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
