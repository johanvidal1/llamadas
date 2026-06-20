-- CreateTable
CREATE TABLE "AssignmentRun" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "importBatchId" TEXT,
    "assignedById" TEXT NOT NULL,
    "companyCount" INTEGER NOT NULL,
    "contactCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentRun_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN "assignmentRunId" TEXT;

-- CreateIndex
CREATE INDEX "AssignmentRun_agentId_createdAt_idx" ON "AssignmentRun"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "AssignmentRun_importBatchId_idx" ON "AssignmentRun"("importBatchId");

-- AddForeignKey
ALTER TABLE "AssignmentRun" ADD CONSTRAINT "AssignmentRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentRun" ADD CONSTRAINT "AssignmentRun_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentRun" ADD CONSTRAINT "AssignmentRun_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_assignmentRunId_fkey" FOREIGN KEY ("assignmentRunId") REFERENCES "AssignmentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
