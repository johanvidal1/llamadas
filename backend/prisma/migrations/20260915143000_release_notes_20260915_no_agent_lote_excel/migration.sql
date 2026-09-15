-- Novedades 2026-09-15: agentes ya no descargan Excel del lote (append to same day).
-- Idempotent upsert; keeps previous 15-sep bullets plus the new one.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20260915001',
  '2026-09-15',
  '15 de septiembre de 2026',
  $json$[
    "Importaciones: plantilla con pestañas tipo Excel (**Contactos** obligatoria, **ProductosMovil** y **DetallePlan** opcionales) y fila de encabezados reales de la base.",
    "Mis clientes: al abrir el selector de lotes se ve el **nombre completo** del archivo; el campo cerrado sigue compacto.",
    "Mis clientes: los agentes ya no pueden **descargar** el Excel del lote; la exportación queda para **admin** en Importaciones."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
