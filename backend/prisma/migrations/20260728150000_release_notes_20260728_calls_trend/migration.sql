-- Expand 2026-07-28 novedades: agent Dashboard "Llamadas realizadas" trend (ayer vs anteayer).
-- Idempotent upsert (keeps prior Jul 28 items from 20260728140000).

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20260728001',
  '2026-07-28',
  '28 de julio de 2026',
  $json$[
    "Agentes: desde Ctrl+K (⌘K), al elegir un agente se abre Gestión de agentes, se desplaza a su fila y se resalta unos segundos (también si está en inactivos).",
    "Dashboard: las tarjetas KPI tienen ayuda (?) y enlazan a Asignaciones, Agentes, Callbacks o Historial (según el indicador).",
    "Dashboard: al pulsar «Tasa contacto empresas» se muestra la fórmula (con respuesta ÷ asignadas).",
    "Navegación: desde un KPI, las pantallas de destino muestran «Volver al Dashboard».",
    "Dashboard (agente): «Llamadas realizadas» muestra el total de ayer, la variación % vs anteayer y el conteo de hoy (días America/Lima)."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
