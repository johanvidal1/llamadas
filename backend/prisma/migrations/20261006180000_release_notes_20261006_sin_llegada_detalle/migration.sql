-- Novedades 2026-10-06: Sin llegada en Detalle; archivo solo en Otros; clic Lista.
-- Merge into existing 6 de octubre (max 4 bullets). Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261006001',
  '2026-10-06',
  '6 de octubre de 2026',
  $json$[
    "En **Mis clientes**, si la empresa ya tiene una llamada en otro contacto, un aviso pide confirmar el segundo registro (por ejemplo **No contesta** en más de un número); puedes marcar no volver a preguntar en esa empresa.",
    "**Guardar** deja de bloquear la cola: el botón vuelve en cuanto se graba el resultado y **Actualizando cola…** avisa en segundo plano.",
    "En **Detalle**, **Sin llegada** sigue en la cola de trabajo. **No interesado**, **cliente actual** y **RUC suspendido** quedan solo en **Otros** (fuera de Detalle). **No contesta** 2 veces pasa a **No contesta — depurado**.",
    "En **Lista**, el clic abre esa misma empresa (si el # es — sigue siendo la ficha correcta, no otra de la cola)."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
