-- CreateIndex
CREATE INDEX "CallLog_calledAt_idx" ON "CallLog"("calledAt");

-- CreateIndex
CREATE INDEX "CallLog_agentId_calledAt_idx" ON "CallLog"("agentId", "calledAt");

-- CreateIndex
CREATE INDEX "CallLog_companyId_idx" ON "CallLog"("companyId");

-- CreateIndex
CREATE INDEX "CallLog_disposition_idx" ON "CallLog"("disposition");
