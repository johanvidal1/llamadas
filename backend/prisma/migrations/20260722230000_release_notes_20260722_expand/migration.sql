-- Expand 2026-07-22 novedades: cobranza + Mis Clientes depurado/elevación + soporte.
-- Idempotent upsert (updates staging's short cobranza seed; inserts on fresh prod).

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20260722001',
  '2026-07-22',
  '22 de julio de 2026',
  $json$[
    "Cobranza: aviso a administradores según el ciclo de pago, con gracia editable (7 días por defecto) y gestión en Tenants → Cobranza.",
    "Mis Clientes: el header muestra el nombre del usuario.",
    "Mis Clientes: tras 2 intentos de «No contesta», el contacto queda como «No contesta — depurado».",
    "Agentes pueden ver la cola depurado con autorización de un administrador (confirmación + contraseña).",
    "Soporte: tickets desde la plataforma con formulario (¿Qué ocurrió? / ¿Qué esperabas? / Pasos a reproducir) e imágenes adjuntas.",
    "Agentes necesitan autorización de un administrador para abrir tickets de soporte."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
