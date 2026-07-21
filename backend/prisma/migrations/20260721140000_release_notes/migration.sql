-- Global Optick product release notes (visible to all tenants' admins; not tenant-scoped).
CREATE TABLE "ReleaseNote" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "dateLabel" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReleaseNote_date_key" ON "ReleaseNote"("date");
CREATE INDEX "ReleaseNote_date_idx" ON "ReleaseNote"("date");

-- Seed existing static history + today's product updates (idempotent on date).
INSERT INTO "ReleaseNote" ("id", "date", "dateLabel", "items", "createdAt", "updatedAt")
VALUES
  (
    'clreleasenote20260721001',
    '2026-07-21',
    '21 de julio de 2026',
    $json$[
      "Importaciones: historial agrupado por quincena, con nivel de uso (% de empresas asignadas).",
      "Importaciones: el historial muestra empresas (sin conteo de contactos) y solo la última quincena viene expandida.",
      "Corrección: importar Excel/CSV en local y servidores (boundary multipart + contexto de tenant tras multer)."
    ]$json$::jsonb,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'clreleasenote20260719001',
    '2026-07-19',
    '19 de julio de 2026',
    $json$[
      "En Mis Clientes (Detalle), el header muestra el termómetro de pendientes del lote en lugar de las flechas de navegación; el contador de posición es más legible. La navegación entre empresas sigue disponible en la barra inferior.",
      "Cola de Mis Clientes más estable: primero los registrados, pendientes al final.",
      "Tras guardar un resultado, la empresa permanece anclada y las notas siguen visibles.",
      "«Última registrada» lleva a la fila en la lista, con resalte breve para ubicarla.",
      "Indicador visual de leads nuevos y tipografía más clara en registrados.",
      "Barra de acciones en Detalle fija (ya no se desplaza con el aviso de RUC).",
      "Lista más limpia: sin encabezados por día ni badge «En progreso».",
      "Selección de fila sin tintado azul permanente; el resalte de salto dura unos segundos."
    ]$json$::jsonb,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
ON CONFLICT ("date") DO NOTHING;
