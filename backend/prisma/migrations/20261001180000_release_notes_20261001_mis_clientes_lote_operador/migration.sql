-- Novedades 2026-10-01: Mis clientes recuerda el lote por operador al switch.
-- Idempotent upsert. Notes only — no schema changes.
-- Replaces 1 oct items so Entel rename bullets stay and the lote-pin bullet is added.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261001001',
  '2026-10-01',
  '1 de octubre de 2026',
  $json$[
    "El operador casa es **Entel** (ya no Claro). Filtros y el switch dicen **Entel** | **Movistar** | **Todos**.",
    "**Importaciones**: el archivo debe llevar `_entel_` o `_movistar_` como segmento (separado por _ - .). `aclaracion.xlsx` no vale.",
    "La plantilla **Entel** es **Contactos** (obligatoria), **ProductosMovil** y **DetallePlan** (opcionales). CSV solo para Entel. Movistar no cambia.",
    "**Mis clientes** recuerda el lote en curso de cada operador (Entel / Movistar) al volver del switch; no hay que volver a elegirlo a mano."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
