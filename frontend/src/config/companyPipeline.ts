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

/** Cola de trabajo only — excludes OTROS (shown in detail). */
export const AGENT_PIPELINE_QUEUE = AGENT_PIPELINE_OPERATIONAL.filter((row) => row.key !== 'OTROS')

export function sumFunnelStages(pipeline: Record<string, number | undefined>): number {
  return AGENT_PIPELINE_FUNNEL.reduce((sum, row) => sum + (pipeline[row.key] ?? 0), 0)
}

export function sumPipelineBarSegments(
  pipeline: Record<string, number | undefined>,
  total: number
): Array<{ key: string; pct: number }> {
  if (total <= 0) return []
  const keys = [
    'PENDING',
    'VOLVER_A_LLAMAR',
    ...AGENT_PIPELINE_FUNNEL.map((row) => row.key),
    'OTROS',
  ]
  return keys
    .map((key) => ({ key, pct: ((pipeline[key] ?? 0) / total) * 100 }))
    .filter((s) => s.pct > 0)
}

export const PIPELINE_FILTER_OPERATIONAL = [
  { value: '', label: 'Todos' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'VOLVER_A_LLAMAR', label: 'Volver a llamar' },
  { value: 'OTROS', label: 'Otros' },
  { value: 'FUNNEL', label: 'En embudo comercial' },
] as const

export const VALID_PIPELINE_FILTERS = new Set([
  'PENDING',
  'VOLVER_A_LLAMAR',
  'OTROS',
  'FUNNEL',
  ...SALES_FUNNEL_STAGES.map((stage) => stage.code),
])

export function getPipelineFilterLabel(filter: string): string | undefined {
  return (
    PIPELINE_FILTER_OPERATIONAL.find((f) => f.value === filter)?.label ??
    AGENT_PIPELINE_FUNNEL.find((f) => f.key === filter)?.label
  )
}

export type BuildClientsUrlOpts = {
  filter?: string
  agentId?: string
  registeredFrom?: string
  registeredTo?: string
  from?: 'reports' | 'dashboard'
}

export function buildClientsUrl(opts?: BuildClientsUrlOpts): string {
  const params = new URLSearchParams()
  if (opts?.filter) params.set('filter', opts.filter)
  if (opts?.agentId) params.set('agentId', opts.agentId)
  if (opts?.registeredFrom) params.set('registeredFrom', opts.registeredFrom)
  if (opts?.registeredTo) params.set('registeredTo', opts.registeredTo)
  if (opts?.from) params.set('from', opts.from)
  const query = params.toString()
  return `/clients${query ? `?${query}` : ''}`
}

export function buildPipelineClientsUrl(
  filter: string,
  opts?: Omit<BuildClientsUrlOpts, 'filter'>
): string {
  return buildClientsUrl({ ...opts, filter })
}
