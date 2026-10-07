-- Novedades 2026-10-07: pestañas de contacto estables al guardar (merge with existing date).
-- Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261007003',
  '2026-10-07',
  '7 de octubre de 2026',
  $json$[
    "En **Mis clientes**, **No contesta — depurado** exige dos **No contesta** en la empresa (no dos llamadas de cualquier tipo). **Sin llegada** y luego **No contesta** sigue en **Detalle**.",
    "Si cambia la respuesta del mismo contacto, un aviso pide confirmar la nueva (la anterior queda en el historial). No aparece en el primer guardado, ni si solo cambia notas o la agenda.",
    "En **Mis clientes**, **Guardar resultado** y **Guardar actualización** se quedan en el mismo contacto; el cambio de persona es solo con las pestañas. Cada pestaña muestra su última respuesta.",
    "En **Mis clientes**, las pestañas de contacto no cambian de orden al guardar: quedan como en la plantilla Excel y el verde no las mueve."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
