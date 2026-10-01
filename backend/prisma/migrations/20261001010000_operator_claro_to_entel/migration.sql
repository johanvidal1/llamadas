-- Home operator rename: Claro → Entel (label only; no volume recreate).
-- Additive: backfill values, change DEFAULT, rename User pin column.

UPDATE "ImportBatch" SET "operator" = 'ENTEL' WHERE "operator" = 'CLARO';

ALTER TABLE "ImportBatch" ALTER COLUMN "operator" SET DEFAULT 'ENTEL';

ALTER TABLE "User" RENAME COLUMN "workingBatchIdClaro" TO "workingBatchIdEntel";
