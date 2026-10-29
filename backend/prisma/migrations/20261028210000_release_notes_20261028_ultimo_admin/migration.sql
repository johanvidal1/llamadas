-- Novedades 2026-10-28: último admin del espacio + step-up de contraseña al borrar admin.
-- Idempotent upsert of the day's complete items. Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261028001',
  '2026-10-28',
  '28 de octubre de 2026',
  $json$[
    "**Resetear campaña** borra también el historial de **Asignaciones**, métricas, sesiones y pines de lote. Las cuentas de usuario y el owner se conservan.",
    "En **Agentes**, borrar uno o varios pide escribir **ELIMINAR**. Quien tenga historial se omitirá.",
    "No se puede borrar al último **administrador** del espacio; para quitar un admin hay que confirmar con tu contraseña.",
    "En **Agentes**, pulsa **Rol** para agrupar: Admin primero, luego Agentes. El owner queda siempre arriba."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
