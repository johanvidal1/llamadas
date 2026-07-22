-- Support ticket image attachments (jpg/png/webp).

CREATE TABLE "SupportTicketAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "originalName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportTicketAttachment_tenantId_idx" ON "SupportTicketAttachment"("tenantId");
CREATE INDEX "SupportTicketAttachment_ticketId_idx" ON "SupportTicketAttachment"("ticketId");

ALTER TABLE "SupportTicketAttachment" ADD CONSTRAINT "SupportTicketAttachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportTicketAttachment" ADD CONSTRAINT "SupportTicketAttachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
