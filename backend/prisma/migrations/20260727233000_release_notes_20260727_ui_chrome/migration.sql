-- Expand 2026-07-27 novedades: chrome UI (franja por rol, Ctrl+K, avatar, sidebar).
-- Idempotent upsert (keeps prior Informes bullet from 20260727180000).

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20260727001',
  '2026-07-27',
  '27 de julio de 2026',
  $json$[
    "Informes: el gráfico «Llamadas por agente» usa barras horizontales en móvil (nombres legibles) y rota las etiquetas en escritorio cuando hay muchos agentes.",
    "Navegación: franja superior por rol (verde administrador / azul agente), un poco más oscura para mejor contraste.",
    "Búsqueda y atajos: Ctrl+K (o ⌘K) abre la paleta para ir a secciones y acciones rápidas.",
    "Perfil: foto de avatar en la barra superior con indicador de presencia (en línea / reciente / offline).",
    "Sidebar: rail neutro claro sin logo duplicado en escritorio (la marca queda en la franja superior)."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
