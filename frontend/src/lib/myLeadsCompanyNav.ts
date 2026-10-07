/** Queue row used to pick the next empresa after Guardar y siguiente. */
export type CompanyNavItem = {
  id: string
  ruc?: string | null
  hasAgentLog?: boolean
  callLogCount?: number
  _count?: { callLogs?: number }
  contacts?: { _count?: { callLogs?: number } }[]
}

function normalizeRuc(ruc: string | null | undefined): string {
  return (ruc ?? '').trim()
}

/** True when the list row already has an agent call log (company or any contact). */
export function companySummaryHasAgentLog(company: CompanyNavItem): boolean {
  if (typeof company.hasAgentLog === 'boolean') return company.hasAgentLog
  if ((company.callLogCount ?? 0) > 0) return true
  if ((company._count?.callLogs ?? 0) > 0) return true
  return (company.contacts ?? []).some((ct) => (ct._count?.callLogs ?? 0) > 0)
}

/**
 * Index of the next distinct company after `currentId`.
 * Skips the same id and the same RUC so contact-looking duplicates cannot count as “next empresa”.
 * Returns -1 when current is missing or already last distinct RUC.
 */
export function nextCompanyIndexAfter(
  list: readonly CompanyNavItem[],
  currentId: string
): number {
  if (!currentId) return -1
  const from = list.findIndex((c) => c.id === currentId)
  if (from < 0) return -1
  const currentRuc = normalizeRuc(list[from]?.ruc)
  for (let i = from + 1; i < list.length; i++) {
    const item = list[i]
    if (!item || item.id === currentId) continue
    const ruc = normalizeRuc(item.ruc)
    if (currentRuc && ruc && ruc === currentRuc) continue
    return i
  }
  return -1
}

/**
 * Index of the next distinct company after `currentId` that is still pending (`isPending`).
 * Same id/RUC skip as `nextCompanyIndexAfter`. Returns -1 when none remain.
 */
export function nextPendingCompanyIndexAfter(
  list: readonly CompanyNavItem[],
  currentId: string,
  isPending: (item: CompanyNavItem, index: number) => boolean
): number {
  if (!currentId) return -1
  const from = list.findIndex((c) => c.id === currentId)
  if (from < 0) return -1
  const currentRuc = normalizeRuc(list[from]?.ruc)
  for (let i = from + 1; i < list.length; i++) {
    const item = list[i]
    if (!item || item.id === currentId) continue
    const ruc = normalizeRuc(item.ruc)
    if (currentRuc && ruc && ruc === currentRuc) continue
    if (isPending(item, i)) return i
  }
  return -1
}

export function nextCompanyIdAfter(
  list: readonly CompanyNavItem[],
  currentId: string
): string | null {
  const idx = nextCompanyIndexAfter(list, currentId)
  return idx >= 0 ? list[idx]!.id : null
}

export function nextPendingCompanyIdAfter(
  list: readonly CompanyNavItem[],
  currentId: string,
  isPending: (item: CompanyNavItem, index: number) => boolean
): string | null {
  const idx = nextPendingCompanyIndexAfter(list, currentId, isPending)
  return idx >= 0 ? list[idx]!.id : null
}

/** Look up the post-refetch index of a company id. -1 if it left the visible queue. */
export function companyIndexById(
  list: readonly { id: string }[],
  companyId: string
): number {
  if (!companyId) return -1
  return list.findIndex((c) => c.id === companyId)
}

export type OpenDetailFromListPlan<T extends { id: string }> =
  | { kind: 'inQueue'; companyId: string }
  | { kind: 'outsideQueue'; company: T }

/**
 * Lista row click: always open that company by id, never a leftover Detalle index.
 * If it is not in the working cola (depurado / archived), pin it for Fuera de la cola.
 */
export function resolveOpenDetailFromList<T extends { id: string }>(
  company: T,
  visibleNav: readonly { id: string }[]
): OpenDetailFromListPlan<T> {
  if (visibleNav.some((c) => c.id === company.id)) {
    return { kind: 'inQueue', companyId: company.id }
  }
  return { kind: 'outsideQueue', company }
}

export type IndexForCompanyIdPlan =
  | { kind: 'inQueue'; index: number }
  | { kind: 'pinOutside'; index: number }
  | { kind: 'missing' }

/**
 * After cola refresh, re-resolve the clicked/saved company by id.
 * pinOutside.index is visibleNav.length (append slot once pinned).
 */
export function resolveIndexForCompanyId(
  companyId: string,
  visibleNav: readonly { id: string }[]
): IndexForCompanyIdPlan {
  if (!companyId) return { kind: 'missing' }
  const index = companyIndexById(visibleNav, companyId)
  if (index >= 0) return { kind: 'inQueue', index }
  return { kind: 'pinOutside', index: visibleNav.length }
}

export type StayOnSavedPlan =
  | { kind: 'inQueue'; index: number }
  | { kind: 'pinOutside' }

/**
 * After Guardar (stay on record): if the company left the working cola,
 * pin that ficha (Fuera de la cola) instead of jumping to the next pending index.
 */
export function resolveStayOnSavedCompany(
  savedCompanyId: string,
  freshVisible: readonly { id: string }[]
): StayOnSavedPlan {
  const index = companyIndexById(freshVisible, savedCompanyId)
  if (index >= 0) return { kind: 'inQueue', index }
  return { kind: 'pinOutside' }
}

/** A Lista click must ignore a leftover Guardar pin (savedCompanyPinRef). */
export function shouldApplySavedCompanyPin(
  savedPinId: string | null | undefined,
  listClickCompanyId: string | null | undefined
): boolean {
  if (!savedPinId) return false
  if (listClickCompanyId) return false
  return true
}
