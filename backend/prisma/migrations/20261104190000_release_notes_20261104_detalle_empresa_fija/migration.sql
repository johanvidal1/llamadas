-- Novedades 2026-11-04: Empresa fija en Detalle (appends to Teléfono 2 same-day notes).
-- Idempotent upsert of the day's complete items. Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261104001',
  '2026-11-04',
  '4 de noviembre de 2026',
  $json$[
    "**Mis clientes**: en **Detalle**, **Teléfono 2** aparece a la derecha del teléfono principal (solo celulares reales) con Llamar y Copiar.",
    "En **Lista**, la columna **Teléfono 2** va después de **Teléfono**; si no hay segundo móvil se ve un guion. La búsqueda incluye **Teléfono 2**.",
    "Importaciones Entel: el segundo celular queda en el mismo contacto. Los lotes ya importados se rellenan desde el Excel original; no hace falta volver a importar la campaña.",
    "En **Detalle**, **Empresa** (RUC y razón social) queda fija al desplazarte para no perder de vista la compañía al cambiar de contacto o de RUC."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
