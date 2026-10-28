/**
 * Clientes day groups: never paint a calendar row with 0 empresas.
 */

export function filterNonEmptyDayGroups<T extends { clients: { length: number } }>(
  groups: T[]
): T[] {
  return groups.filter((g) => g.clients.length > 0)
}

export function filterNonEmptyDaySummaries<T extends { count: number }>(days: T[]): T[] {
  return days.filter((d) => d.count > 0)
}
