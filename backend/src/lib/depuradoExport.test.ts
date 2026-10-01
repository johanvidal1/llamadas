import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import * as XLSX from 'xlsx'
import {
  agentFirstName,
  assembleMovistarExportRows,
  companyImportOperator,
  countSharedWithOtherAgent,
  depuradoExportFilename,
  depuradoExportUnitKey,
  depuradoExportZipFilename,
  filterCompaniesByOperator,
  formatCompactTimestampInAppTz,
  isDepuradoCompany,
  toExportUnits,
  toImportContactosRows,
  toImportDetallePlanRows,
  toImportMobileRows,
  toMovistarProductosRows,
  toMovistarResumenRows,
  toMovistarUsuariosRows,
  uniqueExportFilenames,
  type LoadedDepuradoCompany,
} from './depuradoExport'
import { filenameOperatorTokens } from './operator'
import {
  applyOriginalRazonSocial,
  enrichDepuradoRowsFromOriginal,
  parseOriginalImportWorkbook,
  parseOriginalMovistarWorkbook,
  type OriginalMovistarSheetsByBatch,
  type OriginalSheetsByBatch,
} from './originalImportSheets'
import { isActiveNoContesta, isDepuradoNoContesta } from './companyDisposition'
import {
  CONTACTOS_IMPORT_COLUMNS,
  CONTACTOS_SHEET_NAME,
  DETALLE_PLAN_IMPORT_COLUMNS,
  DETALLE_PLAN_SHEET_NAME,
  IMPORT_SHEET_NAMES,
  MOVISTAR_IMPORT_SHEET_NAMES,
  MOVISTAR_PRODUCTOS_COLUMNS,
  MOVISTAR_PRODUCTOS_SHEET_NAME,
  MOVISTAR_RESUMEN_COLUMNS,
  MOVISTAR_RESUMEN_DUOS_ACTIVOS_COLUMN,
  MOVISTAR_RESUMEN_INTERNET_MOVIL_ACTIVOS_COLUMN,
  MOVISTAR_RESUMEN_MONOPRODUCTOS_ACTIVOS_COLUMN,
  MOVISTAR_RESUMEN_MOVILES_ACTIVOS_COLUMN,
  MOVISTAR_RESUMEN_SHEET_NAME,
  MOVISTAR_RESUMEN_TRIOS_ACTIVOS_COLUMN,
  MOVISTAR_USUARIOS_COLUMNS,
  MOVISTAR_USUARIOS_SHEET_NAME,
  PRODUCTOS_MOVIL_IMPORT_COLUMNS,
  PRODUCTOS_MOVIL_SHEET_NAME,
  buildImportWorkbook,
  buildMovistarImportWorkbook,
  formatImportContactPhone,
  formatImportFechaConsulta,
  formatImportMobilePhone,
  workbookSheetHeaders,
  workbookSheetNames,
  writeImportWorkbookBuffer,
  writeMovistarImportWorkbookBuffer,
} from './importWorkbook'
import { notRecoveredWhere } from './assignmentOrder'
import { parseExcel } from './parseFile'
import { buildZipBuffer } from './zipFiles'

const RICHARD_TEMPLATE_PATH =
  'C:/Users/franc/OneDrive/Desktop/Base Mediana-Grande actual Richard.xlsx'

function section(name: string) {
  console.log(`\n• ${name}`)
}

section('depurado selection matches isDepuradoNoContesta')
assert.equal(isDepuradoCompany('NO_CONTESTA', 2), true)
assert.equal(isDepuradoCompany('NO_ANSWER', 2), true)
assert.equal(isDepuradoCompany('NO_CONTESTA', 1), false)
assert.equal(isDepuradoCompany('NO_INTERESADO', 5), false)
assert.equal(isDepuradoCompany('VOLVER_A_LLAMAR', 2), false)
assert.equal(isDepuradoCompany(null, 2), false)
assert.equal(isActiveNoContesta('NO_CONTESTA', 1), true)
assert.equal(isDepuradoNoContesta('NO_CONTESTA', 2), isDepuradoCompany('NO_CONTESTA', 2))

section('recovered companies excluded from assignable pool')
assert.deepEqual(notRecoveredWhere, { recoveredAt: null })

section('filename America/Lima compact stamp')
const limaNoon = new Date('2026-09-13T18:48:00.000Z') // 13:48 America/Lima (UTC-5)
assert.equal(formatCompactTimestampInAppTz(limaNoon, 'America/Lima'), '20260913-1348')
assert.equal(
  depuradoExportFilename(limaNoon, 'Richard Vargas', 'ENTEL'),
  '20260913-1348_nocontestadodep_entel_Richard.xlsx'
)
assert.equal(
  depuradoExportFilename(limaNoon, 'Carlos Pérez', 'MOVISTAR'),
  '20260913-1348_nocontestadodep_movistar_Carlos.xlsx'
)
assert.equal(depuradoExportZipFilename(limaNoon), '20260913-1348_nocontestadodep.zip')
assert.equal(agentFirstName('María Elena Pérez'), 'María')
assert.equal(agentFirstName('  /  '), 'Agente')

const collided = uniqueExportFilenames(
  [
    { agentId: 'a1', agentName: 'Richard Uno', operator: 'ENTEL' },
    { agentId: 'a2', agentName: 'Richard Dos', operator: 'ENTEL' },
  ],
  limaNoon
)
assert.equal(collided.get('a1:ENTEL'), '20260913-1348_nocontestadodep_entel_Richard.xlsx')
assert.equal(collided.get('a2:ENTEL'), '20260913-1348_nocontestadodep_entel_Richard_2.xlsx')

const mixedNames = uniqueExportFilenames(
  [
    { agentId: 'c1', agentName: 'Carlos Rivera', operator: 'ENTEL' },
    { agentId: 'c1', agentName: 'Carlos Rivera', operator: 'MOVISTAR' },
  ],
  limaNoon
)
assert.equal(mixedNames.get('c1:ENTEL'), '20260913-1348_nocontestadodep_entel_Carlos.xlsx')
assert.equal(mixedNames.get('c1:MOVISTAR'), '20260913-1348_nocontestadodep_movistar_Carlos.xlsx')

section('shared-with-other-agent warning count')
const sharedCount = countSharedWithOtherAgent(
  [
    {
      contacts: [
        { assignment: { agentId: 'richard' } },
        { assignment: { agentId: 'maria' } },
      ],
    },
    { contacts: [{ assignment: { agentId: 'richard' } }] },
  ],
  'richard'
)
assert.equal(sharedCount, 1)

section('phone and fecha_consulta formatting')
assert.equal(formatImportContactPhone('987654321'), '+51 987654321')
assert.equal(formatImportContactPhone('+51987654321'), '+51 987654321')
assert.equal(formatImportMobilePhone('999111222'), '+51999111222')
assert.equal(formatImportMobilePhone('+51 999111222'), '+51999111222')
assert.equal(formatImportFechaConsulta(new Date('2026-01-15T00:00:00.000Z')), '2026-01-15')
assert.equal(
  formatImportFechaConsulta(new Date('2026-08-31T07:58:31.000Z')),
  '2026-08-31 07:58:31'
)

section('Richard sheet names and column order')
const companies: LoadedDepuradoCompany[] = [
  {
    id: 'c1',
    ruc: '20123456789',
    razonSocial: 'Demo SAC',
    notes: null,
    plan: null,
    importBatchId: 'batch-demo',
    importStatus: 'OK',
    fechaConsulta: new Date('2026-01-15T00:00:00.000Z'),
    importBatch: { operator: 'ENTEL' },
    contacts: [
      {
        id: 'ct1',
        nombre: 'Ana',
        telefono: '987654321',
        email: 'ana@demo.com',
        dni: '12345678',
        tipoContacto: 'Gerente',
        assignment: { agentId: 'richard' },
      },
      {
        id: 'ct2',
        nombre: 'Luis',
        telefono: '987654322',
        email: '',
        dni: null,
        tipoContacto: null,
        assignment: { agentId: 'richard' },
      },
    ],
    mobileLines: [
      {
        ruc: '20123456789',
        numeroTelefono: '999111222',
        estadoLinea: 'Activa',
        plan: 'Max',
        rentaBasica: '69.90',
        rentaBasicaConDesc: '49.90',
      },
    ],
  },
]

const contactos = toImportContactosRows(companies)
const mobiles = toImportMobileRows(companies)
const detalle = toImportDetallePlanRows(companies)
assert.equal(contactos.length, 2)
assert.deepEqual(Object.keys(contactos[0]), [...CONTACTOS_IMPORT_COLUMNS])
assert.equal(contactos[0].razon_social, 'Demo SAC')
assert.equal(contactos[0].telefono, '+51 987654321')
assert.equal(contactos[0].asset_asociado, '')
assert.equal(contactos[0].fecha_consulta, '2026-01-15')
assert.equal('agente_asignado' in contactos[0], false)
assert.equal('ultima_disposicion' in contactos[0], false)
assert.equal('total_llamadas' in contactos[0], false)

assert.deepEqual(Object.keys(mobiles[0]), [...PRODUCTOS_MOVIL_IMPORT_COLUMNS])
assert.equal(mobiles[0].numero_telefono, '+51999111222')
assert.equal(mobiles[0].razon_social, 'Demo SAC')
assert.equal(mobiles[0].iccid_sim, '')
assert.equal('renta_basica' in mobiles[0], false)
assert.equal('renta_basica_con_desc' in mobiles[0], false)

assert.deepEqual(Object.keys(detalle[0]), [...DETALLE_PLAN_IMPORT_COLUMNS])
assert.equal(detalle[0].renta_basica, '69.90')
assert.equal(detalle[0].renta_basica_con_desc, '49.90')
assert.equal(detalle[0].plan_detalle, 'Max')
assert.equal(detalle[0].imei, '')
assert.equal(detalle[0].linea_idx, '')

const wb = buildImportWorkbook(contactos, mobiles, detalle)
assert.deepEqual(workbookSheetNames(wb), [...IMPORT_SHEET_NAMES])
assert.deepEqual(workbookSheetNames(wb), ['Contactos', 'ProductosMovil', 'DetallePlan'])
assert.deepEqual(workbookSheetHeaders(wb, CONTACTOS_SHEET_NAME), [...CONTACTOS_IMPORT_COLUMNS])
assert.deepEqual(
  workbookSheetHeaders(wb, PRODUCTOS_MOVIL_SHEET_NAME),
  [...PRODUCTOS_MOVIL_IMPORT_COLUMNS]
)
assert.deepEqual(
  workbookSheetHeaders(wb, DETALLE_PLAN_SHEET_NAME),
  [...DETALLE_PLAN_IMPORT_COLUMNS]
)

const mobileSheetRows = XLSX.utils.sheet_to_json<Record<string, string>>(
  wb.Sheets[PRODUCTOS_MOVIL_SHEET_NAME],
  { defval: '' }
)
assert.equal('renta_basica' in mobileSheetRows[0], false)
assert.equal('renta_basica_con_desc' in mobileSheetRows[0], false)
assert.equal(mobileSheetRows[0].plan, 'Max')

const detalleSheetRows = XLSX.utils.sheet_to_json<Record<string, string>>(
  wb.Sheets[DETALLE_PLAN_SHEET_NAME],
  { defval: '' }
)
assert.equal(detalleSheetRows[0].renta_basica, '69.90')
assert.equal(detalleSheetRows[0].renta_basica_con_desc, '49.90')

section('DetallePlan always present even with 0 data rows')
const noRentaWb = buildImportWorkbook(contactos, [], [])
assert.deepEqual(workbookSheetNames(noRentaWb), [...IMPORT_SHEET_NAMES])
assert.deepEqual(
  workbookSheetHeaders(noRentaWb, DETALLE_PLAN_SHEET_NAME),
  [...DETALLE_PLAN_IMPORT_COLUMNS]
)
const emptyDetalleAoa = XLSX.utils.sheet_to_json<string[]>(
  noRentaWb.Sheets[DETALLE_PLAN_SHEET_NAME],
  { header: 1, defval: '' }
)
assert.equal(emptyDetalleAoa.length, 1)

section('Contactos/ProductosMovil razon_social from Company.razonSocial')
assert.equal(contactos[0].razon_social, companies[0].razonSocial)
assert.equal(mobiles[0].razon_social, companies[0].razonSocial)
assert.equal(detalle[0].razon_social, companies[0].razonSocial)

section('extras stay blank without original file')
const noOriginal: OriginalSheetsByBatch = new Map()
const blankEnriched = enrichDepuradoRowsFromOriginal(
  contactos,
  mobiles,
  detalle,
  companies,
  noOriginal
)
assert.equal(blankEnriched.contactos[0].asset_asociado, '')
assert.equal(blankEnriched.mobiles[0].iccid_sim, '')
assert.equal(blankEnriched.mobiles[0].numero_cuenta, '')
assert.equal(blankEnriched.detalle[0].imei, '')
assert.equal(blankEnriched.detalle[0].cuenta_facturacion, '')

section('original workbook fills extras and missing razon_social')
const missingRazon: LoadedDepuradoCompany[] = [
  {
    ...companies[0],
    id: 'c-empty-razon',
    ruc: '20999999999',
    razonSocial: null,
    importBatchId: 'batch-original',
    importBatch: { operator: 'ENTEL' },
    contacts: companies[0].contacts.map((c) => ({ ...c })),
    mobileLines: companies[0].mobileLines.map((line) => ({ ...line, ruc: '20999999999' })),
  },
]
const originalContactos = toImportContactosRows(missingRazon).map((row, idx) => ({
  ...row,
  ruc: '20999999999',
  razon_social: 'From Original SAC',
  asset_asociado: idx === 0 ? 'Asset-1' : 'Asset-2',
}))
const originalMobiles = toImportMobileRows(missingRazon).map((row) => ({
  ...row,
  ruc: '20999999999',
  razon_social: 'From Original SAC',
  iccid_sim: '89511710120956675000',
  numero_cuenta: '6.0000029806',
}))
const originalDetalle = toImportDetallePlanRows(missingRazon).map((row) => ({
  ...row,
  ruc: '20999999999',
  razon_social: 'From Original SAC',
  tipo_producto: 'Móvil',
  cuenta_facturacion: 'CF20999999999',
  imei: '868957070460805',
  modelo: 'ZTE BLADE',
}))
const originalBuffer = writeImportWorkbookBuffer(originalContactos, originalMobiles, originalDetalle)
const parsedOriginal = parseOriginalImportWorkbook(originalBuffer)
const originals: OriginalSheetsByBatch = new Map([['batch-original', parsedOriginal]])
const resolved = applyOriginalRazonSocial(missingRazon, originals)
assert.equal(resolved[0].razonSocial, 'From Original SAC')

const recoveredRows = enrichDepuradoRowsFromOriginal(
  toImportContactosRows(resolved),
  toImportMobileRows(resolved),
  toImportDetallePlanRows(resolved),
  resolved,
  originals
)
assert.equal(recoveredRows.contactos[0].razon_social, 'From Original SAC')
assert.equal(recoveredRows.contactos[0].asset_asociado, 'Asset-1')
assert.equal(recoveredRows.contactos[1].asset_asociado, 'Asset-2')
assert.equal(recoveredRows.mobiles[0].razon_social, 'From Original SAC')
assert.equal(recoveredRows.mobiles[0].iccid_sim, '89511710120956675000')
assert.equal(recoveredRows.mobiles[0].numero_cuenta, '6.0000029806')
assert.equal(recoveredRows.detalle[0].imei, '868957070460805')
assert.equal(recoveredRows.detalle[0].cuenta_facturacion, 'CF20999999999')
assert.equal(recoveredRows.detalle[0].tipo_producto, 'Móvil')
assert.equal(recoveredRows.detalle[0].modelo, 'ZTE BLADE')
assert.equal(recoveredRows.detalle[0].renta_basica, '69.90')

section('DB razon_social wins over original; extras still join')
const dbWinsCompanies: LoadedDepuradoCompany[] = [
  {
    ...companies[0],
    importBatchId: 'batch-original',
    ruc: '20999999999',
    razonSocial: 'CRM Razon SAC',
    importBatch: { operator: 'ENTEL' },
    mobileLines: companies[0].mobileLines.map((line) => ({ ...line, ruc: '20999999999' })),
  },
]
const dbWinsResolved = applyOriginalRazonSocial(dbWinsCompanies, originals)
assert.equal(dbWinsResolved[0].razonSocial, 'CRM Razon SAC')
const dbWinsRows = enrichDepuradoRowsFromOriginal(
  toImportContactosRows(dbWinsResolved),
  toImportMobileRows(dbWinsResolved),
  toImportDetallePlanRows(dbWinsResolved),
  dbWinsResolved,
  originals
)
assert.equal(dbWinsRows.contactos[0].razon_social, 'CRM Razon SAC')
assert.equal(dbWinsRows.mobiles[0].razon_social, 'CRM Razon SAC')
assert.equal(dbWinsRows.mobiles[0].iccid_sim, '89511710120956675000')

section('razon_social backfill from ProductosMovil when Contactos original is blank')
const mobileOnlyRazonBuffer = writeImportWorkbookBuffer(
  originalContactos.map((row) => ({ ...row, razon_social: '' })),
  originalMobiles,
  originalDetalle.map((row) => ({ ...row, razon_social: '' }))
)
const mobileOnlyOriginals: OriginalSheetsByBatch = new Map([
  ['batch-original', parseOriginalImportWorkbook(mobileOnlyRazonBuffer)],
])
const fromMobile = applyOriginalRazonSocial(missingRazon, mobileOnlyOriginals)
assert.equal(fromMobile[0].razonSocial, 'From Original SAC')
const fromMobileRows = toImportContactosRows(fromMobile)
assert.equal(fromMobileRows[0].razon_social, 'From Original SAC')
assert.equal(toImportMobileRows(fromMobile)[0].razon_social, 'From Original SAC')

section('filename operator tokens are segments')
assert.deepEqual(
  filenameOperatorTokens('20260913-1348_nocontestadodep_entel_Richard.xlsx'),
  ['ENTEL']
)
assert.deepEqual(
  filenameOperatorTokens('20260913-1348_nocontestadodep_movistar_Carlos.xlsx'),
  ['MOVISTAR']
)
assert.deepEqual(filenameOperatorTokens('20260913-1348_nocontestadodep.zip'), [])
assert.equal(depuradoExportUnitKey('c1', 'MOVISTAR'), 'c1:MOVISTAR')

section('same RUC on two operators stays as two export units')
const movistarTwin: LoadedDepuradoCompany = {
  ...companies[0],
  id: 'c-movistar',
  importBatchId: 'batch-movistar',
  notes: 'Portal ok',
  plan: 'Plan Max',
  importBatch: { operator: 'MOVISTAR' },
}
assert.equal(companyImportOperator(companies[0]), 'ENTEL')
assert.equal(companyImportOperator({ importBatch: null }), 'ENTEL')
assert.equal(companyImportOperator(movistarTwin), 'MOVISTAR')

const mixedUnits = toExportUnits([
  {
    agentId: 'carlos',
    agentName: 'Carlos Rivera',
    companies: [companies[0], movistarTwin],
  },
])
assert.equal(mixedUnits.length, 2)
assert.equal(mixedUnits[0].operator, 'ENTEL')
assert.equal(mixedUnits[1].operator, 'MOVISTAR')
assert.equal(mixedUnits[0].companies[0].ruc, mixedUnits[1].companies[0].ruc)
assert.equal(mixedUnits[0].companies.length, 1)
assert.equal(mixedUnits[1].companies.length, 1)

const onlyMovistar = filterCompaniesByOperator([companies[0], movistarTwin], 'MOVISTAR')
assert.equal(onlyMovistar.length, 1)
assert.equal(onlyMovistar[0].id, 'c-movistar')
const recoveredMovistarUnits = toExportUnits([
  { agentId: 'carlos', agentName: 'Carlos Rivera', companies: onlyMovistar },
])
assert.equal(recoveredMovistarUnits.length, 1)
assert.equal(recoveredMovistarUnits[0].operator, 'MOVISTAR')
assert.equal(filterCompaniesByOperator([companies[0], movistarTwin], 'ENTEL')[0].id, 'c1')
assert.equal(filterCompaniesByOperator([companies[0], movistarTwin]).length, 2)

section('Movistar reconstruct uses import template sheets, never Entel names')
const movistarResumen = toMovistarResumenRows([movistarTwin])
const movistarUsuarios = toMovistarUsuariosRows([movistarTwin])
const movistarProductos = toMovistarProductosRows([movistarTwin])
assert.deepEqual(Object.keys(movistarResumen[0]), [...MOVISTAR_RESUMEN_COLUMNS])
assert.equal(movistarResumen[0].n_usuarios, '2')
assert.equal(movistarResumen[0].n_productos, '1')
assert.equal(movistarResumen[0].mensaje, 'Portal ok')
assert.equal(movistarResumen[0][MOVISTAR_RESUMEN_MOVILES_ACTIVOS_COLUMN], '1')
assert.equal(movistarResumen[0][MOVISTAR_RESUMEN_INTERNET_MOVIL_ACTIVOS_COLUMN], '0')
assert.equal(movistarResumen[0][MOVISTAR_RESUMEN_DUOS_ACTIVOS_COLUMN], '0')
assert.equal(movistarResumen[0][MOVISTAR_RESUMEN_MONOPRODUCTOS_ACTIVOS_COLUMN], '0')
assert.equal(movistarResumen[0][MOVISTAR_RESUMEN_TRIOS_ACTIVOS_COLUMN], '0')
assert.equal('caja (Móviles / Internet / Dúos / Mono / Tríos)' in movistarResumen[0], false)
assert.equal(movistarUsuarios[0].celular, '987654321')
assert.equal(movistarUsuarios[0].nombres_apellidos, 'Ana')
assert.equal(movistarProductos[0].codigo_producto, '999111222')
assert.equal(movistarProductos[0].caja, 'Activa')
assert.equal(movistarProductos[0].plan, 'Max')

const movistarWb = buildMovistarImportWorkbook(movistarResumen, movistarUsuarios, movistarProductos)
assert.deepEqual(workbookSheetNames(movistarWb), [...MOVISTAR_IMPORT_SHEET_NAMES])
assert.deepEqual(workbookSheetNames(movistarWb), ['Resumen', 'Usuarios', 'Productos'])
assert.equal(movistarWb.Sheets[CONTACTOS_SHEET_NAME], undefined)
assert.deepEqual(workbookSheetHeaders(movistarWb, MOVISTAR_RESUMEN_SHEET_NAME), [
  ...MOVISTAR_RESUMEN_COLUMNS,
])
assert.deepEqual(workbookSheetHeaders(movistarWb, MOVISTAR_USUARIOS_SHEET_NAME), [
  ...MOVISTAR_USUARIOS_COLUMNS,
])
assert.deepEqual(workbookSheetHeaders(movistarWb, MOVISTAR_PRODUCTOS_SHEET_NAME), [
  ...MOVISTAR_PRODUCTOS_COLUMNS,
])

const entelWbNames = workbookSheetNames(wb)
assert.deepEqual(entelWbNames, ['Contactos', 'ProductosMovil', 'DetallePlan'])
assert.ok(!entelWbNames.includes('Resumen'))

section('Movistar original lote rows win over CRM reconstruct')
const originalMovistarBuffer = writeMovistarImportWorkbookBuffer(
  [
    {
      ...movistarResumen[0],
      razon_social: 'From Movistar Lote SAC',
      mensaje: 'lote mensaje',
      n_usuarios: '9',
      [MOVISTAR_RESUMEN_MOVILES_ACTIVOS_COLUMN]: '4',
      [MOVISTAR_RESUMEN_INTERNET_MOVIL_ACTIVOS_COLUMN]: '2',
      [MOVISTAR_RESUMEN_DUOS_ACTIVOS_COLUMN]: '1',
      [MOVISTAR_RESUMEN_MONOPRODUCTOS_ACTIVOS_COLUMN]: '3',
      [MOVISTAR_RESUMEN_TRIOS_ACTIVOS_COLUMN]: '5',
    },
  ],
  movistarUsuarios.map((row, idx) => ({
    ...row,
    razon_social: 'From Movistar Lote SAC',
    fecha_alta: idx === 0 ? '2024-01-01' : '',
    celular: '999000111',
  })),
  movistarProductos.map((row) => ({
    ...row,
    razon_social: 'From Movistar Lote SAC',
    codigo_producto: 'A\n999111222',
    cuenta_financiera: 'CF-99',
    subtipo_producto: 'Móvil',
  }))
)
const parsedMovistarOriginal = parseOriginalMovistarWorkbook(originalMovistarBuffer)
assert.ok(parsedMovistarOriginal)
const movistarOriginals: OriginalMovistarSheetsByBatch = new Map([
  ['batch-movistar', parsedMovistarOriginal!],
])
const assembled = assembleMovistarExportRows(
  [{ ...movistarTwin, razonSocial: null }],
  movistarOriginals
)
assert.equal(assembled.resumen[0].razon_social, 'From Movistar Lote SAC')
assert.equal(assembled.resumen[0].mensaje, 'lote mensaje')
assert.equal(assembled.resumen[0][MOVISTAR_RESUMEN_MOVILES_ACTIVOS_COLUMN], '4')
assert.equal(assembled.resumen[0][MOVISTAR_RESUMEN_INTERNET_MOVIL_ACTIVOS_COLUMN], '2')
assert.equal(assembled.resumen[0][MOVISTAR_RESUMEN_DUOS_ACTIVOS_COLUMN], '1')
assert.equal(assembled.resumen[0][MOVISTAR_RESUMEN_MONOPRODUCTOS_ACTIVOS_COLUMN], '3')
assert.equal(assembled.resumen[0][MOVISTAR_RESUMEN_TRIOS_ACTIVOS_COLUMN], '5')
assert.equal(assembled.usuarios[0].fecha_alta, '2024-01-01')
assert.equal(assembled.usuarios[0].celular, '999000111')
assert.equal(assembled.productos[0].cuenta_financiera, 'CF-99')
assert.equal(assembled.productos[0].codigo_producto, 'A\n999111222')

const reconstructedOnly = assembleMovistarExportRows([movistarTwin], new Map())
assert.equal(reconstructedOnly.usuarios[0].celular, '987654321')
assert.equal(reconstructedOnly.productos[0].codigo_producto, '999111222')
assert.equal(reconstructedOnly.usuarios[0].fecha_alta, '')
assert.equal(reconstructedOnly.resumen[0][MOVISTAR_RESUMEN_MOVILES_ACTIVOS_COLUMN], '1')
assert.equal(reconstructedOnly.resumen[0][MOVISTAR_RESUMEN_DUOS_ACTIVOS_COLUMN], '0')
assert.equal(reconstructedOnly.productos[0].caja, 'Activa')

section('Movistar Resumen reconstruct counts from Productos caja labels')
const mixedCajaTwin: LoadedDepuradoCompany = {
  ...movistarTwin,
  mobileLines: [
    {
      ruc: movistarTwin.ruc,
      numeroTelefono: '999111222',
      estadoLinea: 'Móviles activos',
      plan: 'Max',
      rentaBasica: null,
      rentaBasicaConDesc: null,
    },
    {
      ruc: movistarTwin.ruc,
      numeroTelefono: null,
      estadoLinea: 'Internet móvil activos',
      plan: 'Internet',
      rentaBasica: null,
      rentaBasicaConDesc: null,
    },
    {
      ruc: movistarTwin.ruc,
      numeroTelefono: null,
      estadoLinea: 'Dúos activos',
      plan: 'Duo',
      rentaBasica: null,
      rentaBasicaConDesc: null,
    },
    {
      ruc: movistarTwin.ruc,
      numeroTelefono: null,
      estadoLinea: 'Monoproductos activos',
      plan: 'Mono',
      rentaBasica: null,
      rentaBasicaConDesc: null,
    },
    {
      ruc: movistarTwin.ruc,
      numeroTelefono: null,
      estadoLinea: 'Tríos activos',
      plan: 'Trio',
      rentaBasica: null,
      rentaBasicaConDesc: null,
    },
  ],
}
const mixedResumen = toMovistarResumenRows([mixedCajaTwin])[0]
assert.equal(mixedResumen.n_productos, '5')
assert.equal(mixedResumen[MOVISTAR_RESUMEN_MOVILES_ACTIVOS_COLUMN], '1')
assert.equal(mixedResumen[MOVISTAR_RESUMEN_INTERNET_MOVIL_ACTIVOS_COLUMN], '1')
assert.equal(mixedResumen[MOVISTAR_RESUMEN_DUOS_ACTIVOS_COLUMN], '1')
assert.equal(mixedResumen[MOVISTAR_RESUMEN_MONOPRODUCTOS_ACTIVOS_COLUMN], '1')
assert.equal(mixedResumen[MOVISTAR_RESUMEN_TRIOS_ACTIVOS_COLUMN], '1')
assert.equal('caja' in mixedResumen, false)
assert.equal('caja (Móviles / Internet / Dúos / Mono / Tríos)' in mixedResumen, false)

section('Movistar original lote snake_case Resumen aliases')
const aliasWb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(
  aliasWb,
  XLSX.utils.json_to_sheet([
    {
      ruc: '20123456789',
      razon_social: 'Alias SAC',
      estado: 'OK',
      mensaje: 'ok',
      n_usuarios: '2',
      n_productos: '8',
      moviles_activos: '3',
      internet_movil_activos: '1',
      duos_activos: '2',
      monoproductos_activos: '0',
      trios_activos: '2',
      fecha_consulta: '2026-01-15',
    },
  ]),
  MOVISTAR_RESUMEN_SHEET_NAME
)
XLSX.utils.book_append_sheet(aliasWb, XLSX.utils.json_to_sheet([]), MOVISTAR_USUARIOS_SHEET_NAME)
XLSX.utils.book_append_sheet(aliasWb, XLSX.utils.json_to_sheet([]), MOVISTAR_PRODUCTOS_SHEET_NAME)
const parsedAlias = parseOriginalMovistarWorkbook(
  XLSX.write(aliasWb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
)
assert.ok(parsedAlias)
assert.equal(parsedAlias!.resumen[0][MOVISTAR_RESUMEN_MOVILES_ACTIVOS_COLUMN], '3')
assert.equal(parsedAlias!.resumen[0][MOVISTAR_RESUMEN_INTERNET_MOVIL_ACTIVOS_COLUMN], '1')
assert.equal(parsedAlias!.resumen[0][MOVISTAR_RESUMEN_DUOS_ACTIVOS_COLUMN], '2')
assert.equal(parsedAlias!.resumen[0][MOVISTAR_RESUMEN_MONOPRODUCTOS_ACTIVOS_COLUMN], '0')
assert.equal(parsedAlias!.resumen[0][MOVISTAR_RESUMEN_TRIOS_ACTIVOS_COLUMN], '2')
assert.equal('caja' in parsedAlias!.resumen[0], false)


if (existsSync(RICHARD_TEMPLATE_PATH)) {
  section('generated headers match Richard template exactly')
  const richard = XLSX.readFile(RICHARD_TEMPLATE_PATH)
  assert.deepEqual(richard.SheetNames, [...IMPORT_SHEET_NAMES])
  assert.deepEqual(workbookSheetHeaders(richard, CONTACTOS_SHEET_NAME), [...CONTACTOS_IMPORT_COLUMNS])
  assert.deepEqual(
    workbookSheetHeaders(richard, PRODUCTOS_MOVIL_SHEET_NAME),
    [...PRODUCTOS_MOVIL_IMPORT_COLUMNS]
  )
  assert.deepEqual(
    workbookSheetHeaders(richard, DETALLE_PLAN_SHEET_NAME),
    [...DETALLE_PLAN_IMPORT_COLUMNS]
  )
  assert.deepEqual(workbookSheetNames(wb), richard.SheetNames)
  assert.deepEqual(
    workbookSheetHeaders(wb, CONTACTOS_SHEET_NAME),
    workbookSheetHeaders(richard, CONTACTOS_SHEET_NAME)
  )
  assert.deepEqual(
    workbookSheetHeaders(wb, PRODUCTOS_MOVIL_SHEET_NAME),
    workbookSheetHeaders(richard, PRODUCTOS_MOVIL_SHEET_NAME)
  )
  assert.deepEqual(
    workbookSheetHeaders(wb, DETALLE_PLAN_SHEET_NAME),
    workbookSheetHeaders(richard, DETALLE_PLAN_SHEET_NAME)
  )
} else {
  console.log('\n• Richard template not found on disk; skipped live header compare')
}

async function runAsyncChecks() {
  section('parseExcel roundtrip of export buffer')
  const buffer = writeImportWorkbookBuffer(contactos, mobiles, detalle)
  const parsed = await parseExcel(buffer)
  assert.equal(parsed.companies.length, 1)
  assert.equal(parsed.companies[0].ruc, '20123456789')
  assert.equal(parsed.companies[0].contacts.length, 2)
  assert.equal(parsed.companies[0].contacts[0].telefono, '987654321')
  assert.equal(parsed.mobileLines.length, 1)
  assert.equal(parsed.mobileLines[0].numeroTelefono, '999111222')
  assert.equal(parsed.mobileLines[0].rentaBasica, '69.90')
  assert.equal(parsed.mobileLines[0].rentaBasicaConDesc, '49.90')
  assert.equal(parsed.mobileLines[0].plan, 'Max')

  section('Movistar export buffer roundtrips without Entel sheets')
  const movistarBuffer = writeMovistarImportWorkbookBuffer(
    movistarResumen,
    movistarUsuarios,
    movistarProductos
  )
  const parsedMovistar = await parseExcel(movistarBuffer, 'MOVISTAR')
  assert.equal(parsedMovistar.companies.length, 1)
  assert.equal(parsedMovistar.companies[0].ruc, '20123456789')
  assert.equal(parsedMovistar.companies[0].contacts[0].telefono, '987654321')
  assert.equal(parsedMovistar.mobileLines[0].numeroTelefono, '999111222')
  const movistarRead = XLSX.read(movistarBuffer, { type: 'buffer' })
  assert.deepEqual(movistarRead.SheetNames, ['Resumen', 'Usuarios', 'Productos'])
  assert.ok(!movistarRead.SheetNames.includes('Contactos'))

  section('zip contains one entry per agent file')
  const zip = buildZipBuffer([
    { name: '20260913-1348_nocontestadodep_entel_Richard.xlsx', data: buffer },
    { name: '20260913-1348_nocontestadodep_entel_Maria.xlsx', data: buffer },
  ])
  assert.ok(zip.length > 0)
  assert.equal(zip.readUInt32LE(0), 0x04034b50)
}

runAsyncChecks()
  .then(() => {
    console.log('\nAll depurado export tests passed.')
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
