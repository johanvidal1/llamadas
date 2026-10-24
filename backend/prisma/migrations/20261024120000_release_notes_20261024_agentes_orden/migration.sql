-- Novedades 2026-10-24: ordenar columnas en Agentes.
-- Idempotent upsert. Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261024001',
  '2026-10-24',
  '24 de octubre de 2026',
  $json$[
    "En **Agentes**, pulsa **Llamadas (hoy)** o **Estado** para ordenar; los que no se conectan hace tiempo quedan al final.",
    "En **Agentes activos** también ordenan **Usuario**, **Empresas** y **Callbacks (hoy)**. La flecha marca la columna activa."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
