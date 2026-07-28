-- Novedades 2026-07-28: Ctrl+K localiza y resalta un agente en Gestión de agentes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20260728001',
  '2026-07-28',
  '28 de julio de 2026',
  $json$[
    "Agentes: desde Ctrl+K (⌘K), al elegir un agente se abre Gestión de agentes, se desplaza a su fila y se resalta unos segundos (también si está en inactivos)."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
