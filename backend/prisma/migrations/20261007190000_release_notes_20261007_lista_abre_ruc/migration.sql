-- Novedades 2026-10-07: Lista abre el RUC pulsado (incluso depurado), no otra ficha de la cola.
-- Idempotent upsert. Notes only — no schema changes.
-- Folds into today's 4 bullets (depurado / Guardar / pestañas / Lista).

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261007005',
  '2026-10-07',
  '7 de octubre de 2026',
  $json$[
    "En **Mis clientes**, **No contesta — depurado** exige dos **No contesta** en la empresa (no dos llamadas de cualquier tipo). **Sin llegada** y luego **No contesta** sigue en **Detalle**.",
    "Si cambia la respuesta del mismo contacto, un aviso pide confirmar la nueva (la anterior queda en el historial). No aparece en el primer guardado, ni si solo cambia notas o la agenda.",
    "En **Mis clientes**, **Guardar resultado** y **Guardar actualización** se quedan en el mismo contacto; las pestañas no cambian de orden (plantilla Excel) y cada una muestra su última respuesta.",
    "En **Lista**, el filtro **Hoy** / **Últimos 7 días** / **rango** no cambia el orden de la cola; al pulsar un RUC (incluso **No contesta — depurado**) se abre esa empresa, no otra."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
