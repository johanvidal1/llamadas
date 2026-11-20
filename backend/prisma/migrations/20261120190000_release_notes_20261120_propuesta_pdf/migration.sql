-- Novedades 2026-11-20: propuesta PDF (encabezado, continuación, zonas 4) + DATOS/INTERNET.
-- Later timestamp than 20261120180000 so migrate deploy applies this upsert after the first
-- 20 Nov row. Unique per calendar day; ON CONFLICT (date) replaces items.
-- Idempotent upsert of the day's complete items. Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261120001',
  '2026-11-20',
  '20 de noviembre de 2026',
  $json$[
    "En **Generar propuesta** (PDF y vista previa) se cruzaron los títulos **INTERNET** y **DATOS**; los valores no se mueven.",
    "El encabezado rojo deja bajar la razón social hasta 2 líneas y pone **RUC** y fecha debajo, sin superponerse.",
    "Si el mapa de zonas va a otra hoja, esa página lleva franja Claro y la sección **4 Zonas de roaming internacional**."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
