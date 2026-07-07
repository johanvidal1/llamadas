-- AlterTable
ALTER TABLE "User" ADD COLUMN "isArchivedAgent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AgentResetLog" (
    "id" TEXT NOT NULL,
    "originalAgentId" TEXT NOT NULL,
    "originalAgentName" TEXT NOT NULL,
    "resetById" TEXT NOT NULL,
    "reason" TEXT,
    "callLogsReassigned" INTEGER NOT NULL DEFAULT 0,
    "callbacksReassigned" INTEGER NOT NULL DEFAULT 0,
    "pendingCallbacksDeleted" INTEGER NOT NULL DEFAULT 0,
    "assignmentsDeleted" INTEGER NOT NULL DEFAULT 0,
    "runsClosed" INTEGER NOT NULL DEFAULT 0,
    "metricsDeleted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentResetLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentResetLog_originalAgentId_idx" ON "AgentResetLog"("originalAgentId");

-- CreateIndex
CREATE INDEX "AgentResetLog_resetById_idx" ON "AgentResetLog"("resetById");

-- CreateIndex
CREATE INDEX "AgentResetLog_createdAt_idx" ON "AgentResetLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AgentResetLog" ADD CONSTRAINT "AgentResetLog_resetById_fkey" FOREIGN KEY ("resetById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
