-- Novedades 2026-09-30: Operador UI, agenda filtrada y depurado partido.
-- Idempotent upsert. Notes only — no schema changes.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20260930001',
  '2026-09-30',
  '30 de septiembre de 2026',
  $json$[
    "**Mis clientes** y **Agenda**: las citas se filtran por operador; si hay una cita del otro operador aparece un aviso. En el agente, barra verde Movistar al trabajar ese operador.",
    "**Clientes** y **Agenda Callbacks**: chips y filtro **Claro** / **Movistar**. En **Dashboard**, **Asignaciones** y **Reportes** el filtro es **Todos** | **Claro** | **Movistar**.",
    "**Importaciones**: el export **No contesta — depurado** sale partido por operador. Movistar usa plantilla **Resumen** / **Usuarios** / **Productos**; en **Resumen** van **Móviles** / **Internet** / **Dúos** / **Mono** / **Tríos** activos."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
