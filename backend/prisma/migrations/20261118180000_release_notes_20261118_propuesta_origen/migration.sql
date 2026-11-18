-- Novedades 2026-11-18: origen por fila en Generar propuesta (línea nueva vs portabilidad).
-- Idempotent upsert of the day's complete items. Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261118001',
  '2026-11-18',
  '18 de noviembre de 2026',
  $json$[
    "En **Generar propuesta**, cada plan se marca **Línea nueva** o **Portabilidad**; el chip inactivo o **+ Línea nueva** / **+ Portabilidad** suma la otra fila del mismo plan, sin duplicar origen.",
    "DATOS e INTERNET de cada fila salen solo del grupo elegido; si DATOS es ilimitado se imprime **ILIMITADO**.",
    "El listado de oferta en **Generar propuesta** hace scroll con la columna; la rueda no cambia el número de líneas."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
