import { getResponseOption } from '../config/responseOptions'

/** Closures the quote download must not replace in the open call form. */
const QUOTE_STAGE_CLOSURES = new Set([
  'NO_INTERESADO',
  'NOT_INTERESTED',
  'DO_NOT_CALL',
  'CLIENTE_ACTUAL',
  'RUC_SUSPENDIDO',
])

/**
 * True when Descargar y registrar may preselect PROPUESTA_PRESENTADA.
 * Only dispositions below 50% move: empty / pendiente, INTERESADO, and
 * operational 0% that are not closures. Higher funnel stages stay put.
 */
export function shouldAdvanceToPropuestaPresentada(disposition: string): boolean {
  const code = disposition.trim()
  if (!code) return true
  if (QUOTE_STAGE_CLOSURES.has(code)) return false
  if (
    code === 'PROPUESTA_PRESENTADA' ||
    code === 'DISCUSION_PROPUESTA' ||
    code === 'ESPERA_RESPUESTA' ||
    code === 'VENTA_CERRADA'
  ) {
    return false
  }
  const option = getResponseOption(code)
  if (option) return option.progress < 50
  return code === 'INTERESTED' || code === 'NO_ANSWER' || code === 'BUSY' || code === 'CALLBACK' || code === 'OTHER'
}
