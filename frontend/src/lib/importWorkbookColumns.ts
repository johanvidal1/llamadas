/**
 * Canonical Richard Excel headers, in template order.
 * Keep in sync with `backend/src/lib/importWorkbook.ts`
 * (`CONTACTOS_IMPORT_COLUMNS`, `PRODUCTOS_MOVIL_IMPORT_COLUMNS`,
 * `DETALLE_PLAN_IMPORT_COLUMNS`).
 */

export const CONTACTOS_IMPORT_COLUMNS = [
  'ruc',
  'razon_social',
  'nombre',
  'tipo_contacto',
  'dni',
  'email',
  'telefono',
  'asset_asociado',
  'estado',
  'fecha_consulta',
] as const

export const PRODUCTOS_MOVIL_IMPORT_COLUMNS = [
  'ruc',
  'razon_social',
  'numero_telefono',
  'estado_linea',
  'plan',
  'iccid_sim',
  'numero_cuenta',
  'estado',
  'fecha_consulta',
  'error_parse',
] as const

export const DETALLE_PLAN_IMPORT_COLUMNS = [
  'ruc',
  'razon_social',
  'numero_telefono',
  'estado_linea',
  'plan_detalle',
  'tipo_producto',
  'renta_basica',
  'renta_basica_con_desc',
  'cuenta_facturacion',
  'perfil_facturacion',
  'ultima_fecha_suspension',
  'motivos_suspension',
  'migrado',
  'fecha_creacion_orden',
  'imei',
  'lista_negra',
  'marca',
  'modelo',
  'numero_solicitud',
  'fecha_venta',
  'estado',
  'fecha_consulta',
  'error_detalle',
  'linea_idx',
] as const

export const CONTACTOS_SHEET_NAME = 'Contactos'
export const PRODUCTOS_MOVIL_SHEET_NAME = 'ProductosMovil'
export const DETALLE_PLAN_SHEET_NAME = 'DetallePlan'

export type ImportSheetName =
  | typeof CONTACTOS_SHEET_NAME
  | typeof PRODUCTOS_MOVIL_SHEET_NAME
  | typeof DETALLE_PLAN_SHEET_NAME
