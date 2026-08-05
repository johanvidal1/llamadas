-- Expand 2026-08-04 novedades: tooltip de nombre de lote truncado en Mis Clientes.
-- Idempotent upsert (keeps prior Aug 4 rentas items from 20260804201000).

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20260804001',
  '2026-08-04',
  '4 de agosto de 2026',
  $json$[
    "Importaciones: hoja opcional DetallePlan con renta_basica y renta_basica_con_desc (unión por RUC + número de teléfono).",
    "Mis Clientes: en líneas móviles se muestran Renta básica y Renta c/desc (ya no el Estado de producto OK).",
    "Mis Clientes: al pasar el cursor sobre un nombre de lote truncado se muestra el nombre completo (tooltip)."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
