-- Novedades 2026-11-20: títulos DATOS e INTERNET cruzados en Generar propuesta.
-- Idempotent upsert of the day's complete items. Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261120001',
  '2026-11-20',
  '20 de noviembre de 2026',
  $json$[
    "En **Generar propuesta** (PDF y vista previa) se cruzaron los títulos **DATOS** e **INTERNET**; los valores no se mueven."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
