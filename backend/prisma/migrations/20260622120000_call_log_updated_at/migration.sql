-- AlterTable
ALTER TABLE "CallLog" ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Backfill from calledAt so existing rows are not marked as edited
UPDATE "CallLog" SET "updatedAt" = "calledAt";

ALTER TABLE "CallLog" ALTER COLUMN "updatedAt" SET NOT NULL;
