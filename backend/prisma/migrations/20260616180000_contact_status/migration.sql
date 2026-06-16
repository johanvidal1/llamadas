-- Add status to Contact and backfill from latest call log per contact.
ALTER TABLE "Contact" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING';

UPDATE "Contact" c
SET "status" = CASE cl."disposition"
  WHEN 'INTERESTED' THEN 'INTERESTED'
  WHEN 'NOT_INTERESTED' THEN 'NOT_INTERESTED'
  WHEN 'NO_ANSWER' THEN 'IN_PROGRESS'
  WHEN 'BUSY' THEN 'IN_PROGRESS'
  WHEN 'CALLBACK' THEN 'IN_PROGRESS'
  WHEN 'DO_NOT_CALL' THEN 'DO_NOT_CALL'
  WHEN 'OTHER' THEN 'IN_PROGRESS'
  ELSE 'PENDING'
END
FROM (
  SELECT DISTINCT ON ("contactId") "contactId", "disposition"
  FROM "CallLog"
  WHERE "contactId" IS NOT NULL
  ORDER BY "contactId", "calledAt" DESC
) cl
WHERE c."id" = cl."contactId";

-- Recompute company.status from contact statuses (CONVERTED > INTERESTED > all DO_NOT_CALL > all NOT_INTERESTED > all PENDING > IN_PROGRESS).
UPDATE "Company" co
SET "status" = sub."derived"
FROM (
  SELECT
    c."companyId",
    CASE
      WHEN bool_or(c."status" = 'CONVERTED') THEN 'CONVERTED'
      WHEN bool_or(c."status" = 'INTERESTED') THEN 'INTERESTED'
      WHEN bool_and(c."status" = 'DO_NOT_CALL') THEN 'DO_NOT_CALL'
      WHEN bool_and(c."status" = 'NOT_INTERESTED') THEN 'NOT_INTERESTED'
      WHEN bool_and(c."status" = 'PENDING') THEN 'PENDING'
      ELSE 'IN_PROGRESS'
    END AS "derived"
  FROM "Contact" c
  GROUP BY c."companyId"
) sub
WHERE co."id" = sub."companyId";
