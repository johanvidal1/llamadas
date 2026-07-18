-- Multi-tenant Phase 1 PR1: Tenant + tenantId (expand → backfill → constrain)
-- Safe for existing single-tenant DBs: all current rows belong to Optick (slug crm).
-- Fixed Optick tenant id so staging/prod backfills stay idempotent by slug/id.

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- Seed Optick tenant (slug crm → crm.optickcloud.com)
INSERT INTO "Tenant" ("id", "name", "slug", "status", "createdAt", "updatedAt")
VALUES (
  'clopticktenantcrm0001',
  'Optick',
  'crm',
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Expand: nullable tenantId on all tenant-scoped tables
ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "ImportBatch" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Company" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Contact" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "AssignmentRun" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Assignment" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "CallLog" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Callback" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "DailyAgentMetrics" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "UserSession" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "AgentResetLog" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "AssignmentRelease" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "MobileLine" ADD COLUMN "tenantId" TEXT;

-- Backfill: assign all existing rows to Optick
UPDATE "User" SET "tenantId" = 'clopticktenantcrm0001' WHERE "tenantId" IS NULL;
UPDATE "ImportBatch" SET "tenantId" = 'clopticktenantcrm0001' WHERE "tenantId" IS NULL;
UPDATE "Company" SET "tenantId" = 'clopticktenantcrm0001' WHERE "tenantId" IS NULL;
UPDATE "Contact" SET "tenantId" = 'clopticktenantcrm0001' WHERE "tenantId" IS NULL;
UPDATE "AssignmentRun" SET "tenantId" = 'clopticktenantcrm0001' WHERE "tenantId" IS NULL;
UPDATE "Assignment" SET "tenantId" = 'clopticktenantcrm0001' WHERE "tenantId" IS NULL;
UPDATE "CallLog" SET "tenantId" = 'clopticktenantcrm0001' WHERE "tenantId" IS NULL;
UPDATE "Callback" SET "tenantId" = 'clopticktenantcrm0001' WHERE "tenantId" IS NULL;
UPDATE "DailyAgentMetrics" SET "tenantId" = 'clopticktenantcrm0001' WHERE "tenantId" IS NULL;
UPDATE "UserSession" SET "tenantId" = 'clopticktenantcrm0001' WHERE "tenantId" IS NULL;
UPDATE "AgentResetLog" SET "tenantId" = 'clopticktenantcrm0001' WHERE "tenantId" IS NULL;
UPDATE "AssignmentRelease" SET "tenantId" = 'clopticktenantcrm0001' WHERE "tenantId" IS NULL;
UPDATE "MobileLine" SET "tenantId" = 'clopticktenantcrm0001' WHERE "tenantId" IS NULL;

-- Constrain: NOT NULL
ALTER TABLE "User" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "ImportBatch" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Company" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Contact" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AssignmentRun" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Assignment" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "CallLog" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Callback" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "DailyAgentMetrics" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "UserSession" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AgentResetLog" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "AssignmentRelease" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "MobileLine" ALTER COLUMN "tenantId" SET NOT NULL;

-- Email unique per tenant (drop global unique)
DROP INDEX "User_email_key";
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- Indexes
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");
CREATE INDEX "ImportBatch_tenantId_idx" ON "ImportBatch"("tenantId");
CREATE INDEX "ImportBatch_tenantId_createdAt_idx" ON "ImportBatch"("tenantId", "createdAt");
CREATE INDEX "Company_tenantId_idx" ON "Company"("tenantId");
CREATE INDEX "Company_tenantId_ruc_idx" ON "Company"("tenantId", "ruc");
CREATE INDEX "Company_tenantId_createdAt_idx" ON "Company"("tenantId", "createdAt");
CREATE INDEX "Contact_tenantId_idx" ON "Contact"("tenantId");
CREATE INDEX "AssignmentRun_tenantId_idx" ON "AssignmentRun"("tenantId");
CREATE INDEX "Assignment_tenantId_idx" ON "Assignment"("tenantId");
CREATE INDEX "CallLog_tenantId_idx" ON "CallLog"("tenantId");
CREATE INDEX "CallLog_tenantId_calledAt_idx" ON "CallLog"("tenantId", "calledAt");
CREATE INDEX "Callback_tenantId_idx" ON "Callback"("tenantId");
CREATE INDEX "DailyAgentMetrics_tenantId_idx" ON "DailyAgentMetrics"("tenantId");
CREATE INDEX "UserSession_tenantId_idx" ON "UserSession"("tenantId");
CREATE INDEX "AgentResetLog_tenantId_idx" ON "AgentResetLog"("tenantId");
CREATE INDEX "AssignmentRelease_tenantId_idx" ON "AssignmentRelease"("tenantId");
CREATE INDEX "MobileLine_tenantId_idx" ON "MobileLine"("tenantId");

-- Foreign keys
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Company" ADD CONSTRAINT "Company_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssignmentRun" ADD CONSTRAINT "AssignmentRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Callback" ADD CONSTRAINT "Callback_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DailyAgentMetrics" ADD CONSTRAINT "DailyAgentMetrics_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentResetLog" ADD CONSTRAINT "AgentResetLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssignmentRelease" ADD CONSTRAINT "AssignmentRelease_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MobileLine" ADD CONSTRAINT "MobileLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
