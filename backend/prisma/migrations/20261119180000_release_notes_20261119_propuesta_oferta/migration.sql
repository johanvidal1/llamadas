-- Novedades 2026-11-19: se quitó Oferta e icono de ayuda en Generar propuesta.
-- Idempotent upsert of the day's complete items. Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261119001',
  '2026-11-19',
  '19 de noviembre de 2026',
  $json$[
    "En **Generar propuesta** se quitó la etiqueta **Oferta** y el icono de ayuda."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
