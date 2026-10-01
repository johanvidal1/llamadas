import { Prisma } from '@prisma/client'

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
 * Parse operator from API/query/DB. ENTEL | MOVISTAR are valid.
 * CLARO is mapped to ENTEL only when reading (rollout); it is not a filename token.
 */
export function parseImportOperator(value: unknown): ImportOperator | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  if (normalized === 'CLARO') return 'ENTEL'
  return isImportOperator(normalized) ? normalized : null
}

/** Historical / missing operator is Entel (home). MOVISTAR stays MOVISTAR. */
export function resolveImportOperator(value: unknown): ImportOperator {
  return value === 'MOVISTAR' ? 'MOVISTAR' : 'ENTEL'
}

/** Prisma where fragment for Company (and CallLog via company). Empty when unfiltered. */
export function companyOperatorWhere(operator: ImportOperator | null | undefined) {
  return operator ? { importBatch: { operator } } : {}
}

export function contactOperatorWhere(operator: ImportOperator | null | undefined) {
  return operator ? { company: { importBatch: { operator } } } : {}
}

export function assignmentOperatorWhere(operator: ImportOperator | null | undefined) {
  return operator ? { contact: { company: { importBatch: { operator } } } } : {}
}

export function callbackOperatorWhere(operator: ImportOperator | null | undefined) {
  return contactOperatorWhere(operator)
}

export function importBatchOperatorWhere(operator: ImportOperator | null | undefined) {
  return operator ? { operator } : {}
}

/**
 * SQL fragment for CallLog rows whose company lote matches operator.
 * Pass `Prisma.sql\`cl."companyId"\`` when the CallLog alias is `cl`.
 */
export function sqlCallLogCompanyOperatorFilter(
  operator: ImportOperator | null | undefined,
  companyIdColumn: Prisma.Sql = Prisma.sql`"companyId"`
): Prisma.Sql {
  if (!operator) return Prisma.empty
  return Prisma.sql`AND ${companyIdColumn} IN (
    SELECT c.id FROM "Company" c
    INNER JOIN "ImportBatch" ib ON ib.id = c."importBatchId"
    WHERE ib.operator = ${operator}
  )`
}

/** Filename segment token (`_entel_` / `_movistar_`), not a substring. */
export function operatorFilenameSegment(operator: ImportOperator): 'entel' | 'movistar' {
  return operator === 'MOVISTAR' ? 'movistar' : 'entel'
}

export function operatorLabelEs(operator: ImportOperator): string {
  return operator === 'MOVISTAR' ? 'Movistar' : 'Entel'
}

/**
 * Operator tokens in a filename: segments split by `_`, `-`, `.` or string edges.
 * `PLANTILLA_movistar_20260928.xlsx` → Movistar; `aclaracion.xlsx` is not Entel.
 * `_claro_` is not a valid token.
 */
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

export class FilenameOperatorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FilenameOperatorError'
  }
}

export function assertFilenameMatchesOperator(
  filename: string,
  selected: ImportOperator
): void {
  const tokens = filenameOperatorTokens(filename)
  const selectedLabel = operatorLabelEs(selected)

  if (tokens.length === 0) {
    throw new FilenameOperatorError(
      `El nombre del archivo debe incluir «entel» o «movistar» como segmento (separado por _ - .), no como parte de otra palabra. Ejemplo: PLANTILLA_movistar_20260928.xlsx. «aclaracion.xlsx» no vale. Elige el operador o corrige el archivo.`
    )
  }

  if (tokens.length > 1) {
    throw new FilenameOperatorError(
      'El archivo menciona más de un operador (entel y movistar). Deja un solo segmento en el nombre o corrige la selección.'
    )
  }

  if (tokens[0] !== selected) {
    throw new FilenameOperatorError(
      `El archivo es de ${operatorLabelEs(tokens[0])} pero elegiste ${selectedLabel}. Corrige el nombre del archivo o la selección.`
    )
  }
}
