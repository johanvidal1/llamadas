/** Contact tab as shown in Mis clientes (shared form; prefill per contact). */
export type PrefillContact = { id: string }

/** Plantilla / import order: createdAt then id. Never by registered / has-log. */
export type StableSortContact = {
  id?: string
  createdAt?: string | Date | null
}

function createdAtMs(value: string | Date | null | undefined): number | null {
  if (value == null || value === '') return null
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

/** Left-to-right tab order: createdAt asc, then id asc. Does not mutate the input. */
export function sortContactsStable<T extends StableSortContact>(contacts: readonly T[]): T[] {
  return [...contacts].sort((a, b) => {
    const ta = createdAtMs(a.createdAt)
    const tb = createdAtMs(b.createdAt)
    if (ta != null && tb != null && ta !== tb) return ta - tb
    const ida = a.id ?? ''
    const idb = b.id ?? ''
    if (ida < idb) return -1
    if (ida > idb) return 1
    return 0
  })
}

export type PrefillCallLog = {
  id: string
  agentId: string
  calledAt: string
  disposition: string
  notes?: string | null
  contact?: { id?: string } | null
}

/**
 * After Guardar resultado / Guardar actualización, keep the saved contact tab.
 * Company-latest resolve (needsContactResolve) is only for entering a company.
 */
export function shouldSkipCompanyLatestContactResolve(
  stayAfterSave: boolean,
  stayContactId: string | null | undefined
): boolean {
  return stayAfterSave && Boolean(stayContactId)
}

export function contactIdxForStayAfterSave(
  contacts: readonly PrefillContact[],
  stayContactId: string | null | undefined,
  fallbackIdx: number
): number {
  if (!stayContactId) return fallbackIdx
  const idx = contacts.findIndex((c) => c.id === stayContactId)
  return idx >= 0 ? idx : fallbackIdx
}

/** Latest agent-selectable log for one contact tab, optionally pinned to a just-saved id. */
export function prefillFromContactLogs<T extends PrefillCallLog>(
  logs: readonly T[],
  contactId: string,
  agentId: string,
  isSelectable: (disposition: string) => boolean,
  pinnedLogId?: string | null
): T | null {
  const agentContactLogs = [...logs]
    .filter((l) => l.contact?.id === contactId && l.agentId === agentId)
    .sort((a, b) => new Date(b.calledAt).getTime() - new Date(a.calledAt).getTime())

  const pinnedIdx = pinnedLogId ? agentContactLogs.findIndex((l) => l.id === pinnedLogId) : -1
  const prefillStartIdx = pinnedIdx >= 0 ? pinnedIdx : 0

  return agentContactLogs.slice(prefillStartIdx).find((l) => isSelectable(l.disposition)) ?? null
}
