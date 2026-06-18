export type ResponseCode =
  | 'NO_CONTESTA'
  | 'VOLVER_A_LLAMAR'
  | 'SIN_LLEGADA_DECISOR'
  | 'RUC_SUSPENDIDO'
  | 'CLIENTE_ACTUAL'
  | 'NO_INTERESADO'
  | 'INTERESADO'
  | 'PROPUESTA_PRESENTADA'
  | 'DISCUSION_PROPUESTA'
  | 'ESPERA_RESPUESTA'
  | 'VENTA_CERRADA'

export type LegacyDispositionCode =
  | 'INTERESTED'
  | 'NOT_INTERESTED'
  | 'NO_ANSWER'
  | 'BUSY'
  | 'CALLBACK'
  | 'DO_NOT_CALL'
  | 'OTHER'

export type DispositionCode = ResponseCode | LegacyDispositionCode

export interface ResponseOption {
  code: ResponseCode
  label: string
  aclaracion: string
  progress: number
  contactStatus: string
  requiresCallback?: boolean
  disableAgendar?: boolean
}

export const RESPONSE_OPTIONS: ResponseOption[] = [
  { code: 'NO_CONTESTA', label: 'NO CONTESTA', aclaracion: '0%', progress: 0, contactStatus: 'IN_PROGRESS' },
  { code: 'VOLVER_A_LLAMAR', label: 'VOLVER A LLAMAR', aclaracion: '0%', progress: 0, contactStatus: 'IN_PROGRESS', requiresCallback: true },
  { code: 'SIN_LLEGADA_DECISOR', label: 'SIN LLEGADA AL DECISOR', aclaracion: '0%', progress: 0, contactStatus: 'IN_PROGRESS' },
  { code: 'RUC_SUSPENDIDO', label: 'RUC SUSPENDIDO / NO HABIDO', aclaracion: '0%', progress: 0, contactStatus: 'IN_PROGRESS' },
  { code: 'CLIENTE_ACTUAL', label: 'CLIENTE ACTUAL', aclaracion: '0%', progress: 0, contactStatus: 'IN_PROGRESS' },
  { code: 'NO_INTERESADO', label: 'NO INTERESADO', aclaracion: '0%', progress: 0, contactStatus: 'NOT_INTERESTED', disableAgendar: true },
  { code: 'INTERESADO', label: 'INTERESADO', aclaracion: '25%', progress: 25, contactStatus: 'INTERESTED' },
  { code: 'PROPUESTA_PRESENTADA', label: 'PROPUESTA PRESENTADA', aclaracion: '50%', progress: 50, contactStatus: 'INTERESTED' },
  { code: 'DISCUSION_PROPUESTA', label: 'DISCUSIÓN DE PROPUESTA', aclaracion: '75%', progress: 75, contactStatus: 'INTERESTED' },
  { code: 'ESPERA_RESPUESTA', label: 'A LA ESPERA DE RESPUESTA FINAL', aclaracion: '90%', progress: 90, contactStatus: 'INTERESTED' },
  { code: 'VENTA_CERRADA', label: 'VENTA CERRADA', aclaracion: '100%', progress: 100, contactStatus: 'CONVERTED', disableAgendar: true },
]

export const LEGACY_DISPOSITION_LABELS: Record<LegacyDispositionCode, string> = {
  INTERESTED: 'Interesado (legacy)',
  NOT_INTERESTED: 'No interesado (legacy)',
  NO_ANSWER: 'Sin respuesta (legacy)',
  BUSY: 'Ocupado (legacy)',
  CALLBACK: 'Callback agendado (legacy)',
  DO_NOT_CALL: 'No llamar (legacy)',
  OTHER: 'Otro (legacy)',
}

const optionByCode = new Map<string, ResponseOption>(
  RESPONSE_OPTIONS.map((o) => [o.code, o])
)

const ALL_VALID_CODES = new Set<string>([
  ...RESPONSE_OPTIONS.map((o) => o.code),
  ...Object.keys(LEGACY_DISPOSITION_LABELS),
])

export function getResponseOption(code: string): ResponseOption | undefined {
  return optionByCode.get(code)
}

export function getAclaracionForDisposition(code: string): string | undefined {
  const opt = getResponseOption(code)
  if (opt) return opt.aclaracion
  return undefined
}

export function isValidDisposition(code: string): boolean {
  return ALL_VALID_CODES.has(code)
}

export function getDispositionLabel(code: string): string {
  const opt = getResponseOption(code)
  if (opt) return opt.label
  if (code in LEGACY_DISPOSITION_LABELS) {
    return LEGACY_DISPOSITION_LABELS[code as LegacyDispositionCode]
  }
  return code
}

export const RESPONSE_CODES = RESPONSE_OPTIONS.map((o) => o.code) as ResponseCode[]

export const LEGACY_DISPOSITION_CODES = Object.keys(LEGACY_DISPOSITION_LABELS) as LegacyDispositionCode[]

export const ALL_DISPOSITION_CODES = [...RESPONSE_CODES, ...LEGACY_DISPOSITION_CODES] as DispositionCode[]

/** Dispositions mapped to INTERESTED contact status (new + legacy). */
export const INTERESTED_DISPOSITIONS = [
  'INTERESADO',
  'PROPUESTA_PRESENTADA',
  'DISCUSION_PROPUESTA',
  'ESPERA_RESPUESTA',
  'INTERESTED',
] as const

/** Dispositions that require scheduling a callback (new + legacy). */
export const CALLBACK_DISPOSITIONS = ['VOLVER_A_LLAMAR', 'CALLBACK'] as const
