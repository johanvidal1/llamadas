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
  list: readonly CompanyNavItem[],
  companyId: string
): number {
  if (!companyId) return -1
  return list.findIndex((c) => c.id === companyId)
}
