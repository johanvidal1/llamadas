-- Novedades 2026-11-04: Teléfono 2 en Mis clientes (Entel asset_asociado).
-- Idempotent upsert.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261104001',
  '2026-11-04',
  '4 de noviembre de 2026',
  $json$[
    "**Mis clientes**: en **Detalle**, **Teléfono 2** aparece a la derecha del teléfono principal (solo celulares reales) con Llamar y Copiar.",
    "En **Lista**, la columna **Teléfono 2** va después de **Teléfono**; si no hay segundo móvil se ve un guion.",
    "Importaciones Entel: el segundo celular queda en el mismo contacto, sin mezclarlo con el teléfono principal ni crear otro contacto. La búsqueda incluye **Teléfono 2**.",
    "Los lotes Entel ya importados se rellenan desde el Excel original; no hace falta volver a importar la campaña."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
