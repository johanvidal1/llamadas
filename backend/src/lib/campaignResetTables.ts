/**
 * Campaign reset inventory (no Prisma). Safe to import from unit tests.
 *
 * Wipe is tenant-scoped at runtime. Never delete User / Tenant / ReleaseNote.
 */

/** Tables deleted by Resetear campaña (same tenant). */
export const CAMPAIGN_RESET_WIPED_TABLES = [
  'SupportTicketAttachment',
  'SupportTicket',
  'Callback',
  'CallLog',
  'Assignment',
  'AssignmentRelease',
  'DailyAgentMetrics',
  'UserSession',
  'AgentResetLog',
  'AssignmentRun',
  'MobileLine',
  'Contact',
  'Company',
  'ImportBatch',
] as const

export type CampaignResetWipedTable = (typeof CAMPAIGN_RESET_WIPED_TABLES)[number]

/**
 * FK-safe delete order. AssignmentRelease → AssignmentRun before ImportBatch
 * so runs are not orphaned (optional importBatchId would otherwise SetNull).
 * MobileLine also cascades from Company / ImportBatch; we delete it explicitly
 * for an honest count.
 */
export const CAMPAIGN_RESET_FK_DELETE_ORDER = [
  'SupportTicketAttachment',
  'SupportTicket',
  'Callback',
  'CallLog',
  'Assignment',
  'AssignmentRelease',
  'DailyAgentMetrics',
  'UserSession',
  'AgentResetLog',
  'AssignmentRun',
  'MobileLine',
  'Contact',
  'Company',
  'ImportBatch',
] as const

/** Rows / product data that must survive Resetear campaña. */
export const CAMPAIGN_RESET_KEPT_TABLES = ['User', 'Tenant', 'ReleaseNote'] as const

/** User columns cleared (pins), not the User row. */
export const CAMPAIGN_RESET_USER_FIELDS_CLEARED = [
  'workingBatchId',
  'workingBatchIdEntel',
  'workingBatchIdMovistar',
] as const
