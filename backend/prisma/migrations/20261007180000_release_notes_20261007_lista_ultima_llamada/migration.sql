-- Novedades 2026-10-07: filtro Última llamada en Mis clientes Lista (merge with existing date).
-- Idempotent upsert. Notes only — no schema changes.
-- Keeps today's depurado / Guardar / pestañas bullets (max 4) and adds Lista date filter.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261007004',
  '2026-10-07',
  '7 de octubre de 2026',
  $json$[
    "En **Mis clientes**, **No contesta — depurado** exige dos **No contesta** en la empresa (no dos llamadas de cualquier tipo). **Sin llegada** y luego **No contesta** sigue en **Detalle**.",
    "Si cambia la respuesta del mismo contacto, un aviso pide confirmar la nueva (la anterior queda en el historial). No aparece en el primer guardado, ni si solo cambia notas o la agenda.",
    "En **Mis clientes**, **Guardar resultado** y **Guardar actualización** se quedan en el mismo contacto; las pestañas no cambian de orden (plantilla Excel) y cada una muestra su última respuesta.",
    "Lista en **Mis clientes** puede filtrar por **Hoy**, **Últimos 7 días** o un **rango** según la última llamada; el orden de la cola no cambia."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
