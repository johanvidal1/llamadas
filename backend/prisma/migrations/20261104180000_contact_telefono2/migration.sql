-- Distinct second mobile on Contact (Entel Contactos asset_asociado → Teléfono 2).
-- Existing lots are backfilled on API startup from ImportBatch.storagePath (xlsx).

ALTER TABLE "Contact" ADD COLUMN "telefono2" TEXT;
