-- Novedades 2026-10-02: merge Plan de usuarios into the cupo-activos date.
-- Re-upsert if 20261002090000 already ran with the older two bullets.
-- Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261002001',
  '2026-10-02',
  '2 de octubre de 2026',
  $json$[
    "En **Usuarios**, un solo cupo (25 por defecto) para agentes, administradores y super admin del cliente; no cuentan el dueño, **Agente borrado** ni inactivos.",
    "Desactivar a quien se fue libera una plaza para crear el reemplazo.",
    "La tarjeta **Plan de usuarios** muestra ocupados / cupo y plazas disponibles; **Nuevo usuario** se desactiva al llenar el cupo.",
    "Solo el dueño de Optick puede subir o bajar el cupo del tenant (no por debajo de los usuarios en uso)."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
