/** Client-side sort for the Agentes table. Presence rank + lastSeen, then metrics. */

export type AgentPresenceStatus = 'online' | 'recent' | 'offline'

export type AgentTableSortKey =
  | 'name'
  | 'status'
  | 'assignedCompanies'
  | 'callsToday'
  | 'callbacksToday'

export type AgentTableSortDir = 'asc' | 'desc'

export type SortableAgent = {
  id: string
  name: string
  assignedCompanies?: number
  callsToday?: number
  callbacksToday?: number
}

export type AgentSortPresence = {
  status?: AgentPresenceStatus
  lastSeenAt?: string | null
}

export const DEFAULT_AGENT_TABLE_SORT: AgentTableSortKey = 'status'

const PRESENCE_RANK: Record<AgentPresenceStatus, number> = {
  online: 0,
  recent: 1,
  offline: 2,
}

export function presenceRank(status: AgentPresenceStatus | undefined | null): number {
  if (!status) return PRESENCE_RANK.offline
  return PRESENCE_RANK[status]
}

export function lastSeenMs(iso: string | null | undefined): number {
  if (!iso) return 0
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : 0
}

export function presenceLastSeenAt(
  sessions?: Array<{ lastSeenAt?: string | null }> | null,
): string | null {
  if (!sessions?.length) return null
  let best: string | null = null
  let bestMs = -1
  for (const session of sessions) {
    const ms = lastSeenMs(session.lastSeenAt)
    if (ms > bestMs) {
      bestMs = ms
      best = session.lastSeenAt ?? null
    }
  }
  return best
}

export function presenceForSort(
  presence?: {
    status?: AgentPresenceStatus
    lastSeenAt?: string | null
    sessions?: Array<{ lastSeenAt?: string | null }>
  } | null,
): AgentSortPresence {
  if (!presence) return { status: 'offline', lastSeenAt: null }
  return {
    status: presence.status ?? 'offline',
    lastSeenAt: presence.lastSeenAt ?? presenceLastSeenAt(presence.sessions),
  }
}

/** First click: Estado online-first, Usuario A–Z, metrics more-first. */
export function defaultAgentTableSortDir(key: AgentTableSortKey): AgentTableSortDir {
  if (key === 'name' || key === 'status') return 'asc'
  return 'desc'
}

export function nextAgentTableSort(
  currentKey: AgentTableSortKey,
  currentDir: AgentTableSortDir,
  clickedKey: AgentTableSortKey,
): { key: AgentTableSortKey; dir: AgentTableSortDir } {
  if (currentKey === clickedKey) {
    return { key: clickedKey, dir: currentDir === 'asc' ? 'desc' : 'asc' }
  }
  return { key: clickedKey, dir: defaultAgentTableSortDir(clickedKey) }
}

function compareName(a: SortableAgent, b: SortableAgent): number {
  const byName = a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
  if (byName !== 0) return byName
  return a.id.localeCompare(b.id)
}

function compareStatus(
  a: SortableAgent,
  b: SortableAgent,
  presenceOf: (user: SortableAgent) => AgentSortPresence | undefined,
): number {
  const pa = presenceOf(a)
  const pb = presenceOf(b)
  const rankDiff = presenceRank(pa?.status) - presenceRank(pb?.status)
  if (rankDiff !== 0) return rankDiff
  return lastSeenMs(pb?.lastSeenAt) - lastSeenMs(pa?.lastSeenAt)
}

function compareMetric(
  a: SortableAgent,
  b: SortableAgent,
  key: 'assignedCompanies' | 'callsToday' | 'callbacksToday',
): number {
  return (a[key] ?? 0) - (b[key] ?? 0)
}

export function compareAgentsForSort(
  a: SortableAgent,
  b: SortableAgent,
  key: AgentTableSortKey,
  dir: AgentTableSortDir,
  presenceOf: (user: SortableAgent) => AgentSortPresence | undefined = () => undefined,
): number {
  let cmp = 0
  if (key === 'name') cmp = compareName(a, b)
  else if (key === 'status') cmp = compareStatus(a, b, presenceOf)
  else cmp = compareMetric(a, b, key)

  if (cmp !== 0) return dir === 'asc' ? cmp : -cmp
  return compareName(a, b)
}

export function sortAgents<T extends SortableAgent>(
  users: T[],
  key: AgentTableSortKey,
  dir: AgentTableSortDir,
  presenceOf: (user: T) => AgentSortPresence | undefined = () => undefined,
): T[] {
  return [...users].sort((a, b) =>
    compareAgentsForSort(a, b, key, dir, presenceOf as (user: SortableAgent) => AgentSortPresence | undefined),
  )
}
