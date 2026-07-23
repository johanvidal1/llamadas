-- Novedades 2026-07-23: Asignaciones — vista lista y búsqueda de agentes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20260723001',
  '2026-07-23',
  '23 de julio de 2026',
  $json$[
    "Asignaciones: en «Estado de asignaciones por agente» puedes alternar Tarjetas | Lista, buscar por nombre o email, y recordar la vista preferida por administrador."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
