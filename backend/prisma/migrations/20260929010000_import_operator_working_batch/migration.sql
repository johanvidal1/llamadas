-- Additive operator on import batches (existing rows = CLARO via DEFAULT).
-- Per-operator working-batch pins on User; copy legacy workingBatchId → Claro.

ALTER TABLE "ImportBatch" ADD COLUMN "operator" TEXT NOT NULL DEFAULT 'CLARO';

ALTER TABLE "User" ADD COLUMN "workingBatchIdClaro" TEXT;
ALTER TABLE "User" ADD COLUMN "workingBatchIdMovistar" TEXT;

UPDATE "User"
SET "workingBatchIdClaro" = "workingBatchId"
WHERE "workingBatchId" IS NOT NULL;

CREATE INDEX "ImportBatch_tenantId_operator_idx" ON "ImportBatch"("tenantId", "operator");
