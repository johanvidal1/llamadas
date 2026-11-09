import 'dotenv/config'
import { decodeUploadFilename } from './decodeUploadFilename'
import { getPrismaBase } from './prisma'
import { OPTICK_TENANT_ID } from './tenant'

export type ImportBatchFilenameBackfillResult = {
  scanned: number
  updated: number
}

/**
 * One-shot / idempotent: persist latin1→utf8 repair of ImportBatch.filename
 * (and displayName if it also has mojibake). Tenant-scoped; does not delete lots.
 */
export async function backfillMojibakeImportBatchFilenames(): Promise<ImportBatchFilenameBackfillResult> {
  const db = getPrismaBase()
  const rows = await db.importBatch.findMany({
    where: { tenantId: OPTICK_TENANT_ID },
    select: { id: true, filename: true, displayName: true },
  })

  let updated = 0
  for (const row of rows) {
    const filename = decodeUploadFilename(row.filename)
    const displayName =
      row.displayName != null ? decodeUploadFilename(row.displayName) : row.displayName
    if (filename === row.filename && displayName === row.displayName) continue
    await db.importBatch.update({
      where: { id: row.id },
      data: { filename, displayName },
    })
    updated += 1
  }

  return { scanned: rows.length, updated }
}

if (require.main === module) {
  backfillMojibakeImportBatchFilenames()
    .then((result) => {
      console.log(
        `ImportBatch filename backfill: ${result.updated} actualizados, ${result.scanned} revisados`
      )
    })
    .catch((err) => {
      console.error('ImportBatch filename backfill falló:', err)
      process.exitCode = 1
    })
}
