-- Novedades 2026-10-06: modal segundo contacto; guardado no bloquea la cola.
-- Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261006001',
  '2026-10-06',
  '6 de octubre de 2026',
  $json$[
    "En **Mis clientes**, si la empresa ya tiene una llamada en otro contacto, un aviso pide confirmar el segundo registro (por ejemplo **No contesta** en más de un número); puedes marcar no volver a preguntar en esa empresa.",
    "**Guardar** deja de bloquear la cola: el botón vuelve en cuanto se graba el resultado y **Actualizando cola…** avisa en segundo plano."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
