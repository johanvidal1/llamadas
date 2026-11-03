import { existsSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { prisma } from './prisma'
import {
  CAMPAIGN_RESET_FK_DELETE_ORDER,
  CAMPAIGN_RESET_KEPT_TABLES,
  CAMPAIGN_RESET_USER_FIELDS_CLEARED,
  CAMPAIGN_RESET_USES_INTERACTIVE_TRANSACTION,
  CAMPAIGN_RESET_WIPED_TABLES,
} from './campaignResetTables'
import {
  CAMPAIGN_RESET_CHUNK_SIZE,
  CampaignResetPartialError,
  campaignResetOthersSessionWhere,
  deleteManyChunked,
  runSequentialCampaignResetSteps,
} from './campaignResetWipe'

export {
  CAMPAIGN_RESET_FK_DELETE_ORDER,
  CAMPAIGN_RESET_KEPT_TABLES,
  CAMPAIGN_RESET_USER_FIELDS_CLEARED,
  CAMPAIGN_RESET_USES_INTERACTIVE_TRANSACTION,
  CAMPAIGN_RESET_WIPED_TABLES,
  CAMPAIGN_RESET_CHUNK_SIZE,
  CampaignResetPartialError,
}

export type CampaignResetCounts = {
  callbacks: number
  callLogs: number
  assignments: number
  assignmentRuns: number
  assignmentReleases: number
  dailyAgentMetrics: number
  userSessions: number
  agentResetLogs: number
  supportTickets: number
  supportTicketAttachments: number
  mobileLines: number
  contacts: number
  companies: number
  /** Alias of companies (legacy UI key). */
  clients: number
  importBatches: number
  batchPinsCleared: number
}

export type CampaignResetPreview = Omit<CampaignResetCounts, 'batchPinsCleared'> & {
  users: number
}

export type CampaignResetResult = {
  message: string
  deleted: CampaignResetCounts
  usersKept: number
}

export type ExecuteCampaignResetOptions = {
  /** Keep this user's sessions until the last step so they are not kicked mid-wipe. */
  keepSessionUserId?: string
}

function tenantWhere(tenantId: string) {
  return { tenantId }
}

function emptyCounts(): CampaignResetCounts {
  return {
    callbacks: 0,
    callLogs: 0,
    assignments: 0,
    assignmentRuns: 0,
    assignmentReleases: 0,
    dailyAgentMetrics: 0,
    userSessions: 0,
    agentResetLogs: 0,
    supportTickets: 0,
    supportTicketAttachments: 0,
    mobileLines: 0,
    contacts: 0,
    companies: 0,
    clients: 0,
    importBatches: 0,
    batchPinsCleared: 0,
  }
}

async function unlinkCampaignFiles(relativePaths: (string | null | undefined)[]): Promise<void> {
  for (const relative of relativePaths) {
    if (!relative || relative === 'pending') continue
    const absolute = path.join(process.cwd(), relative)
    try {
      if (existsSync(absolute)) await fs.unlink(absolute)
    } catch (err) {
      console.error('campaign reset: failed to unlink', relative, err)
    }
  }
}

export async function buildCampaignResetPreview(tenantId: string): Promise<CampaignResetPreview> {
  const where = tenantWhere(tenantId)
  const [
    callbacks,
    callLogs,
    assignments,
    assignmentRuns,
    assignmentReleases,
    dailyAgentMetrics,
    userSessions,
    agentResetLogs,
    supportTickets,
    supportTicketAttachments,
    mobileLines,
    contacts,
    companies,
    importBatches,
    users,
  ] = await Promise.all([
    prisma.callback.count({ where }),
    prisma.callLog.count({ where }),
    prisma.assignment.count({ where }),
    prisma.assignmentRun.count({ where }),
    prisma.assignmentRelease.count({ where }),
    prisma.dailyAgentMetrics.count({ where }),
    prisma.userSession.count({ where }),
    prisma.agentResetLog.count({ where }),
    prisma.supportTicket.count({ where }),
    prisma.supportTicketAttachment.count({ where }),
    prisma.mobileLine.count({ where }),
    prisma.contact.count({ where }),
    prisma.company.count({ where }),
    prisma.importBatch.count({ where }),
    prisma.user.count({ where }),
  ])

  return {
    callbacks,
    callLogs,
    assignments,
    assignmentRuns,
    assignmentReleases,
    dailyAgentMetrics,
    userSessions,
    agentResetLogs,
    supportTickets,
    supportTicketAttachments,
    mobileLines,
    contacts,
    companies,
    clients: companies,
    importBatches,
    users,
  }
}

/**
 * FK-safe sequential wipe. Each statement commits — no wrapping $transaction.
 * If a later step fails, earlier deletes stay; the error lists what landed.
 */
export async function executeCampaignReset(
  tenantId: string,
  options?: ExecuteCampaignResetOptions
): Promise<CampaignResetResult> {
  const where = tenantWhere(tenantId)
  const keepSessionUserId = options?.keepSessionUserId

  const [importFiles, attachmentFiles, usersKept] = await Promise.all([
    prisma.importBatch.findMany({ where, select: { storagePath: true } }),
    prisma.supportTicketAttachment.findMany({ where, select: { path: true } }),
    prisma.user.count({ where }),
  ])

  // Do not delete User / Tenant / ReleaseNote.
  const { counts } = await runSequentialCampaignResetSteps([
    {
      name: 'supportTicketAttachments',
      label: 'adjuntos de tickets',
      run: async () => (await prisma.supportTicketAttachment.deleteMany({ where })).count,
    },
    {
      name: 'supportTickets',
      label: 'tickets de soporte',
      run: async () => (await prisma.supportTicket.deleteMany({ where })).count,
    },
    {
      name: 'callbacks',
      label: 'callbacks',
      run: async () => (await prisma.callback.deleteMany({ where })).count,
    },
    {
      name: 'callLogs',
      label: 'llamadas',
      run: () => deleteManyChunked(prisma.callLog, where, CAMPAIGN_RESET_CHUNK_SIZE),
    },
    {
      name: 'assignments',
      label: 'asignaciones',
      run: async () => (await prisma.assignment.deleteMany({ where })).count,
    },
    {
      name: 'assignmentReleases',
      label: 'liberaciones',
      run: async () => (await prisma.assignmentRelease.deleteMany({ where })).count,
    },
    {
      name: 'dailyAgentMetrics',
      label: 'métricas diarias',
      run: async () => (await prisma.dailyAgentMetrics.deleteMany({ where })).count,
    },
    {
      name: 'userSessionsOthers',
      label: 'sesiones de otros usuarios',
      run: async () =>
        (
          await prisma.userSession.deleteMany({
            where: campaignResetOthersSessionWhere(tenantId, keepSessionUserId),
          })
        ).count,
    },
    {
      name: 'agentResetLogs',
      label: 'logs de reset de agentes',
      run: async () => (await prisma.agentResetLog.deleteMany({ where })).count,
    },
    {
      name: 'assignmentRuns',
      label: 'historial de asignaciones',
      run: async () => (await prisma.assignmentRun.deleteMany({ where })).count,
    },
    {
      name: 'mobileLines',
      label: 'líneas móviles',
      run: async () => (await prisma.mobileLine.deleteMany({ where })).count,
    },
    {
      name: 'contacts',
      label: 'contactos',
      run: () => deleteManyChunked(prisma.contact, where, CAMPAIGN_RESET_CHUNK_SIZE),
    },
    {
      name: 'companies',
      label: 'empresas',
      run: () => deleteManyChunked(prisma.company, where, CAMPAIGN_RESET_CHUNK_SIZE),
    },
    {
      name: 'importBatches',
      label: 'importaciones',
      run: async () => (await prisma.importBatch.deleteMany({ where })).count,
    },
    {
      name: 'batchPinsCleared',
      label: 'pines de lote',
      run: async () =>
        (
          await prisma.user.updateMany({
            where,
            data: {
              workingBatchId: null,
              workingBatchIdEntel: null,
              workingBatchIdMovistar: null,
            },
          })
        ).count,
    },
    {
      name: 'userSessionsRemaining',
      label: 'sesión del operador',
      run: async () => (await prisma.userSession.deleteMany({ where })).count,
    },
  ])

  const companies = counts.companies ?? 0
  const otherSessions = counts.userSessionsOthers ?? 0
  const remainingSessions = counts.userSessionsRemaining ?? 0

  const deleted: CampaignResetCounts = {
    ...emptyCounts(),
    callbacks: counts.callbacks ?? 0,
    callLogs: counts.callLogs ?? 0,
    assignments: counts.assignments ?? 0,
    assignmentRuns: counts.assignmentRuns ?? 0,
    assignmentReleases: counts.assignmentReleases ?? 0,
    dailyAgentMetrics: counts.dailyAgentMetrics ?? 0,
    userSessions: otherSessions + remainingSessions,
    agentResetLogs: counts.agentResetLogs ?? 0,
    supportTickets: counts.supportTickets ?? 0,
    supportTicketAttachments: counts.supportTicketAttachments ?? 0,
    mobileLines: counts.mobileLines ?? 0,
    contacts: counts.contacts ?? 0,
    companies,
    clients: companies,
    importBatches: counts.importBatches ?? 0,
    batchPinsCleared: counts.batchPinsCleared ?? 0,
  }

  await unlinkCampaignFiles([
    ...importFiles.map((row) => row.storagePath),
    ...attachmentFiles.map((row) => row.path),
  ])

  return {
    message: 'Base de datos de campaña reseteada. Los usuarios se mantienen intactos.',
    deleted,
    usersKept,
  }
}
