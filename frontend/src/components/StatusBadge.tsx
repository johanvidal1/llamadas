// Shared utility for status/disposition labels and colors
import {
  DISPOSITION_COLORS,
  getDispositionLabel,
  LEGACY_DISPOSITION_LABELS,
  RESPONSE_OPTIONS,
} from '../config/responseOptions'

export const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  PENDING: { label: 'Pendiente', classes: 'bg-gray-100 text-gray-700' },
  IN_PROGRESS: { label: 'En progreso', classes: 'bg-blue-100 text-blue-700' },
  INTERESTED: { label: 'Interesado', classes: 'bg-green-100 text-green-700' },
  CONVERTED: { label: 'Convertido', classes: 'bg-emerald-100 text-emerald-700' },
  NOT_INTERESTED: { label: 'No interesado', classes: 'bg-red-100 text-red-700' },
  DO_NOT_CALL: { label: 'No llamar', classes: 'bg-red-900/20 text-red-900' },
}

function classesFromColorKey(code: string): string {
  return (DISPOSITION_COLORS[code] ?? 'bg-gray-100 text-gray-700').split(' border-l-')[0]
}

export const DISPOSITION_CONFIG: Record<string, { label: string; classes: string }> = {
  ...Object.fromEntries(
    RESPONSE_OPTIONS.map((o) => [o.code, { label: o.label, classes: classesFromColorKey(o.code) }])
  ),
  ...Object.fromEntries(
    Object.keys(LEGACY_DISPOSITION_LABELS).map((code) => [
      code,
      { label: getDispositionLabel(code), classes: classesFromColorKey(code) },
    ])
  ),
}

export function getDispositionBorderColor(disposition: string): string {
  const full = DISPOSITION_COLORS[disposition] ?? 'bg-gray-100 text-gray-700 border-l-gray-300'
  const border = full.split(' ').find((c) => c.startsWith('border-l-'))
  return border ?? 'border-l-gray-300'
}

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, classes: 'bg-gray-100 text-gray-700' }
  return <span className={`badge ${cfg.classes}`}>{cfg.label}</span>
}

export function DispositionBadge({ disposition }: { disposition: string }) {
  const cfg = DISPOSITION_CONFIG[disposition] ?? {
    label: getDispositionLabel(disposition),
    classes: 'bg-gray-100 text-gray-700',
  }
  return <span className={`badge ${cfg.classes}`}>{cfg.label}</span>
}
