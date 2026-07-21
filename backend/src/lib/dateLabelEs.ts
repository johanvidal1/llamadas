const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

/** Spanish long-form label from ISO date YYYY-MM-DD (e.g. "21 de julio de 2026"). */
export function dateLabelEs(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) throw new Error(`Fecha inválida: ${isoDate} (usa YYYY-MM-DD)`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Fecha inválida: ${isoDate}`)
  }
  return `${day} de ${MONTHS_ES[month - 1]} de ${year}`
}
