-- Novedades 2026-11-02: Resetear campaña fiable en bases grandes (sin TX de 60s).
-- Idempotent upsert. Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261102001',
  '2026-11-02',
  '2 de noviembre de 2026',
  $json$[
    "**Resetear campaña** es más fiable en bases grandes: cada borrado se confirma por separado y ya no se revierte todo si el proceso tarda.",
    "El aviso indica que puede tardar unos minutos. Si el navegador corta la espera, recarga **Clientes** antes de reintentar; el reset puede haber terminado igual."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
