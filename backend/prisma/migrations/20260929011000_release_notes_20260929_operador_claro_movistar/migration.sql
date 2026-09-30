-- Novedades 2026-09-29: Migración de Operador Claro / Movistar (fase 1).
-- Idempotent upsert.

INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES (
  'clreleasenote20260929001',
  '2026-09-29',
  '29 de septiembre de 2026',
  $json$[
    "Importaciones: hay que elegir operador **Claro** o **Movistar**. El archivo debe llevar ese token como segmento en el nombre (`claro` / `movistar`, separado por _ - .); p. ej. **PLANTILLA_movistar_20260928.xlsx**. `aclaracion.xlsx` no cuenta como Claro.",
    "Plantilla Movistar (**Resumen** / **Usuarios** / **Productos**): no se importan RUC con estado **VACIO**. El teléfono del contacto sale solo de **Usuarios.celular**; el MSISDN de 9 dígitos en **codigo_producto** va a líneas móviles. Empresas sin usuario se importan (contacto vacío + líneas) y se pueden asignar; sin teléfono no se guarda el resultado de la llamada.",
    "**Mis clientes**: al entrar hay que elegir **Claro** o **Movistar**. La cola FIFO/LIFO/Todos es solo de ese operador (el lote en curso se recuerda por operador). Si el mismo RUC está en lotes del otro operador se muestra un aviso; las fichas no se unen."
  ]$json$::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("date") DO UPDATE SET
  "dateLabel" = EXCLUDED."dateLabel",
  "items" = EXCLUDED."items",
  "updatedAt" = CURRENT_TIMESTAMP;
