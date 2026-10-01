import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import {
  assertFilenameMatchesOperator,
  detectFilenameOperator,
  FilenameOperatorError,
  filenameOperatorTokens,
} from './operator'
import { parseExcel } from './parseFile'
import {
  classifyMovistarProductCaja,
  extractMsisdnFromCodigoProducto,
  isNonMobileMovistarProduct,
  parseMovistarExcel,
} from './parseMovistarWorkbook'

function section(name: string) {
  console.log(`\n• ${name}`)
}

function sheet(name: string, rows: Record<string, unknown>[]) {
  return { name, rows }
}

function workbookBuffer(sheets: { name: string; rows: Record<string, unknown>[] }[]): Buffer {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows)
    XLSX.utils.book_append_sheet(wb, ws, s.name)
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

section('filename token: segment anywhere, not substring')
assert.deepEqual(filenameOperatorTokens('PLANTILLA_movistar_20260928_124441.xlsx'), ['MOVISTAR'])
assert.equal(detectFilenameOperator('PLANTILLA_movistar_20260928_124441.xlsx'), 'MOVISTAR')
assert.equal(detectFilenameOperator('foo-entel-bar.xlsx'), 'ENTEL')
assert.equal(detectFilenameOperator('entel.xlsx'), 'ENTEL')
assert.equal(detectFilenameOperator('claro.xlsx'), null)
assert.equal(detectFilenameOperator('foo-claro-bar.xlsx'), null)
assert.equal(detectFilenameOperator('MOVISTAR_base.XLSX'), 'MOVISTAR')
assert.equal(detectFilenameOperator('aclaracion.xlsx'), null)
assert.equal(detectFilenameOperator('plantillaclaro.xlsx'), null)
assert.equal(detectFilenameOperator('plantillaentel.xlsx'), null)
assert.equal(detectFilenameOperator('base.xlsx'), null)
assert.deepEqual(filenameOperatorTokens('entel_movistar.xlsx').sort(), ['ENTEL', 'MOVISTAR'])
assert.equal(detectFilenameOperator('entel_movistar.xlsx'), null)
assert.deepEqual(filenameOperatorTokens('claro_movistar.xlsx'), ['MOVISTAR'])

section('filename must match UI selection')
assert.doesNotThrow(() =>
  assertFilenameMatchesOperator('PLANTILLA_movistar_20260928_124441.xlsx', 'MOVISTAR')
)
assert.doesNotThrow(() => assertFilenameMatchesOperator('lote-entel-01.xlsx', 'ENTEL'))
assert.throws(
  () => assertFilenameMatchesOperator('aclaracion.xlsx', 'ENTEL'),
  (err: unknown) => err instanceof FilenameOperatorError && /segmento/.test((err as Error).message)
)
assert.throws(
  () => assertFilenameMatchesOperator('lote_claro.xlsx', 'ENTEL'),
  (err: unknown) => err instanceof FilenameOperatorError && /segmento/.test((err as Error).message)
)
assert.throws(
  () => assertFilenameMatchesOperator('PLANTILLA_movistar_20260928.xlsx', 'ENTEL'),
  (err: unknown) =>
    err instanceof FilenameOperatorError &&
    /Movistar/.test((err as Error).message) &&
    /Entel/.test((err as Error).message)
)
assert.throws(
  () => assertFilenameMatchesOperator('lote_entel.xlsx', 'MOVISTAR'),
  FilenameOperatorError
)
assert.throws(
  () => assertFilenameMatchesOperator('sin_token.xlsx', 'MOVISTAR'),
  FilenameOperatorError
)

section('MSISDN from codigo_producto; non-mobile classification')
assert.equal(extractMsisdnFromCodigoProducto('A\r\n988511173'), '988511173')
assert.equal(extractMsisdnFromCodigoProducto('A\n999099265'), '999099265')
assert.equal(extractMsisdnFromCodigoProducto('A\r\n12753328'), undefined)
assert.equal(isNonMobileMovistarProduct('Dúos activos', 'DUO'), true)
assert.equal(isNonMobileMovistarProduct('Tríos activos', 'TRIO'), true)
assert.equal(isNonMobileMovistarProduct('Monoproductos activos', 'MONO'), true)
assert.equal(isNonMobileMovistarProduct('Internet móvil activos', 'MOVISTAR'), true)
assert.equal(isNonMobileMovistarProduct('Móviles activos', 'MOVISTAR'), false)
assert.equal(classifyMovistarProductCaja('Móviles activos'), 'moviles')
assert.equal(classifyMovistarProductCaja('Internet móvil activos'), 'internet')
assert.equal(classifyMovistarProductCaja('Dúos activos'), 'duos')
assert.equal(classifyMovistarProductCaja('Monoproductos activos'), 'mono')
assert.equal(classifyMovistarProductCaja('Tríos activos'), 'trios')
assert.equal(classifyMovistarProductCaja('Activa'), 'moviles')

section('VACIO skip + Usuarios mapping + never copy codigo onto contact')
const vacioBuffer = workbookBuffer([
  sheet('Resumen', [
    {
      ruc: '20111111111',
      razon_social: 'OK SAC',
      estado: 'OK',
      mensaje: '1 usuarios',
      fecha_consulta: '2026-09-28',
      'Móviles activos': 1,
      'Internet móvil activos': 0,
      'Dúos activos': 1,
      'Monoproductos activos': 0,
      'Tríos activos': 0,
    },
    {
      ruc: '20222222222',
      razon_social: '',
      estado: 'VACIO',
      mensaje: 'RUC no encontrado en Movistar',
    },
    {
      ruc: '20333333333',
      razon_social: 'Sin usuarios SAC',
      estado: 'OK',
      n_usuarios: 0,
      n_productos: 1,
    },
  ]),
  sheet('Usuarios', [
    {
      razon_social: 'OK SAC',
      ruc: '20111111111',
      nombres_apellidos: 'ANA PEREZ',
      dni: '11111111',
      correo: 'ana@ok.com',
      celular: '999111222',
      rol_canal_online: 'Decisor',
    },
    {
      ruc: '20222222222',
      nombres_apellidos: 'NO DEBE ENTRAR',
      celular: '999000000',
      rol_canal_online: 'Decisor',
    },
  ]),
  sheet('Productos', [
    {
      ruc: '20111111111',
      codigo_producto: 'A\r\n988511173',
      plan: 'Plan movil',
      subtipo_producto: 'MOVISTAR',
      caja: 'Móviles activos',
    },
    {
      ruc: '20111111111',
      codigo_producto: 'A\r\n12753328',
      plan: 'Duo Internet',
      subtipo_producto: 'DUO',
      caja: 'Dúos activos',
    },
    {
      ruc: '20333333333',
      codigo_producto: 'A\r\n987654321',
      plan: 'B2B Movistar',
      subtipo_producto: 'MOVISTAR',
      caja: 'Móviles activos',
    },
    {
      ruc: '20222222222',
      codigo_producto: 'A\r\n911111111',
      plan: 'No importar',
      subtipo_producto: 'MOVISTAR',
      caja: 'Móviles activos',
    },
  ]),
])

const parsed = parseMovistarExcel(vacioBuffer)
assert.equal(parsed.skippedVacioCount, 1)
assert.equal(parsed.companies.length, 2)
assert.equal(
  parsed.companies.some((c) => c.ruc === '20222222222'),
  false
)

const ok = parsed.companies.find((c) => c.ruc === '20111111111')
assert.ok(ok)
assert.equal(ok.hasUsuarios, true)
assert.equal(ok.contacts.length, 1)
assert.equal(ok.contacts[0].nombre, 'ANA PEREZ')
assert.equal(ok.contacts[0].email, 'ana@ok.com')
assert.equal(ok.contacts[0].telefono, '999111222')
assert.equal(ok.contacts[0].tipoContacto, 'Decisor')
assert.equal(ok.contacts[0].dni, '11111111')
assert.notEqual(ok.contacts[0].telefono, '988511173')
assert.equal(ok.plan, 'Duo Internet')
assert.equal(ok.notes, '1 usuarios')

const sinUsuario = parsed.companies.find((c) => c.ruc === '20333333333')
assert.ok(sinUsuario)
assert.equal(sinUsuario.hasUsuarios, false)
assert.equal(sinUsuario.contacts.length, 1)
assert.equal(sinUsuario.contacts[0].nombre, 'Sin nombre')
assert.equal(sinUsuario.contacts[0].telefono, undefined)
assert.equal(sinUsuario.phone, undefined)

assert.equal(parsed.mobileLines.length, 2)
assert.equal(
  parsed.mobileLines.some((l) => l.numeroTelefono === '988511173' && l.ruc === '20111111111'),
  true
)
assert.equal(
  parsed.mobileLines.some((l) => l.numeroTelefono === '987654321' && l.ruc === '20333333333'),
  true
)
assert.equal(
  parsed.mobileLines.some((l) => l.numeroTelefono === '12753328'),
  false
)
assert.equal(
  parsed.mobileLines.some((l) => l.ruc === '20222222222'),
  false
)

section('Decisor and Autorizado both become contacts; Excel order')
const rolesBuffer = workbookBuffer([
  sheet('Resumen', [{ ruc: '20999999999', razon_social: 'ROLES SAC', estado: 'OK' }]),
  sheet('Usuarios', [
    {
      ruc: '20999999999',
      nombres_apellidos: 'DEC ISOR',
      celular: '900000001',
      rol_canal_online: 'Decisor',
    },
    {
      ruc: '20999999999',
      nombres_apellidos: 'AUT ORIZADO',
      celular: '900000002',
      rol_canal_online: 'Autorizado',
    },
  ]),
  sheet('Productos', []),
])
const roles = parseMovistarExcel(rolesBuffer)
assert.equal(roles.companies[0].contacts.length, 2)
assert.equal(roles.companies[0].contacts[0].tipoContacto, 'Decisor')
assert.equal(roles.companies[0].contacts[1].tipoContacto, 'Autorizado')
assert.equal(roles.companies[0].contacts[1].telefono, '900000002')

section('Internet móvil 9-digit code is not a callable line')
const internetBuffer = workbookBuffer([
  sheet('Resumen', [{ ruc: '20444444444', razon_social: 'NET SAC', estado: 'OK' }]),
  sheet('Usuarios', []),
  sheet('Productos', [
    {
      ruc: '20444444444',
      codigo_producto: 'A\r\n968837140',
      plan: 'Plan Internet de Teletrabajo',
      subtipo_producto: 'MOVISTAR',
      caja: 'Internet móvil activos',
    },
  ]),
])
const internet = parseMovistarExcel(internetBuffer)
assert.equal(internet.mobileLines.length, 0)
assert.equal(internet.companies[0].plan, 'Plan Internet de Teletrabajo')
assert.equal(internet.companies[0].hasUsuarios, false)
assert.equal(internet.companies[0].contacts[0].telefono, undefined)

const REAL_PATH = 'C:/Users/franc/Downloads/PLANTILLA_movistar_20260928_124441.xlsx'
if (existsSync(REAL_PATH)) {
  section('real Movistar plantilla from Downloads')
  const real = parseMovistarExcel(readFileSync(REAL_PATH))
  assert.equal(real.skippedVacioCount, 11)
  assert.equal(real.companies.some((c) => c.ruc === '20612023817'), false)
  const calv = real.companies.find((c) => c.ruc === '20507717331')
  assert.ok(calv)
  assert.equal(calv.hasUsuarios, true)
  assert.equal(calv.contacts[0].telefono, '999099265')
  assert.equal(
    calv.contacts.some((ct) => ct.telefono === '988511173'),
    false
  )
  assert.equal(
    real.mobileLines.filter((l) => l.ruc === '20507717331').length,
    2
  )
  const wn = real.companies.find((c) => c.ruc === '20539114043')
  assert.ok(wn)
  assert.equal(wn.hasUsuarios, false)
  assert.equal(wn.contacts[0].telefono, undefined)
  assert.ok(real.mobileLines.some((l) => l.ruc === '20539114043'))
} else {
  console.log('\n• Real Movistar xlsx not on disk; skipped live parse')
}

async function runAsyncChecks() {
  section('parseExcel(operator) dispatches; Entel still requires Contactos')
  const movistarViaDispatch = await parseExcel(vacioBuffer, 'MOVISTAR')
  assert.equal(movistarViaDispatch.companies.length, 2)

  let entelMissing = false
  try {
    await parseExcel(vacioBuffer, 'ENTEL')
  } catch (err) {
    entelMissing = (err as { name?: string }).name === 'MissingContactosSheetError'
  }
  assert.equal(entelMissing, true)
}

runAsyncChecks()
  .then(() => {
    console.log('\nAll operator/Movistar parser tests passed.')
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
