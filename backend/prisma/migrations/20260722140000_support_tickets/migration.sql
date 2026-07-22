-- Support tickets MVP (tenant-scoped). Status: OPEN | PENDING | CLOSED.

CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT,
    "createdById" TEXT NOT NULL,
    "elevatedByAdminId" TEXT,
    "adminNote" TEXT,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportTicket_tenantId_idx" ON "SupportTicket"("tenantId");
CREATE INDEX "SupportTicket_tenantId_status_idx" ON "SupportTicket"("tenantId", "status");
CREATE INDEX "SupportTicket_createdById_idx" ON "SupportTicket"("createdById");
CREATE INDEX "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt");

ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_elevatedByAdminId_fkey" FOREIGN KEY ("elevatedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
