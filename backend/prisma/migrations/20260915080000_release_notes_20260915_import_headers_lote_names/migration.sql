-- Novedades 2026-09-15: plantilla Excel con encabezados reales y nombre completo de lote.
-- Idempotent upsert.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20260915001',
  '2026-09-15',
  '15 de septiembre de 2026',
  $json$[
    "Importaciones: plantilla con pestañas tipo Excel (**Contactos** obligatoria, **ProductosMovil** y **DetallePlan** opcionales) y fila de encabezados reales de la base.",
    "Mis clientes: al abrir el selector de lotes se ve el **nombre completo** del archivo; el campo cerrado sigue compacto."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
