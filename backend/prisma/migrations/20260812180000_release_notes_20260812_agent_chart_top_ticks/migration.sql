-- Novedades 2026-08-12: escala numérica arriba y abajo en gráfico móvil de agentes.
-- Idempotent upsert.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20260812001',
  '2026-08-12',
  '12 de agosto de 2026',
  $json$[
    "Informes: en móvil, el gráfico «Llamadas por agente» muestra la escala numérica arriba y abajo para leer valores con más facilidad."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
