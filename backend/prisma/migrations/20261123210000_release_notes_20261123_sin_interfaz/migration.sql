-- Novedades 2026-11-23: día compactado a 5 viñetas + se quitó el selector Interfaz (Clásico/Nuevo).
-- Later timestamp than 20261123200000 so migrate deploy applies this upsert last.
-- Unique per calendar day; ON CONFLICT (date) replaces items with the full-day copy.
-- Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261123001',
  '2026-11-23',
  '23 de noviembre de 2026',
  $json$[
    "En **Planes de propuesta** se puede **Ver hoja** y **Descargar imagen** (PNG), también en tablas ya subidas.",
    "En **Generar propuesta**, el título **PLAN** va centrado, ya no se muestra *porta*/*nueva* al cliente y se quitó la franja negra de la última hoja.",
    "En la última hoja de la propuesta queda un sello (línea, nombre, **Cargo** y celular) a la derecha, que sube bajo el contenido cuando hay espacio, con lugar para firmar; el **Cargo** se edita en el perfil (si está vacío: **Ejecutivo de ventas**).",
    "El selector **Interfaz** (Clásico / Nuevo) se quitó del menú del usuario; todo queda en el diseño **Clásico**."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
