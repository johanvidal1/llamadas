-- Novedades 2026-11-23: hoja de propuesta (sello, PLAN, cargo) + catálogo Ver hoja del mismo día.
-- Later timestamp than 20261123180000 so migrate deploy applies this upsert after the catalog notes.
-- Unique per calendar day; ON CONFLICT (date) replaces items with the full-day copy.
-- Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261123001',
  '2026-11-23',
  '23 de noviembre de 2026',
  $json$[
    "En **Planes de propuesta** se puede **Ver hoja** y **Descargar imagen** (PNG), también en tablas ya subidas.",
    "En **Generar propuesta**, el título **PLAN** va centrado y ya no se muestra *porta*/*nueva* al cliente.",
    "Se quitó la franja negra; en la última hoja queda un sello (línea, nombre, cargo y celular).",
    "El **Cargo** se edita en el perfil (si está vacío: **Ejecutivo de ventas**)."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
