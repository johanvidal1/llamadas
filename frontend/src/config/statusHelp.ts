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
    activatesWhen:
      'Respuesta 0%: no contesta, volver a llamar, sin llegada al decisor, RUC suspendido o cliente actual.',
  },
  INTERESTED: {
    title: 'Interesado',
    meaning: 'Avance comercial (25%–90%).',
    activatesWhen:
      'Respuesta interesado, propuesta presentada, discusión de propuesta o a la espera de respuesta final.',
  },
  NOT_INTERESTED: {
    title: 'No interesado',
    meaning: 'Rechazó el contacto.',
    activatesWhen: 'Respuesta «NO INTERESADO».',
  },
  CONVERTED: {
    title: 'Convertido',
    meaning: 'Venta cerrada (100%).',
    activatesWhen: 'Respuesta «VENTA CERRADA».',
  },
  DO_NOT_CALL: {
    title: 'No llamar',
    meaning: 'No volver a llamar.',
    activatesWhen: 'Registros históricos con disposición legacy «No llamar».',
  },
}

export const COMPANY_STATUS_AGGREGATE_NOTE =
  'El estado de la empresa se calcula a partir de sus contactos (RUC): si algún contacto está interesado, la empresa aparece interesada; si todos están pendientes, la empresa queda pendiente, etc.'

export function isStatusHelpKey(status: string): status is StatusHelpKey {
  return status in STATUS_HELP
}
