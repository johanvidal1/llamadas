-- Tenant billing / cobranza fields (Optick platform owner editable).
-- Defaults: billingEnabled=false, billingDay=1, graceDays=7.
-- Optick remains billingEnabled=false (hide banner for platform tenant).

ALTER TABLE "Tenant" ADD COLUMN "billingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "billingDay" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Tenant" ADD COLUMN "graceDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "Tenant" ADD COLUMN "paidThrough" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "billingContact" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "billingNotes" TEXT;

-- Ensure Optick platform tenant never shows cobranza banner by default.
UPDATE "Tenant"
SET "billingEnabled" = false
WHERE "id" = 'clopticktenantcrm0001' OR "slug" = 'crm';

-- Release notes: aviso de cobranza (2026-07-22).
INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20260722001',
  '2026-07-22',
  '22 de julio de 2026',
  $json$[
    "Cobranza: aviso persistente para administradores del tenant (gracia 7 días por defecto; editable por el dueño en Tenants).",
    "Plataforma: campos de facturación por cliente (habilitar, día de pago, gracia, pagado hasta, contacto cobranza)."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO NOTHING;
