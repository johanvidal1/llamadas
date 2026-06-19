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

export function getResponseOption(code: string): ResponseOption | undefined {
  return optionByCode.get(code)
}

export function getDispositionLabel(code: string): string {
  const opt = getResponseOption(code)
  if (opt) return opt.label
  if (code in LEGACY_DISPOSITION_LABELS) {
    return LEGACY_DISPOSITION_LABELS[code as LegacyDispositionCode]
  }
  return code
}

export function getAclaracionForDisposition(code: string): string {
  return getResponseOption(code)?.aclaracion ?? ''
}

export const RESPUESTA_SELECT_OPTIONS = [
  { value: '', label: 'NINGUNO' },
  ...RESPONSE_OPTIONS.map((o) => ({ value: o.code, label: o.label })),
]

export const SALES_FUNNEL_STAGES = RESPONSE_OPTIONS.filter((o) => o.progress >= 25)

export const ZERO_PROGRESS_OPTIONS = RESPONSE_OPTIONS.filter((o) => o.progress === 0)

export const OPERATIONAL_SELECT_OPTIONS = [
  { value: '', label: 'NINGUNO' },
  ...ZERO_PROGRESS_OPTIONS.map((o) => ({ value: o.code, label: o.label })),
]

const funnelCodes = new Set<string>(SALES_FUNNEL_STAGES.map((o) => o.code))
const operationalCodes = new Set<string>(ZERO_PROGRESS_OPTIONS.map((o) => o.code))

export function isFunnelDisposition(code: string): boolean {
  return funnelCodes.has(code)
}

export function isOperationalDisposition(code: string): boolean {
  return operationalCodes.has(code)
}

export function isKnownResponseDisposition(code: string): boolean {
  return optionByCode.has(code)
}

const FUNNEL_CHIP_SHORT_LABELS: Partial<Record<ResponseCode, string>> = {
  ESPERA_RESPUESTA: 'Espera resp. final',
  DISCUSION_PROPUESTA: 'Discusión propuesta',
  PROPUESTA_PRESENTADA: 'Propuesta presentada',
}

export function getFunnelChipLabel(stage: ResponseOption): string {
  const short = FUNNEL_CHIP_SHORT_LABELS[stage.code]
  if (short) return short
  return stage.label.charAt(0) + stage.label.slice(1).toLowerCase()
}

export const DISPOSITION_COLORS: Record<string, string> = {
  NO_CONTESTA: 'bg-gray-100 text-gray-700 border-l-gray-300',
  VOLVER_A_LLAMAR: 'bg-blue-100 text-blue-700 border-l-blue-400',
  SIN_LLEGADA_DECISOR: 'bg-slate-100 text-slate-700 border-l-slate-400',
  RUC_SUSPENDIDO: 'bg-orange-100 text-orange-800 border-l-orange-400',
  CLIENTE_ACTUAL: 'bg-cyan-100 text-cyan-800 border-l-cyan-400',
  NO_INTERESADO: 'bg-red-100 text-red-700 border-l-red-400',
  INTERESADO: 'bg-green-100 text-green-700 border-l-green-400',
  PROPUESTA_PRESENTADA: 'bg-green-100 text-green-800 border-l-green-500',
  DISCUSION_PROPUESTA: 'bg-emerald-100 text-emerald-800 border-l-emerald-500',
  ESPERA_RESPUESTA: 'bg-teal-100 text-teal-800 border-l-teal-500',
  VENTA_CERRADA: 'bg-emerald-200 text-emerald-900 border-l-emerald-700',
  INTERESTED: 'bg-green-100 text-green-700 border-l-green-400',
  NOT_INTERESTED: 'bg-red-100 text-red-700 border-l-red-400',
  NO_ANSWER: 'bg-gray-100 text-gray-700 border-l-gray-300',
  BUSY: 'bg-yellow-100 text-yellow-700 border-l-yellow-400',
  CALLBACK: 'bg-blue-100 text-blue-700 border-l-blue-400',
  DO_NOT_CALL: 'bg-red-200 text-red-900 border-l-red-700',
  OTHER: 'bg-purple-100 text-purple-700 border-l-purple-400',
}

export const DISPOSITION_BAR_COLORS: Record<string, string> = {
  NO_CONTESTA: 'bg-gray-400',
  VOLVER_A_LLAMAR: 'bg-blue-400',
  SIN_LLEGADA_DECISOR: 'bg-slate-400',
  RUC_SUSPENDIDO: 'bg-orange-400',
  CLIENTE_ACTUAL: 'bg-cyan-500',
  NO_INTERESADO: 'bg-red-400',
  INTERESADO: 'bg-green-500',
  PROPUESTA_PRESENTADA: 'bg-green-600',
  DISCUSION_PROPUESTA: 'bg-emerald-500',
  ESPERA_RESPUESTA: 'bg-teal-500',
  VENTA_CERRADA: 'bg-emerald-700',
  INTERESTED: 'bg-green-500',
  NOT_INTERESTED: 'bg-red-400',
  NO_ANSWER: 'bg-gray-400',
  BUSY: 'bg-yellow-400',
  CALLBACK: 'bg-blue-400',
  DO_NOT_CALL: 'bg-red-700',
  OTHER: 'bg-purple-400',
}
