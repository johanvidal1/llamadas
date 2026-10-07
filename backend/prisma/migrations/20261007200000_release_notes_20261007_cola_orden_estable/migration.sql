-- Novedades 2026-10-07: cola Detalle/Lista orden estable (createdAt), sin salto al guardar.
-- Idempotent upsert. Notes only — no schema changes.
-- Drops the oldest bullet of the day (depurado modal) to keep max 4; keeps Lista click + date filter.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261007006',
  '2026-10-07',
  '7 de octubre de 2026',
  $json$[
    "Si cambia la respuesta del mismo contacto, un aviso pide confirmar la nueva (la anterior queda en el historial). No aparece en el primer guardado, ni si solo cambia notas o la agenda.",
    "En **Mis clientes**, **Guardar resultado** y **Guardar actualización** se quedan en el mismo contacto; las pestañas no cambian de orden (plantilla Excel) y cada una muestra su última respuesta.",
    "En **Lista**, el filtro **Hoy** / **Últimos 7 días** / **rango** no cambia el orden de la cola; al pulsar un RUC (incluso **No contesta — depurado**) se abre esa empresa, no otra.",
    "En **Mis clientes** el número de **Detalle** ya no salta al guardar; el orden es el del lote. Pendientes vs registrados se filtran en **Lista**."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
