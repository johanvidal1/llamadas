import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'

export type ChartFilterMode = 'day' | 'week' | 'month' | 'custom'

export type ReportsUrlParams = {
  agentId?: string
  chartMode?: ChartFilterMode
  chartAnchor?: string
  chartFrom?: string
  chartTo?: string
}

export type ReportsInitialState = {
  filterAgentId: string
  chartMode: ChartFilterMode
  chartAnchor: string
  chartCustomFrom: string
  chartCustomTo: string
}

const VALID_CHART_MODES = new Set<ChartFilterMode>(['day', 'week', 'month', 'custom'])

export function chartTodayLocal(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function parseChartMode(value: string | null): ChartFilterMode {
  if (value && VALID_CHART_MODES.has(value as ChartFilterMode)) {
    return value as ChartFilterMode
  }
  return 'day'
}

function weekRangeForDate(dateStr: string): { from: string; to: string } {
  const d = new Date(dateStr + 'T12:00:00')
  return {
    from: format(startOfWeek(d, { locale: es }), 'yyyy-MM-dd'),
    to: format(endOfWeek(d, { locale: es }), 'yyyy-MM-dd'),
  }
}

function monthRangeForDate(dateStr: string): { from: string; to: string } {
  const d = new Date(dateStr + 'T12:00:00')
  return {
    from: format(startOfMonth(d), 'yyyy-MM-dd'),
    to: format(endOfMonth(d), 'yyyy-MM-dd'),
  }
}

export function buildReportsSearchParams(opts?: ReportsUrlParams): URLSearchParams {
  const today = chartTodayLocal()
  const params = new URLSearchParams()

  if (opts?.agentId) {
    params.set('agentId', opts.agentId)
  }

  const mode = opts?.chartMode ?? 'day'
  const anchor = opts?.chartAnchor ?? today

  if (mode === 'custom') {
    const from = opts?.chartFrom ?? today
    const to = opts?.chartTo ?? from
    params.set('chartMode', 'custom')
    params.set('chartFrom', from)
    params.set('chartTo', to)
  } else if (mode === 'day') {
    if (anchor !== today) {
      params.set('chartMode', 'day')
      params.set('chartAnchor', anchor)
    }
  } else {
    params.set('chartMode', mode)
    params.set('chartAnchor', anchor)
  }

  return params
}

export function buildReportsUrl(opts?: ReportsUrlParams): string {
  const query = buildReportsSearchParams(opts).toString()
  return `/reports${query ? `?${query}` : ''}`
}

export function parseReportsSearchParams(searchParams: URLSearchParams): ReportsInitialState {
  const today = chartTodayLocal()
  const chartMode = parseChartMode(searchParams.get('chartMode'))
  const chartAnchor = searchParams.get('chartAnchor') ?? today
  const chartFrom = searchParams.get('chartFrom') ?? today
  const chartTo = searchParams.get('chartTo') ?? today

  return {
    filterAgentId: searchParams.get('agentId') ?? '',
    chartMode,
    chartAnchor,
    chartCustomFrom: chartMode === 'custom' ? chartFrom : today,
    chartCustomTo: chartMode === 'custom' ? chartTo : today,
  }
}

export function reportsStateToUrlParams(state: {
  filterAgentId: string
  chartMode: ChartFilterMode
  chartAnchor: string
  chartCustomFrom: string
  chartCustomTo: string
}): ReportsUrlParams {
  return {
    agentId: state.filterAgentId || undefined,
    chartMode: state.chartMode,
    chartAnchor: state.chartAnchor,
    chartFrom: state.chartMode === 'custom' ? state.chartCustomFrom : undefined,
    chartTo: state.chartMode === 'custom' ? state.chartCustomTo : undefined,
  }
}

function reportsSearchParamsEqual(a: URLSearchParams, b: URLSearchParams): boolean {
  const keysA = [...a.keys()].sort()
  const keysB = [...b.keys()].sort()
  if (keysA.length !== keysB.length) return false
  return keysA.every((key) => a.get(key) === b.get(key))
}

export function syncReportsSearchParams(
  current: URLSearchParams,
  state: {
    filterAgentId: string
    chartMode: ChartFilterMode
    chartAnchor: string
    chartCustomFrom: string
    chartCustomTo: string
  }
): URLSearchParams | null {
  const next = buildReportsSearchParams(reportsStateToUrlParams(state))
  return reportsSearchParamsEqual(current, next) ? null : next
}

export function buildReportsUrlFromClientsContext(opts: {
  agentId?: string
  registeredFrom?: string
  registeredTo?: string
}): string {
  const from = opts.registeredFrom ?? ''
  const to = opts.registeredTo ?? opts.registeredFrom ?? ''

  if (!from && !to) {
    return buildReportsUrl({ agentId: opts.agentId })
  }

  const effectiveFrom = from || to
  const effectiveTo = to || from

  if (effectiveFrom === effectiveTo) {
    return buildReportsUrl({
      agentId: opts.agentId,
      chartMode: 'day',
      chartAnchor: effectiveFrom,
    })
  }

  for (const anchor of [effectiveFrom, effectiveTo]) {
    const week = weekRangeForDate(anchor)
    if (week.from === effectiveFrom && week.to === effectiveTo) {
      return buildReportsUrl({
        agentId: opts.agentId,
        chartMode: 'week',
        chartAnchor: anchor,
      })
    }
  }

  for (const anchor of [effectiveFrom, effectiveTo]) {
    const month = monthRangeForDate(anchor)
    if (month.from === effectiveFrom && month.to === effectiveTo) {
      return buildReportsUrl({
        agentId: opts.agentId,
        chartMode: 'month',
        chartAnchor: anchor,
      })
    }
  }

  return buildReportsUrl({
    agentId: opts.agentId,
    chartMode: 'custom',
    chartFrom: effectiveFrom,
    chartTo: effectiveTo,
  })
}
