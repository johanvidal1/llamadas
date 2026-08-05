-- Novedades 2026-08-04: rentas desde DetallePlan en Mis Clientes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20260804001',
  '2026-08-04',
  '4 de agosto de 2026',
  $json$[
    "Importaciones: hoja opcional DetallePlan con renta_basica y renta_basica_con_desc (unión por RUC + número de teléfono).",
    "Mis Clientes: en líneas móviles se muestran Renta básica y Renta c/desc (ya no el Estado de producto OK)."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
