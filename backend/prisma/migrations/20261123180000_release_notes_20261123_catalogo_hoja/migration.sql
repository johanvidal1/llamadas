-- Novedades 2026-11-23: snapshot Excel de Planes de propuesta (Ver hoja + PNG).
-- Notes only — no schema changes. Unique per calendar day; ON CONFLICT (date) replaces items.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261123001',
  '2026-11-23',
  '23 de noviembre de 2026',
  $json$[
    "En **Planes de propuesta** se puede **Ver hoja**: modal con todas las columnas del catálogo, como el Excel, también en tablas ya subidas.",
    "Desde el modal se **Descarga imagen** (PNG) de esa vista."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
