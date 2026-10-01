export type BatchQueueMode = 'FIFO' | 'LIFO' | 'ALL'

export const DEFAULT_BATCH_QUEUE_MODE: BatchQueueMode = 'FIFO'

export type QueueBatchInput = {
  id: string
  createdAt: string
  pending: number
}

export type WorkingBatchUserPins = {
  workingBatchId?: string | null
  workingBatchIdEntel?: string | null
  workingBatchIdMovistar?: string | null
}

/** Pin for the operator currently on Mis clientes. Never mixes Entel/Movistar. */
export function workingBatchIdForOperator(
  operator: string | null | undefined,
  user: WorkingBatchUserPins | null | undefined
): string | null {
  if (!operator || !user) return null
  if (operator === 'MOVISTAR') return user.workingBatchIdMovistar ?? null
  return user.workingBatchIdEntel ?? user.workingBatchId ?? null
}

/**
 * Immediate lote after Entel↔Movistar switch.
 * ALL → Todos (`''`). FIFO/LIFO restore that operator's pin — never clear to empty
 * first when a pin exists. Hydration FIFO-advances later if the lote has 0 pending,
 * once my-batches + pending counts are ready.
 */
export function batchIdAfterOperatorSwitch(opts: {
  mode: BatchQueueMode
  workingBatchId: string | null | undefined
}): string {
  if (opts.mode === 'ALL') return ''
  return opts.workingBatchId ?? ''
}

/**
 * `?batchId=` / `?companyId=` win on landing (Dashboard / command palette).
 * After an Entel↔Movistar switch they do not: leftover URL from the other
 * operator is not a deep link and must not skip pin restore / FIFO hydrate.
 */
export function shouldHonorQueueDeepLink(opts: {
  hasBatchOrCompanyDeepLink: boolean
  operatorSwitch: boolean
}): boolean {
  if (opts.operatorSwitch) return false
  return opts.hasBatchOrCompanyDeepLink
}

export function parseBatchQueueMode(value: unknown): BatchQueueMode {
  if (value === 'LIFO' || value === 'ALL' || value === 'FIFO') return value
  return DEFAULT_BATCH_QUEUE_MODE
}

function sortByCreatedAt(batches: QueueBatchInput[], direction: 'asc' | 'desc') {
  return [...batches].sort((a, b) => {
    const da = new Date(a.createdAt).getTime()
    const db = new Date(b.createdAt).getTime()
    return direction === 'asc' ? da - db : db - da
  })
}

/** Next lote with pendientes: FIFO = oldest, LIFO = newest. ALL / none → `''`. */
export function pickNextBatchByPolicy(
  mode: BatchQueueMode,
  batches: QueueBatchInput[]
): string {
  if (mode === 'ALL') return ''
  const withPending = batches.filter((b) => b.pending > 0)
  if (withPending.length === 0) return ''
  const ordered = sortByCreatedAt(withPending, mode === 'LIFO' ? 'desc' : 'asc')
  return ordered[0]?.id ?? ''
}

/**
 * Restore pin if that lote still has first-touch pendientes; otherwise advance.
 * ALL always returns empty (Todos los lotes). Does not steal focus onto a newer lote
 * while the current pin still has pending work.
 */
export function resolveWorkingBatchId(opts: {
  mode: BatchQueueMode
  workingBatchId: string | null | undefined
  batches: QueueBatchInput[]
}): string {
  const { mode, workingBatchId, batches } = opts
  if (mode === 'ALL') return ''
  if (workingBatchId) {
    const current = batches.find((b) => b.id === workingBatchId)
    if (current && current.pending > 0) return current.id
  }
  return pickNextBatchByPolicy(mode, batches)
}

export function shouldAutoAdvancePinnedBatch(opts: {
  mode: BatchQueueMode
  selectedBatchId: string
  workingBatchId: string | null | undefined
  batches: QueueBatchInput[]
}): boolean {
  const { mode, selectedBatchId, workingBatchId, batches } = opts
  if (mode === 'ALL') return false
  if (!selectedBatchId) return false
  if (selectedBatchId !== (workingBatchId ?? '')) return false
  const current = batches.find((b) => b.id === selectedBatchId)
  return !current || current.pending <= 0
}

/**
 * FIFO/LIFO must wait until pending counts exist; otherwise every lote looks empty
 * and hydration pins "Todos los lotes" / persists null. ALL can pin Todos as soon
 * as the lote list is known.
 */
export function canHydrateBatchQueue(opts: {
  mode: BatchQueueMode
  batchListReady: boolean
  pendingCountsReady: boolean
}): boolean {
  if (!opts.batchListReady) return false
  if (opts.mode === 'ALL') return true
  return opts.pendingCountsReady
}

/**
 * First hydration must not persist workingBatchId=null while pending counts are still
 * unknown (all zeros from unloaded clients). A real empty queue (counts loaded) may persist null.
 */
export function canPersistHydratedWorkingBatch(opts: {
  mode: BatchQueueMode
  resolvedBatchId: string
  pendingCountsReady: boolean
}): boolean {
  if (opts.mode === 'ALL') return false
  if (opts.resolvedBatchId) return true
  return opts.pendingCountsReady
}

/**
 * After a premature Todos hydration (selected ''), re-resolve when real pendientes appear.
 * Explicit Todos and URL deep links must keep winning.
 */
export function shouldRehydrateEmptyTodos(opts: {
  mode: BatchQueueMode
  selectedBatchId: string
  explicitTodos: boolean
  deepLinkWins: boolean
  pendingCountsReady: boolean
  resolvedBatchId: string
}): boolean {
  if (opts.deepLinkWins || opts.explicitTodos) return false
  if (opts.mode === 'ALL') return false
  if (!opts.pendingCountsReady) return false
  if (opts.selectedBatchId) return false
  return Boolean(opts.resolvedBatchId)
}

/**
 * Stale selectedBatchId (other operator's lote still in state/URL) must re-resolve
 * once this operator's batch list is known. Deep links and explicit Todos keep winning.
 */
export function shouldRehydrateUnknownBatch(opts: {
  mode: BatchQueueMode
  selectedBatchId: string
  batchIds: string[]
  batchListReady: boolean
  deepLinkWins: boolean
  explicitTodos: boolean
}): boolean {
  if (opts.deepLinkWins || opts.explicitTodos) return false
  if (opts.mode === 'ALL') return false
  if (!opts.selectedBatchId || !opts.batchListReady) return false
  return !opts.batchIds.includes(opts.selectedBatchId)
}
