export const IMPORT_OPERATORS = ['ENTEL', 'MOVISTAR'] as const
export type ImportOperator = (typeof IMPORT_OPERATORS)[number]

const EXTENSION_SEGMENTS = new Set(['xlsx', 'xls', 'csv'])

const TOKEN_TO_OPERATOR: Record<string, ImportOperator> = {
  entel: 'ENTEL',
  movistar: 'MOVISTAR',
}

export function isImportOperator(value: unknown): value is ImportOperator {
  return value === 'ENTEL' || value === 'MOVISTAR'
}

/**
 * Parse operator from query/API. ENTEL | MOVISTAR are valid.
 * CLARO is mapped to ENTEL only when reading (open tabs during rollout).
 */
export function parseImportOperator(value: unknown): ImportOperator | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  if (normalized === 'CLARO') return 'ENTEL'
  return isImportOperator(normalized) ? normalized : null
}

/** URL / query helper: unknown values become Todos (`''`). CLARO maps to ENTEL. */
export function operatorFilterFromQuery(value: string | null | undefined): ImportOperator | '' {
  return parseImportOperator(value) ?? ''
}

/** Historical / missing operator is Entel (home). */
export function resolveImportOperator(value: unknown): ImportOperator {
  return value === 'MOVISTAR' ? 'MOVISTAR' : 'ENTEL'
}

export function operatorChipClassName(operator: ImportOperator): string {
  return operator === 'MOVISTAR' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
}

export function operatorLabelEs(operator: ImportOperator): string {
  return operator === 'MOVISTAR' ? 'Movistar' : 'Entel'
}

export function filenameOperatorTokens(filename: string): ImportOperator[] {
  const base = filename.replace(/\\/g, '/').split('/').pop() ?? filename
  const segments = base
    .split(/[_\-.]+/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0 && !EXTENSION_SEGMENTS.has(part))

  const found: ImportOperator[] = []
  const seen = new Set<ImportOperator>()
  for (const segment of segments) {
    const operator = TOKEN_TO_OPERATOR[segment]
    if (operator && !seen.has(operator)) {
      seen.add(operator)
      found.push(operator)
    }
  }
  return found
}

export function detectFilenameOperator(filename: string): ImportOperator | null {
  const tokens = filenameOperatorTokens(filename)
  return tokens.length === 1 ? tokens[0] : null
}

/** sessionStorage key for the agent's working operator on Mis clientes. */
export const MY_LEADS_OPERATOR_KEY = 'myLeadsOperator'

/** Same-tab signal so Layout can tint chrome without importing MyLeads. */
export const MY_LEADS_OPERATOR_CHANGED_EVENT = 'my-leads-operator-changed'

export function readStoredMyLeadsOperator(): ImportOperator | null {
  try {
    const stored = sessionStorage.getItem(MY_LEADS_OPERATOR_KEY)
    return parseImportOperator(stored)
  } catch {
    return null
  }
}

export function writeStoredMyLeadsOperator(op: ImportOperator): void {
  try {
    sessionStorage.setItem(MY_LEADS_OPERATOR_KEY, op)
  } catch {
    /* ignore quota / private mode */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(MY_LEADS_OPERATOR_CHANGED_EVENT, { detail: op }))
  }
}

/** Calling-context routes where agent header follows working operator. */
export function isAgentOperatorChromePath(pathname: string): boolean {
  return pathname.startsWith('/my-leads') || pathname.startsWith('/callbacks')
}

export function filenameOperatorError(
  filename: string,
  selected: ImportOperator | null
): string | null {
  if (!selected) {
    return 'Elige operador (Entel o Movistar) antes de importar.'
  }
  const tokens = filenameOperatorTokens(filename)
  const selectedLabel = operatorLabelEs(selected)
  if (tokens.length === 0) {
    return 'El nombre del archivo debe incluir «entel» o «movistar» como segmento (separado por _ - .), no como parte de otra palabra. Ejemplo: PLANTILLA_movistar_20260928.xlsx. «aclaracion.xlsx» no vale. Corrige el archivo o la selección.'
  }
  if (tokens.length > 1) {
    return 'El archivo menciona más de un operador (entel y movistar). Deja un solo segmento en el nombre o corrige la selección.'
  }
  if (tokens[0] !== selected) {
    return `El archivo es de ${operatorLabelEs(tokens[0])} pero elegiste ${selectedLabel}. Corrige el nombre del archivo o la selección.`
  }
  return null
}
