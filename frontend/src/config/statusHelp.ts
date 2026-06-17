export type StatusHelpKey =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'INTERESTED'
  | 'CONVERTED'
  | 'NOT_INTERESTED'
  | 'DO_NOT_CALL'

export const STATUS_HELP: Record<
  StatusHelpKey,
  { title: string; meaning: string; activatesWhen: string }
> = {
  PENDING: {
    title: 'Pendiente',
    meaning: 'Sin contactar aún.',
    activatesWhen: 'Importado, sin llamada guardada.',
  },
  IN_PROGRESS: {
    title: 'En progreso',
    meaning: 'En seguimiento.',
    activatesWhen: 'Llamada guardada: no contesta, ocupado, callback u otro.',
  },
  INTERESTED: {
    title: 'Interesado',
    meaning: 'Quiere migrar.',
    activatesWhen: 'Llamada con resultado «Interesado en migrar».',
  },
  NOT_INTERESTED: {
    title: 'No interesado',
    meaning: 'Rechazó el contacto.',
    activatesWhen: 'Llamada con resultado «No interesado».',
  },
  CONVERTED: {
    title: 'Convertido',
    meaning: 'Ya migró / cerró venta.',
    activatesWhen: 'Próximamente desde MyLeads (aún no se asigna automáticamente).',
  },
  DO_NOT_CALL: {
    title: 'No llamar',
    meaning: 'No volver a llamar.',
    activatesWhen: 'Llamada con resultado «No llamar (lista negra)».',
  },
}

export const COMPANY_STATUS_AGGREGATE_NOTE =
  'El estado de la empresa se calcula a partir de sus contactos (RUC): si algún contacto está interesado, la empresa aparece interesada; si todos están pendientes, la empresa queda pendiente, etc.'

export function isStatusHelpKey(status: string): status is StatusHelpKey {
  return status in STATUS_HELP
}
