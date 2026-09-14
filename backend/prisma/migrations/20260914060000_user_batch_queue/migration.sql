-- AlterTable
ALTER TABLE "User" ADD COLUMN "batchQueueMode" TEXT NOT NULL DEFAULT 'FIFO';
ALTER TABLE "User" ADD COLUMN "workingBatchId" TEXT;
