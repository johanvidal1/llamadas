-- AlterTable
ALTER TABLE "Company" ADD COLUMN "recoveredAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "recoveredFromAgentId" TEXT;

-- CreateIndex
CREATE INDEX "Company_recoveredAt_idx" ON "Company"("recoveredAt");
CREATE INDEX "Company_recoveredFromAgentId_idx" ON "Company"("recoveredFromAgentId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_recoveredFromAgentId_fkey" FOREIGN KEY ("recoveredFromAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
