-- Expand 2026-07-23 novedades: append Mis Clientes pending thermometer (keep assignments list bullet).
-- Idempotent upsert (updates staging seed from 20260723120000; inserts on fresh DBs).

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20260723001',
  '2026-07-23',
  '23 de julio de 2026',
  $json$[
    "Asignaciones: en «Estado de asignaciones por agente» puedes alternar Tarjetas | Lista, buscar por nombre o email, y recordar la vista preferida por administrador.",
    "Mis Clientes (Detalle/Lista): termómetro de pendientes con degradado verde→rojo según avance; alerta visual suave al quedar ≤5 pendientes (lotes grandes)."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
