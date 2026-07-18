/**
 * Multi-tenant Phase 1 helpers.
 * PR1: fixed Optick tenant (slug crm). PR2 will resolve tenant from Host.
 */
export const OPTICK_TENANT_ID = 'clopticktenantcrm0001'
export const OPTICK_TENANT_SLUG = 'crm'
export const OPTICK_TENANT_NAME = 'Optick'

/** Tables that carry denormalized tenantId (must stay in sync with schema + backfill). */
export const TENANT_SCOPED_TABLES = [
  'User',
  'ImportBatch',
  'Company',
  'Contact',
  'AssignmentRun',
  'Assignment',
  'CallLog',
  'Callback',
  'DailyAgentMetrics',
  'UserSession',
  'AgentResetLog',
  'AssignmentRelease',
  'MobileLine',
] as const
