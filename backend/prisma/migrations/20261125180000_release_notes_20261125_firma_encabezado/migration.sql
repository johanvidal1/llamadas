-- Novedades 2026-11-25: firma en el encabezado rojo, Correo en el perfil, hoja compacta con mapa, columnas Tethering.
-- Later timestamp than 20261125170000 (schema) so migrate deploy applies this upsert last.
-- Unique per calendar day; ON CONFLICT (date) replaces items with the full-day copy.
-- Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20261125001',
  '2026-11-25',
  '25 de noviembre de 2026',
  $json$[
    "En **Generar propuesta** la firma pasa al encabezado rojo de la primera hoja, con nombre, cargo, correo y celular, y ya no va al final.",
    "El perfil tiene un campo **Correo** (si está vacío se usa el correo de acceso) que se muestra en la firma de la propuesta.",
    "La tabla de planes y los bloques se compactan para que el mapa de **Zonas de roaming internacional** entre en la primera hoja cuando hay pocos planes.",
    "El catálogo de **Planes de propuesta** acepta las columnas **Tethering Linea nueva** y **Tethering Portabilidad** (INTERNET)."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
