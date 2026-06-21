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

export function dedupeParsedMobileLines<T extends { ruc: string; numeroTelefono?: string | null }>(
  lines: T[]
): T[] {
  const seen = new Set<string>()
  return lines.filter((line) => {
    const digits = mobileDigits(line.numeroTelefono)
    if (digits.length < 9) return false
    const key = `${line.ruc}:${digits}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
