/**
 * Campaign reset wipe helpers (no Prisma import — safe for unit tests).
 *
 * Each deleteMany / chunk commits on its own. A later failure must not roll
 * back earlier steps; report what already landed.
 */

export const CAMPAIGN_RESET_CHUNK_SIZE = 5_000

export type ChunkDeleteModel = {
  findMany: (args: {
    where: Record<string, unknown>
    select: { id: true }
    take: number
  }) => Promise<{ id: string }[]>
  deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>
}

export async function deleteManyChunked(
  model: ChunkDeleteModel,
  where: Record<string, unknown>,
  chunkSize = CAMPAIGN_RESET_CHUNK_SIZE
): Promise<number> {
  const take = Math.max(1, chunkSize)
  let total = 0
  for (;;) {
    const rows = await model.findMany({
      where,
      select: { id: true },
      take,
    })
    if (rows.length === 0) break
    const result = await model.deleteMany({
      where: { ...where, id: { in: rows.map((row) => row.id) } },
    })
    total += result.count
    if (rows.length < take) break
  }
  return total
}

/** Other agents' sessions in the FK slot; omit the operator so they stay logged in. */
export function campaignResetOthersSessionWhere(
  tenantId: string,
  keepSessionUserId?: string
): Record<string, unknown> {
  if (!keepSessionUserId) return { tenantId }
  return { tenantId, userId: { not: keepSessionUserId } }
}

export type CampaignResetStep = {
  name: string
  label: string
  run: () => Promise<number>
}

export class CampaignResetPartialError extends Error {
  readonly failedStep: string
  readonly completedSteps: string[]
  readonly deleted: Record<string, number>

  constructor(
    message: string,
    opts: {
      failedStep: string
      completedSteps: string[]
      deleted: Record<string, number>
    }
  ) {
    super(message)
    this.name = 'CampaignResetPartialError'
    this.failedStep = opts.failedStep
    this.completedSteps = opts.completedSteps
    this.deleted = opts.deleted
  }
}

export function formatPartialResetError(
  failedLabel: string,
  completedLabels: string[]
): string {
  const done =
    completedLabels.length > 0
      ? completedLabels.join(', ')
      : 'nada todavía'
  return (
    `El reset de campaña se detuvo en «${failedLabel}». ` +
    `Ya se eliminó (y no se revirtió): ${done}. ` +
    'Recarga Clientes antes de reintentar.'
  )
}

export async function runSequentialCampaignResetSteps(
  steps: CampaignResetStep[]
): Promise<{ completedLabels: string[]; counts: Record<string, number> }> {
  const completedLabels: string[] = []
  const counts: Record<string, number> = {}
  for (const step of steps) {
    try {
      counts[step.name] = await step.run()
      completedLabels.push(step.label)
    } catch (err) {
      const message = formatPartialResetError(step.label, completedLabels)
      console.error('campaign reset: partial failure', {
        failedStep: step.name,
        completed: completedLabels,
        err,
      })
      throw new CampaignResetPartialError(message, {
        failedStep: step.name,
        completedSteps: completedLabels,
        deleted: counts,
      })
    }
  }
  return { completedLabels, counts }
}
