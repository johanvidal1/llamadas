-- Versioned proposal catalogs, piece-built PDF templates, and quote snapshots.
-- Existing OfferPlan rows are kept and attached to one active principal table
-- named from the original MAX Negocios workbook. Nothing is deleted.

CREATE TABLE "OfferPlanTable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferPlanTable_pkey" PRIMARY KEY ("id")
);

INSERT INTO "OfferPlanTable" ("id", "tenantId", "name", "isActive", "isPrincipal", "createdAt")
SELECT
    'optblmax' || p."tenantId",
    p."tenantId",
    'MAX Negocios',
    true,
    true,
    MIN(p."createdAt")
FROM "OfferPlan" p
GROUP BY p."tenantId";

ALTER TABLE "OfferPlan" ADD COLUMN "tableId" TEXT;

UPDATE "OfferPlan"
SET "tableId" = 'optblmax' || "tenantId"
WHERE "tableId" IS NULL;

ALTER TABLE "OfferPlan" ALTER COLUMN "tableId" SET NOT NULL;

CREATE INDEX "OfferPlanTable_tenantId_idx" ON "OfferPlanTable"("tenantId");
CREATE INDEX "OfferPlanTable_tenantId_isActive_idx" ON "OfferPlanTable"("tenantId", "isActive");
CREATE UNIQUE INDEX "OfferPlanTable_principal_per_tenant"
    ON "OfferPlanTable" ("tenantId")
    WHERE "isPrincipal" = true;

CREATE INDEX "OfferPlan_tableId_idx" ON "OfferPlan"("tableId");

ALTER TABLE "OfferPlanTable"
    ADD CONSTRAINT "OfferPlanTable_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfferPlan"
    ADD CONSTRAINT "OfferPlan_tableId_fkey"
    FOREIGN KEY ("tableId") REFERENCES "OfferPlanTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "QuoteTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "greeting" TEXT NOT NULL,
    "farewell" TEXT NOT NULL,
    "letterheadPath" TEXT,
    "signaturePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteTemplatePromo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteTemplatePromo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommercialQuote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "templateId" TEXT,
    "planName" TEXT NOT NULL,
    "priceSoles" DECIMAL(10,2) NOT NULL,
    "lines" INTEGER NOT NULL,
    "totalSoles" DECIMAL(12,2) NOT NULL,
    "benefits" JSONB NOT NULL,
    "currentPlans" JSONB NOT NULL,
    "companyName" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT NOT NULL DEFAULT '',
    "ruc" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "greeting" TEXT NOT NULL,
    "farewell" TEXT NOT NULL,
    "pdfPath" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialQuote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommercialQuote_token_key" ON "CommercialQuote"("token");
CREATE INDEX "CommercialQuote_tenantId_idx" ON "CommercialQuote"("tenantId");
CREATE INDEX "CommercialQuote_tenantId_createdAt_idx" ON "CommercialQuote"("tenantId", "createdAt");

CREATE INDEX "QuoteTemplate_tenantId_idx" ON "QuoteTemplate"("tenantId");
CREATE INDEX "QuoteTemplate_tenantId_isDefault_idx" ON "QuoteTemplate"("tenantId", "isDefault");
CREATE UNIQUE INDEX "QuoteTemplate_default_per_tenant"
    ON "QuoteTemplate" ("tenantId")
    WHERE "isDefault" = true;

CREATE INDEX "QuoteTemplatePromo_tenantId_idx" ON "QuoteTemplatePromo"("tenantId");
CREATE INDEX "QuoteTemplatePromo_templateId_idx" ON "QuoteTemplatePromo"("templateId");

ALTER TABLE "QuoteTemplate"
    ADD CONSTRAINT "QuoteTemplate_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuoteTemplatePromo"
    ADD CONSTRAINT "QuoteTemplatePromo_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuoteTemplatePromo"
    ADD CONSTRAINT "QuoteTemplatePromo_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "QuoteTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommercialQuote"
    ADD CONSTRAINT "CommercialQuote_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "QuoteTemplate" (
    "id", "tenantId", "name", "isDefault", "greeting", "farewell", "createdAt", "updatedAt"
)
SELECT
    'qttplclasico' || t."id",
    t."id",
    'Clásico',
    true,
    $g$Estimado/a, gracias por su tiempo. Le presentamos la propuesta comercial de Optick.$g$,
    $f$Quedamos atentos para acompañarle en el siguiente paso. Optick.$f$,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Tenant" t;

INSERT INTO "QuoteTemplate" (
    "id", "tenantId", "name", "isDefault", "greeting", "farewell", "createdAt", "updatedAt"
)
SELECT
    'qttplbreve' || t."id",
    t."id",
    'Breve',
    false,
    $g$Estimado/a, le enviamos el resumen de su propuesta comercial.$g$,
    $f$Gracias por considerarnos. Optick.$f$,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Tenant" t;
