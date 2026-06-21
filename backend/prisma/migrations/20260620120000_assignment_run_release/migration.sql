-- CreateEnum
CREATE TYPE "AssignmentRunStatus" AS ENUM ('ACTIVE', 'PARTIALLY_RELEASED', 'PAUSED', 'CLOSED');

-- AlterTable
ALTER TABLE "AssignmentRun" ADD COLUMN "status" "AssignmentRunStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "AssignmentRun" ADD COLUMN "releasedAt" TIMESTAMP(3);
ALTER TABLE "AssignmentRun" ADD COLUMN "releaseNote" TEXT;

-- CreateTable
CREATE TABLE "AssignmentRelease" (
    "id" TEXT NOT NULL,
    "assignmentRunId" TEXT,
    "releasedById" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "importBatchId" TEXT,
    "companyCount" INTEGER NOT NULL,
    "contactCount" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssignmentRelease_assignmentRunId_idx" ON "AssignmentRelease"("assignmentRunId");
CREATE INDEX "AssignmentRelease_agentId_createdAt_idx" ON "AssignmentRelease"("agentId", "createdAt");

-- AddForeignKey
ALTER TABLE "AssignmentRelease" ADD CONSTRAINT "AssignmentRelease_assignmentRunId_fkey" FOREIGN KEY ("assignmentRunId") REFERENCES "AssignmentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentRelease" ADD CONSTRAINT "AssignmentRelease_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
