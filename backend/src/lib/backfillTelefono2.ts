import { CONTACTOS_IMPORT_COLUMNS, rowFromColumns } from './importWorkbook'
import { matchOriginalContactoRow, readOriginalImportSheetsFromPath } from './originalImportSheets'
import { getPrismaBase } from './prisma'
import { asDistinctPeruMobile } from './telefono2'

export type Telefono2BackfillResult = {
  batches: number
  updated: number
  skipped: number
}

/**
 * One-shot / idempotent: fill Contact.telefono2 from Entel Contactos asset_asociado
 * in the stored original xlsx. Skips rows already set or equal to telefono.
 */
export async function backfillEntelTelefono2FromOriginals(): Promise<Telefono2BackfillResult> {
  const db = getPrismaBase()
  const batches = await db.importBatch.findMany({
    where: { operator: 'ENTEL', storagePath: { not: null } },
    select: { id: true, storagePath: true },
  })

  let updated = 0
  let skipped = 0

  for (const batch of batches) {
    const sheets = await readOriginalImportSheetsFromPath(batch.storagePath)
    if (!sheets || sheets.contactos.length === 0) continue

    const companies = await db.company.findMany({
      where: { importBatchId: batch.id },
      select: {
        ruc: true,
        contacts: {
          where: { OR: [{ telefono2: null }, { telefono2: '' }] },
          select: {
            id: true,
            nombre: true,
            telefono: true,
            dni: true,
            email: true,
            tipoContacto: true,
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    })

    for (const company of companies) {
      for (const contact of company.contacts) {
        const probe = rowFromColumns(CONTACTOS_IMPORT_COLUMNS, {
          ruc: company.ruc,
          nombre: contact.nombre,
          telefono: contact.telefono ?? '',
          dni: contact.dni ?? '',
          email: contact.email ?? '',
          tipo_contacto: contact.tipoContacto ?? '',
        })
        const original = matchOriginalContactoRow(probe, sheets.contactos)
        const telefono2 = asDistinctPeruMobile(original?.asset_asociado, contact.telefono)
        if (!telefono2) {
          skipped += 1
          continue
        }
        await db.contact.update({
          where: { id: contact.id },
          data: { telefono2 },
        })
        updated += 1
      }
    }
  }

  return { batches: batches.length, updated, skipped }
}
