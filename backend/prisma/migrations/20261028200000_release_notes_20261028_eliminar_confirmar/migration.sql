-- Novedades 2026-10-28: Agentes pide ELIMINAR al borrar uno o varios.
-- Idempotent upsert of the day's complete items. Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261028001',
  '2026-10-28',
  '28 de octubre de 2026',
  $json$[
    "**Resetear campaña** borra también el historial de **Asignaciones**, métricas, sesiones y pines de lote. Las cuentas de usuario y el owner se conservan.",
    "En **Clientes**, los días sin empresas ya no aparecen (no más filas en 0). Si el período está vacío, se muestra un solo aviso.",
    "En **Agentes**, pulsa **Rol** para agrupar: Admin primero, luego Agentes. El owner queda siempre arriba.",
    "En **Agentes**, borrar uno o varios pide escribir **ELIMINAR**. Quien tenga historial se omitirá."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
