-- CreateTable
CREATE TABLE "DailyAgentMetrics" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "agentId" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "newRegistrations" INTEGER NOT NULL DEFAULT 0,
    "updatedRegistrations" INTEGER NOT NULL DEFAULT 0,
    "contactedCompanies" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyAgentMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyAgentMetrics_date_agentId_key" ON "DailyAgentMetrics"("date", "agentId");

-- CreateIndex
CREATE INDEX "DailyAgentMetrics_date_idx" ON "DailyAgentMetrics"("date");

-- CreateIndex
CREATE INDEX "DailyAgentMetrics_agentId_date_idx" ON "DailyAgentMetrics"("agentId", "date");

-- AddForeignKey
ALTER TABLE "DailyAgentMetrics" ADD CONSTRAINT "DailyAgentMetrics_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
