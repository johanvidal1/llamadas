-- Novedades 2026-11-17: propuesta mix Claro Empresas, descuentos 25/50, PDF.
-- Idempotent upsert of the day's complete items. Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261117001',
  '2026-11-17',
  '17 de noviembre de 2026',
  $json$[
    "**Mis clientes**: **Generar propuesta** (admin) arma varios planes con líneas propias, descuento 25/50, PDF Claro Empresas.",
    "En **Importar datos**, el admin activa 25% y 50% en **Formato Cotización PDF**.",
    "El PDF cierra con ejecutivo y celular del perfil; **Beneficios adicionales** se editan o se quitan."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
