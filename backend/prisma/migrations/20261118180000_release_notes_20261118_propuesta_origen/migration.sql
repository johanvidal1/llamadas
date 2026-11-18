-- Novedades 2026-11-18: origen por fila en Generar propuesta (línea nueva vs portabilidad).
-- Idempotent upsert of the day's complete items. Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261118001',
  '2026-11-18',
  '18 de noviembre de 2026',
  $json$[
    "En **Generar propuesta**, cada plan se marca **Línea nueva** o **Portabilidad**; el chip inactivo o **+ Línea nueva** / **+ Portabilidad** suma la otra fila. Con ambos orígenes, **Porta** y **Nueva** van en una sola línea.",
    "La tabla de **Vista previa** y el PDF ordenan por precio (barato primero) y, en el mismo plan, **Portabilidad** y luego **Línea nueva**.",
    "DATOS e INTERNET de cada fila salen solo del grupo elegido; si DATOS es ilimitado se imprime **ILIMITADO**.",
    "El listado de oferta en **Generar propuesta** hace scroll con la columna; la rueda no cambia el número de líneas.",
    "**Generar propuesta** admite hasta 16 planes (porta y nueva del mismo no cuentan doble).",
    "El PDF no tapa el pie; **Aplicaciones** y roaming pasan enteros a la hoja 2 si no caben.",
    "Si el PDF está abierto, se vuelve a abrir **Guardar como**.",
    "En **Mis clientes** se ve cuántas **Líneas móviles** tiene la empresa; la pastilla lleva a esa tabla."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
