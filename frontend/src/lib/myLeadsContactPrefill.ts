/** Contact tab as shown in Mis clientes (shared form; prefill per contact). */
export type PrefillContact = { id: string }

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
