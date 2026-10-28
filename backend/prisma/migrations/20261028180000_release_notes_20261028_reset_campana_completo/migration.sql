-- Novedades 2026-10-28: Resetear campaña completo (historial de asignaciones) y Clientes sin días vacíos.
-- Idempotent upsert. Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261028001',
  '2026-10-28',
  '28 de octubre de 2026',
  $json$[
    "**Resetear campaña** borra también el historial de **Asignaciones**, métricas, sesiones y pines de lote. Las cuentas de usuario y el owner se conservan.",
    "En **Clientes**, los días sin empresas ya no aparecen (no más filas en 0). Si el período está vacío, se muestra un solo aviso."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
