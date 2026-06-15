-- Assignment by contact: migrate company-level assignments to contact-level.
-- For each existing company assignment, ALL contacts of that company are assigned to the same agent.

-- Drop old company-based constraints
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_companyId_fkey";
DROP INDEX "Assignment_companyId_key";

-- Add contactId column (nullable during migration)
ALTER TABLE "Assignment" ADD COLUMN "contactId" TEXT;

-- Backup old company assignments and expand to contacts
CREATE TABLE "_AssignmentMigration" AS SELECT * FROM "Assignment";

DELETE FROM "Assignment";

INSERT INTO "Assignment" ("id", "contactId", "agentId", "assignedAt")
SELECT
  gen_random_uuid()::text,
  c."id",
  a."agentId",
  a."assignedAt"
FROM "_AssignmentMigration" a
JOIN "Contact" c ON c."companyId" = a."companyId";

DROP TABLE "_AssignmentMigration";

-- Remove companyId column
ALTER TABLE "Assignment" DROP COLUMN "companyId";

-- Enforce contactId constraints
ALTER TABLE "Assignment" ALTER COLUMN "contactId" SET NOT NULL;
CREATE UNIQUE INDEX "Assignment_contactId_key" ON "Assignment"("contactId");
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
