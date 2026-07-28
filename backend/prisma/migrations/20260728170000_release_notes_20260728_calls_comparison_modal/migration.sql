-- Expand 2026-07-28 novedades: agent Dashboard calls comparison modal explaining %.
-- Idempotent upsert (keeps prior Jul 28 items from 20260728160000).

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
    "Dashboard (agente): el KPI principal es «Empresas asignadas» (ya no se muestra contactos como cifra principal).",
    "Dashboard (agente): «Llamadas realizadas» compara los dos últimos días con actividad (omite días en 0) y muestra el conteo de hoy (zona America/Lima).",
    "Dashboard (agente): al pulsar «Llamadas realizadas» se abre un modal con la comparación, la fórmula del % vs el día activo anterior y acceso al historial.",
    "Dashboard (agente): chips de lote muestran conteo de empresas; hasta 4 lotes recientes y el resto en «+N más».",
    "Asignaciones: la vista de agentes abre por defecto en Lista (si no hay preferencia guardada).",
    "Mis Clientes: el separador de Agendados indica «Arrastrar» para redimensionar el panel (escritorio)."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
