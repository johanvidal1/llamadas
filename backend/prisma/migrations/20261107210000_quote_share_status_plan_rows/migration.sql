-- Tenant share switch (survives campaign reset) and quote status / plan snapshot.
-- companyId is not a foreign key: resetting a campaign deletes Company rows.

ALTER TABLE "Tenant" ADD COLUMN "quoteShareEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CommercialQuote" ADD COLUMN "companyId" TEXT;
ALTER TABLE "CommercialQuote" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'BORRADOR';
ALTER TABLE "CommercialQuote" ADD COLUMN "sharedAt" TIMESTAMP(3);
ALTER TABLE "CommercialQuote" ADD COLUMN "viewedAt" TIMESTAMP(3);
ALTER TABLE "CommercialQuote" ADD COLUMN "downloadedAt" TIMESTAMP(3);
ALTER TABLE "CommercialQuote" ADD COLUMN "planRows" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "CommercialQuote" ADD COLUMN "letterheadPath" TEXT;
ALTER TABLE "CommercialQuote" ADD COLUMN "signaturePath" TEXT;
ALTER TABLE "CommercialQuote" ADD COLUMN "promoPaths" JSONB NOT NULL DEFAULT '[]';

UPDATE "CommercialQuote"
SET
    "status" = 'GENERADA',
    "planRows" = jsonb_build_array(
        jsonb_build_object(
            'name', "planName",
            'priceSoles', "priceSoles",
            'lines', "lines",
            'monthlySoles', "totalSoles",
            'proposed', true,
            'benefits', "benefits"
        )
    )
WHERE "pdfPath" <> 'pending';

CREATE INDEX "CommercialQuote_tenantId_companyId_idx" ON "CommercialQuote"("tenantId", "companyId");
