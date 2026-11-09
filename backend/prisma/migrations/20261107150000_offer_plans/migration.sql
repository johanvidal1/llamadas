-- Commercial proposal catalog (Generar propuesta). Tenant-scoped; cascade on tenant delete.
-- Not Company.plan. Kept across Resetear campaña (not wiped here).

CREATE TABLE "OfferPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceSoles" DECIMAL(10,2) NOT NULL,
    "benefits" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OfferPlan_tenantId_idx" ON "OfferPlan"("tenantId");
CREATE INDEX "OfferPlan_tenantId_sortOrder_idx" ON "OfferPlan"("tenantId", "sortOrder");

ALTER TABLE "OfferPlan" ADD CONSTRAINT "OfferPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
