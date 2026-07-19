/** Static release notes shown on the admin Dashboard. Newest first in `RELEASES`. */

export interface ReleaseNotes {
  /** ISO date key (YYYY-MM-DD). Must be unique across RELEASES. */
  date: string
  /** Spanish long-form label shown under the title / as section heading. */
  dateLabel: string
  items: string[]
}

/** Accumulating history - newest first. Append via: npm run release-notes */
export const RELEASES: ReleaseNotes[] = [
  {
    date: '2026-07-19',
    dateLabel: '19 de julio de 2026',
    items: [
      'Cola de Mis Clientes más estable: primero los registrados, pendientes al final.',
      'Tras guardar un resultado, la empresa permanece anclada y las notas siguen visibles.',
      '«Última registrada» lleva a la fila en la lista, con resalte breve para ubicarla.',
      'Indicador visual de leads nuevos y tipografía más clara en registrados.',
      'Barra de acciones en Detalle fija (ya no se desplaza con el aviso de RUC).',
      'Lista más limpia: sin encabezados por día ni badge «En progreso».',
      'Selección de fila sin tintado azul permanente; el resalte de salto dura unos segundos.',
    ],
  },
]
