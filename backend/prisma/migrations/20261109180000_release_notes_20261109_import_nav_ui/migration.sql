-- Novedades 2026-11-09: import Entel DetallePlan, cola Mis clientes, nombres de lote, tema Interfaz.
-- Idempotent upsert of the day's complete items. Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261109001',
  '2026-11-09',
  '9 de noviembre de 2026',
  $json$[
    "Importaciones Entel: las líneas salen de la hoja **DetallePlan** (`plan_detalle`); **ProductosMovil** queda como respaldo si hay teléfonos extra. Un Excel de 2 hojas (Contactos + DetallePlan) ya entra.",
    "En **Mis clientes**, **Guardar y siguiente pendiente** usa solo el registro del agente en este lote (no el historial anterior). **Guardar y siguiente empresa** avanza en silencio si no hay cambios, sin error.",
    "Los nombres de lote con ñ y acentos se muestran bien.",
    "En el menú del avatar, **Interfaz** permite Clásico o Nuevo (sigue **Clásico** por defecto)."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
