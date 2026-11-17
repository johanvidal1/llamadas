-- Novedades 2026-11-17: propuesta mix Claro Empresas, descuentos 25/50, PDF.
-- Idempotent upsert of the day's complete items. Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261117001',
  '2026-11-17',
  '17 de noviembre de 2026',
  $json$[
    "**Mis clientes**: agentes y admin ven **Generar propuesta**; arma varios planes con líneas propias, descuento 25/50, PDF Claro Empresas.",
    "En **Importar datos**, el admin activa 25% y 50% en **Formato Cotización PDF**.",
    "En **Importar datos**, **Planes de propuesta** ya permite subir el Excel del catálogo (antes fallaba).",
    "El PDF cierra con ejecutivo y celular del perfil; **Beneficios adicionales** se editan o se quitan.",
    "El PDF añade el mapa de **Zonas de roaming internacional** (hoja 2 si no cabe; solo si el mix tiene roaming).",
    "El mapa de **Zonas de roaming internacional** queda más nítido.",
    "Logo **Claro empresas** más nítido, sin el fondo sucio en el encabezado."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
