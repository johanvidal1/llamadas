import { existsSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { prisma } from './prisma'
import {
  CAMPAIGN_RESET_FK_DELETE_ORDER,
  CAMPAIGN_RESET_KEPT_TABLES,
  CAMPAIGN_RESET_USER_FIELDS_CLEARED,
  CAMPAIGN_RESET_WIPED_TABLES,
} from './campaignResetTables'

export {
  CAMPAIGN_RESET_FK_DELETE_ORDER,
  CAMPAIGN_RESET_KEPT_TABLES,
  CAMPAIGN_RESET_USER_FIELDS_CLEARED,
  CAMPAIGN_RESET_WIPED_TABLES,
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

const TX_TIMEOUT_MS = 60_000
const TX_MAX_WAIT_MS = 15_000

function tenantWhere(tenantId: string) {
  return { tenantId }
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

export async function executeCampaignReset(tenantId: string): Promise<CampaignResetResult> {
  const where = tenantWhere(tenantId)

  const [importFiles, attachmentFiles, usersKept] = await Promise.all([
    prisma.importBatch.findMany({ where, select: { storagePath: true } }),
    prisma.supportTicketAttachment.findMany({ where, select: { path: true } }),
    prisma.user.count({ where }),
  ])

  const deleted = await prisma.$transaction(
    async (tx) => {
      // FK-safe order. Do not delete User / Tenant / ReleaseNote.
      const supportTicketAttachments = await tx.supportTicketAttachment.deleteMany({ where })
      const supportTickets = await tx.supportTicket.deleteMany({ where })
      const callbacks = await tx.callback.deleteMany({ where })
      const callLogs = await tx.callLog.deleteMany({ where })
      const assignments = await tx.assignment.deleteMany({ where })
      const assignmentReleases = await tx.assignmentRelease.deleteMany({ where })
      const dailyAgentMetrics = await tx.dailyAgentMetrics.deleteMany({ where })
      const userSessions = await tx.userSession.deleteMany({ where })
      // AgentResetLog.resetById → User: delete logs only, never users.
      const agentResetLogs = await tx.agentResetLog.deleteMany({ where })
      const assignmentRuns = await tx.assignmentRun.deleteMany({ where })
      const mobileLines = await tx.mobileLine.deleteMany({ where })
      const contacts = await tx.contact.deleteMany({ where })
      const companies = await tx.company.deleteMany({ where })
      const importBatches = await tx.importBatch.deleteMany({ where })

      const pins = await tx.user.updateMany({
        where,
        data: {
          workingBatchId: null,
          workingBatchIdEntel: null,
          workingBatchIdMovistar: null,
        },
      })

      return {
        callbacks: callbacks.count,
        callLogs: callLogs.count,
        assignments: assignments.count,
        assignmentRuns: assignmentRuns.count,
        assignmentReleases: assignmentReleases.count,
        dailyAgentMetrics: dailyAgentMetrics.count,
        userSessions: userSessions.count,
        agentResetLogs: agentResetLogs.count,
        supportTickets: supportTickets.count,
        supportTicketAttachments: supportTicketAttachments.count,
        mobileLines: mobileLines.count,
        contacts: contacts.count,
        companies: companies.count,
        clients: companies.count,
        importBatches: importBatches.count,
        batchPinsCleared: pins.count,
      }
    },
    { timeout: TX_TIMEOUT_MS, maxWait: TX_MAX_WAIT_MS }
  )

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
