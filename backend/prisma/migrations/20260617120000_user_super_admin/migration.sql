-- AlterTable
ALTER TABLE "User" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: exactly one super admin (admin@llamadas.com if exists, else earliest ADMIN)
WITH candidate AS (
  SELECT id
  FROM "User"
  WHERE role = 'ADMIN'
  ORDER BY
    CASE WHEN email = 'admin@llamadas.com' THEN 0 ELSE 1 END,
    "createdAt" ASC
  LIMIT 1
)
UPDATE "User"
SET "isSuperAdmin" = true
WHERE id IN (SELECT id FROM candidate);

-- Safety: ensure only one super admin
UPDATE "User"
SET "isSuperAdmin" = false
WHERE id NOT IN (
  SELECT id
  FROM "User"
  WHERE "isSuperAdmin" = true
  ORDER BY "createdAt" ASC
  LIMIT 1
);
