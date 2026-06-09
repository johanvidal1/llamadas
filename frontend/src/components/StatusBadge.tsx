// Shared utility for status/disposition labels and colors

export const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  PENDING: { label: 'Pendiente', classes: 'bg-gray-100 text-gray-700' },
  IN_PROGRESS: { label: 'En progreso', classes: 'bg-blue-100 text-blue-700' },
  INTERESTED: { label: 'Interesado', classes: 'bg-green-100 text-green-700' },
  CONVERTED: { label: 'Convertido', classes: 'bg-emerald-100 text-emerald-700' },
  NOT_INTERESTED: { label: 'No interesado', classes: 'bg-red-100 text-red-700' },
  DO_NOT_CALL: { label: 'No llamar', classes: 'bg-red-900/20 text-red-900' },
}

export const DISPOSITION_CONFIG: Record<string, { label: string; classes: string }> = {
  INTERESTED: { label: 'Interesado', classes: 'bg-green-100 text-green-700' },
  NOT_INTERESTED: { label: 'No interesado', classes: 'bg-red-100 text-red-700' },
  NO_ANSWER: { label: 'Sin respuesta', classes: 'bg-gray-100 text-gray-700' },
  BUSY: { label: 'Ocupado', classes: 'bg-yellow-100 text-yellow-700' },
  CALLBACK: { label: 'Callback agendado', classes: 'bg-blue-100 text-blue-700' },
  DO_NOT_CALL: { label: 'No llamar', classes: 'bg-red-200 text-red-900' },
  OTHER: { label: 'Otro', classes: 'bg-purple-100 text-purple-700' },
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, classes: 'bg-gray-100 text-gray-700' }
  return <span className={`badge ${cfg.classes}`}>{cfg.label}</span>
}

export function DispositionBadge({ disposition }: { disposition: string }) {
  const cfg = DISPOSITION_CONFIG[disposition] ?? { label: disposition, classes: 'bg-gray-100 text-gray-700' }
  return <span className={`badge ${cfg.classes}`}>{cfg.label}</span>
}
