/** Same storage style as Contact.telefono (strip spaces and a leading +51). */
export function normalizePhone(raw: string): string {
  return raw.replace(/\s+/g, '').replace(/^\+51/, '').trim()
}

/**
 * Peru cellphone only: 9XXXXXXXX, 51 9XXXXXXXX, +51 9XXXXXXXX.
 * Discards empty, "Sin asset asociado", landline, IMEI, account, malformed length.
 */
export function peruMobileDigits(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (/^9\d{8}$/.test(digits)) return digits
  if (/^51[9]\d{8}$/.test(digits)) return digits.slice(2)
  return null
}

export function isPeruCellphone(raw: string | null | undefined): boolean {
  return peruMobileDigits(raw) != null
}

/** Same mobile after stripping country code / punctuation. */
export function samePeruMobile(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = peruMobileDigits(a)
  const right = peruMobileDigits(b)
  return left != null && right != null && left === right
}

/**
 * Distinct second mobile for Contact.telefono2.
 * Keeps primary telefono untouched; returns undefined when not a Peru cellphone
 * or when it equals Teléfono 1.
 */
export function asDistinctPeruMobile(
  raw: string | null | undefined,
  primaryPhone?: string | null
): string | undefined {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return undefined
  const mobile = peruMobileDigits(trimmed)
  if (!mobile) return undefined
  if (samePeruMobile(trimmed, primaryPhone)) return undefined
  return normalizePhone(trimmed)
}

/** Entel Contactos style when original asset_asociado is blank. */
export function formatAssetAsociadoFromTelefono2(raw: string | null | undefined): string {
  const mobile = peruMobileDigits(raw)
  if (!mobile) return ''
  return `51${mobile}`
}
