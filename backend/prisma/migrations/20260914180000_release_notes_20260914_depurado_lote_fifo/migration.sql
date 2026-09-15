-- Novedades 2026-09-14: export No contesta depurado, cola FIFO y UX Mis clientes.
-- Idempotent upsert.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20260914001',
  '2026-09-14',
  '14 de septiembre de 2026',
  $json$[
    "Importaciones: exportar **No contesta — depurado** por agente en Excel de 3 pestañas (**Contactos** / **ProductosMovil** / **DetallePlan**); un archivo por agente (ZIP si hay varios).",
    "Importaciones: al exportar se marcan recuperadas para no repetir ni devolverlas al pool; se conservan llamadas y métricas. Vista previa con conteos y aviso de RUC en otros agentes. Tras importar, acceso directo a **Asignaciones**.",
    "Cola de lotes: por defecto **Más antiguo primero** (FIFO: terminar el lote en curso; se recuerda al cerrar sesión). En **Gestión de agentes** se puede poner **Más reciente primero** o **Todos los lotes**; el agente puede cambiar de lote a mano.",
    "Mis clientes: modal de llamada más amplio; agenda también en respuestas positivas. El conmutador **Detalle** / **Tarjetas** / **Lista** queda fijo; el selector de lotes despliega la lista sin recortarse."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
