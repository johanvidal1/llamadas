import { SALES_FUNNEL_STAGES, getResponseOption } from './responseOptions'

export const PIPELINE_SHORT_LABELS: Partial<Record<string, string>> = {
  ESPERA_RESPUESTA: 'Espera resp. final',
  DISCUSION_PROPUESTA: 'Discusión propuesta',
  PROPUESTA_PRESENTADA: 'Propuesta presentada',
}

export const AGENT_PIPELINE_OPERATIONAL = [
  { key: 'PENDING', label: 'Pendientes', bgClass: 'bg-gray-50 border-gray-200 hover:bg-gray-100' },
  {
    key: 'VOLVER_A_LLAMAR',
    label: 'Volver a llamar',
    bgClass: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
    aclaracion: getResponseOption('VOLVER_A_LLAMAR')?.aclaracion ?? '0%',
  },
  { key: 'OTROS', label: 'Otros', bgClass: 'bg-slate-50 border-slate-200 hover:bg-slate-100' },
] as const

export const AGENT_PIPELINE_FUNNEL = SALES_FUNNEL_STAGES.map((stage) => {
  const label = stage.label.charAt(0) + stage.label.slice(1).toLowerCase()
  return {
    key: stage.code,
    label,
    shortLabel: PIPELINE_SHORT_LABELS[stage.code] ?? label,
    aclaracion: stage.aclaracion,
    fullLabel: stage.label,
  }
})
