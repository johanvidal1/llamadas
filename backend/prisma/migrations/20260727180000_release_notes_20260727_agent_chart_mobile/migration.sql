-- Novedades 2026-07-27: Informes «Llamadas por agente» legible en móvil.
-- Idempotent upsert.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20260727001',
  '2026-07-27',
  '27 de julio de 2026',
  $json$[
    "Informes: el gráfico «Llamadas por agente» usa barras horizontales en móvil (nombres legibles) y rota las etiquetas en escritorio cuando hay muchos agentes."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
