import path from 'path'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import { Router, Response } from 'express'
import multer from 'multer'
import { z } from 'zod'
import * as XLSX from 'xlsx'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { parseExcel, parseCsv, ParsedCompany, ParseResult, MissingContactosSheetError } from '../lib/parseFile'
import { requireAdmin, requireAuth, AuthRequest } from '../middleware/auth'
import { getDispositionLabel } from '../lib/responseOptions'
import { isSuperAdminOrOwner } from '../lib/userPermissions'
import { countUnassignedCompanies } from '../lib/assignmentOrder'
import { isValidMobileLineNumber, mobileDigits } from '../lib/mobileLine'

function parseFechaConsulta(raw?: string): Date | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  const iso = new Date(trimmed)
  if (!Number.isNaN(iso.getTime())) return iso

  const match = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (match) {
    const day = Number(match[1])
    const month = Number(match[2])
    let year = Number(match[3])
    if (year < 100) year += 2000
    const parsed = new Date(Date.UTC(year, month - 1, day))
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  return null
}

function toContactCreate(contacts: ParsedCompany['contacts']) {
  return contacts.map((c) => ({
    nombre: c.nombre.trim() || c.telefono || 'Sin nombre',
    tipoContacto: c.tipoContacto ?? null,
    dni: c.dni ?? null,
    email: c.email ?? null,
    telefono: c.telefono ?? null,
  }))
}

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'text/plain',
    ]
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx?|csv)$/i)) {
      cb(null, true)
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls) o CSV (.csv)'))
    }
  },
})

function normalizeFilename(name: string): string {
  return path
    .basename(name)
    .trim()
    .replace(/\s*\(\d+\)(?=\.[^.]+$)/, '')
    .toLowerCase()
}

function parseConfirmDuplicate(value: unknown): boolean {
  return value === true || value === 'true' || value === '1'
}

async function getBatchCounts(batchId: string) {
  const [companyCount, contactCount] = await Promise.all([
    prisma.company.count({ where: { importBatchId: batchId } }),
    prisma.contact.count({ where: { company: { importBatchId: batchId } } }),
  ])
  return { companyCount, contactCount }
}

async function findDuplicateBatch(filename: string, fileSizeBytes: number) {
  const normalized = normalizeFilename(filename)
  const batches = await prisma.importBatch.findMany({
    select: {
      id: true,
      filename: true,
      fileSizeBytes: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  const filenameMatch = batches.find((batch) => normalizeFilename(batch.filename) === normalized)
  if (filenameMatch) {
    const counts = await getBatchCounts(filenameMatch.id)
    const severity =
      filenameMatch.fileSizeBytes != null && filenameMatch.fileSizeBytes === fileSizeBytes
        ? ('filename_and_size' as const)
        : ('filename' as const)

    return {
      severity,
      existingBatch: {
        id: filenameMatch.id,
        filename: filenameMatch.filename,
        fileSizeBytes: filenameMatch.fileSizeBytes,
        createdAt: filenameMatch.createdAt,
        ...counts,
      },
    }
  }

  if (fileSizeBytes > 0) {
    const sizeMatch = batches.find(
      (batch) =>
        batch.fileSizeBytes != null &&
        batch.fileSizeBytes > 0 &&
        batch.fileSizeBytes === fileSizeBytes &&
        normalizeFilename(batch.filename) !== normalized
    )
    if (sizeMatch) {
      const counts = await getBatchCounts(sizeMatch.id)
      return {
        severity: 'size_only' as const,
        existingBatch: {
          id: sizeMatch.id,
          filename: sizeMatch.filename,
          fileSizeBytes: sizeMatch.fileSizeBytes,
          createdAt: sizeMatch.createdAt,
          ...counts,
        },
      }
    }
  }

  return null
}

// GET /api/imports
router.get('/', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const batches = await prisma.importBatch.findMany({
    include: {
      importedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const batchesWithCounts = await Promise.all(
    batches.map(async (batch) => {
      const counts = await getBatchCounts(batch.id)
      const callLogCount = await getBatchCallLogCount(batch.id)
      const unassignedCompanyCount = batch.blocked
        ? 0
        : (await countUnassignedCompanies(batch.id)).companies
      return {
        ...batch,
        ...counts,
        unassignedCompanyCount,
        hasOriginalFile: batch.storagePath != null,
        hasUpdates: callLogCount > 0,
      }
    })
  )

  res.json(batchesWithCounts)
})

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  IN_PROGRESS: 'En progreso',
  INTERESTED: 'Interesado',
  CONVERTED: 'Convertido',
  NOT_INTERESTED: 'No interesado',
  DO_NOT_CALL: 'No llamar',
}

function formatExportDate(date: Date | null | undefined): string {
  if (!date) return ''
  return date.toISOString().slice(0, 10)
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w\s.-]/g, '').replace(/\s+/g, '_').slice(0, 80)
}

const IMPORTS_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'imports')

function importFileExtension(filename: string): string {
  const match = filename.match(/\.(xlsx?|csv)$/i)
  return match ? match[0].toLowerCase() : '.xlsx'
}

function resolveStoragePath(storagePath: string): string {
  return path.join(process.cwd(), storagePath)
}

async function saveImportOriginalFile(
  batchId: string,
  buffer: Buffer,
  filename: string
): Promise<string> {
  const ext = importFileExtension(filename)
  await fs.mkdir(IMPORTS_UPLOAD_DIR, { recursive: true })
  const relativePath = path.join('uploads', 'imports', `${batchId}${ext}`)
  await fs.writeFile(resolveStoragePath(relativePath), buffer)
  return relativePath.replace(/\\/g, '/')
}

async function deleteImportOriginalFile(storagePath: string | null | undefined): Promise<void> {
  if (!storagePath) return
  const absolutePath = resolveStoragePath(storagePath)
  if (existsSync(absolutePath)) {
    await fs.unlink(absolutePath)
  }
}

async function getBatchCallLogCount(batchId: string): Promise<number> {
  return prisma.callLog.count({
    where: { company: { importBatchId: batchId } },
  })
}

// GET /api/imports/:id/export
router.get('/:id/export', requireAuth, async (req: AuthRequest, res: Response) => {
  const batchId = req.params.id
  const { agentId: agentIdQuery } = req.query as { agentId?: string }
  const isAgent = req.user!.role === 'AGENT'

  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    select: { id: true, filename: true, displayName: true },
  })

  if (!batch) {
    res.status(404).json({ error: 'Importación no encontrada' })
    return
  }

  const filterAgentId = isAgent ? req.user!.id : agentIdQuery || undefined

  const contactWhere: Prisma.ContactWhereInput = {
    company: { importBatchId: batchId },
  }
  if (filterAgentId) {
    contactWhere.assignment = { agentId: filterAgentId }
  }

  const contacts = await prisma.contact.findMany({
    where: contactWhere,
    include: {
      company: {
        include: {
          importBatch: { select: { filename: true, displayName: true } },
          callLogs: {
            orderBy: { calledAt: 'desc' },
            select: {
              disposition: true,
              aclaracion: true,
              notes: true,
              calledAt: true,
              contactId: true,
            },
          },
        },
      },
      assignment: { include: { agent: { select: { name: true } } } },
    },
    orderBy: [{ company: { createdAt: 'asc' } }, { createdAt: 'asc' }],
  })

  const exportDate = new Date()
  const batchLabel = batch.displayName?.trim() || batch.filename.replace(/\.[^.]+$/, '')

  const rows = contacts.map((contact) => {
    const company = contact.company
    const contactLogs = company.callLogs.filter((log) => log.contactId === contact.id)
    const lastCall = contactLogs[0]

    return {
      ruc: company.ruc,
      razon_social: company.razonSocial ?? '',
      nombre: contact.nombre,
      telefono: contact.telefono ?? '',
      email: contact.email ?? '',
      dni: contact.dni ?? '',
      tipo_contacto: contact.tipoContacto ?? '',
      estado: company.importStatus ?? '',
      fecha_consulta: formatExportDate(company.fechaConsulta),
      agente_asignado: contact.assignment?.agent.name ?? '',
      estado_campana: STATUS_LABELS[company.status] ?? company.status,
      ultima_disposicion: lastCall
        ? getDispositionLabel(lastCall.disposition)
        : '',
      ultima_aclaracion: lastCall?.aclaracion ?? '',
      fecha_ultima_llamada: lastCall ? formatExportDate(lastCall.calledAt) : '',
      notas_ultima_llamada: lastCall?.notes ?? '',
      total_llamadas: contactLogs.length,
      lote_importacion: batchLabel,
      fecha_exportacion: formatExportDate(exportDate),
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Contactos')

  const companyWhere: Prisma.CompanyWhereInput = { importBatchId: batchId }
  if (filterAgentId) {
    companyWhere.contacts = { some: { assignment: { agentId: filterAgentId } } }
  }

  const mobileLines = await prisma.mobileLine.findMany({
    where: { company: companyWhere },
    orderBy: [{ company: { createdAt: 'asc' } }, { createdAt: 'asc' }],
    include: { company: { select: { ruc: true } } },
  })

  const mobileRows = mobileLines.map((line) => ({
    ruc: line.ruc,
    numero_telefono: line.numeroTelefono ?? '',
    estado_linea: line.estadoLinea ?? '',
    plan: line.plan ?? '',
    estado: line.estado ?? '',
  }))

  const mobileWs = XLSX.utils.json_to_sheet(mobileRows)
  XLSX.utils.book_append_sheet(wb, mobileWs, 'productosmovil')

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  const suffix = filterAgentId && !isAgent ? '-agente' : isAgent ? '-mis-registros' : '-actualizado'
  const filename = `${sanitizeFilename(batchLabel)}${suffix}-${exportDate.toISOString().slice(0, 10)}.xlsx`

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(buffer)
})

// GET /api/imports/:id/original
router.get('/:id/original', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!isSuperAdminOrOwner(req.user!)) {
    res.status(403).json({ error: 'Acceso restringido' })
    return
  }

  const batch = await prisma.importBatch.findUnique({
    where: { id: req.params.id },
    select: { id: true, filename: true, storagePath: true },
  })

  if (!batch) {
    res.status(404).json({ error: 'Importación no encontrada' })
    return
  }

  if (!batch.storagePath) {
    res.status(404).json({ error: 'Archivo original no disponible' })
    return
  }

  const absolutePath = resolveStoragePath(batch.storagePath)
  if (!existsSync(absolutePath)) {
    res.status(404).json({ error: 'Archivo original no encontrado en el servidor' })
    return
  }

  const ext = importFileExtension(batch.filename)
  const contentType =
    ext === '.csv'
      ? 'text/csv'
      : ext === '.xls'
        ? 'application/vnd.ms-excel'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

  res.setHeader('Content-Type', contentType)
  res.setHeader('Content-Disposition', `attachment; filename="${batch.filename}"`)
  res.sendFile(absolutePath)
})

// GET /api/imports/:id
router.get('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const batch = await prisma.importBatch.findUnique({
    where: { id: req.params.id },
    include: {
      importedBy: { select: { name: true } },
      companies: {
        include: {
          contacts: {
            include: {
              assignment: { include: { agent: { select: { name: true } } } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        take: 200,
      },
    },
  })
  if (!batch) {
    res.status(404).json({ error: 'Importación no encontrada' })
    return
  }

  const counts = await getBatchCounts(batch.id)
  res.json({ ...batch, ...counts })
})

const patchImportSchema = z.object({
  blocked: z.boolean(),
})

// PATCH /api/imports/:id
router.patch('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const { blocked } = patchImportSchema.parse(req.body)

  const batch = await prisma.importBatch.findUnique({
    where: { id: req.params.id },
  })

  if (!batch) {
    res.status(404).json({ error: 'Importación no encontrada' })
    return
  }

  const updated = await prisma.importBatch.update({
    where: { id: req.params.id },
    data: { blocked },
    include: {
      importedBy: { select: { name: true } },
    },
  })

  const counts = await getBatchCounts(updated.id)
  res.json({ ...updated, ...counts })
})

// POST /api/imports
router.post(
  '/',
  requireAdmin,
  upload.single('file'),
  async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'Archivo requerido' })
      return
    }

    const buffer = req.file.buffer
    const filename = req.file.originalname
    const fileSizeBytes = req.file.size || buffer.length
    const confirmDuplicate = parseConfirmDuplicate(req.body?.confirmDuplicate)
    const displayNameRaw = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : ''
    const displayName = displayNameRaw || null

    if (!confirmDuplicate) {
      const duplicate = await findDuplicateBatch(filename, fileSizeBytes)
      if (duplicate) {
        res.status(409).json({
          error: 'duplicate_file_warning',
          severity: duplicate.severity,
          existingBatch: duplicate.existingBatch,
        })
        return
      }
    }

    let parseResult: ParseResult

    try {
      if (filename.match(/\.csv$/i)) {
        parseResult = await parseCsv(buffer)
      } else {
        parseResult = await parseExcel(buffer)
      }
    } catch (err) {
      if (err instanceof MissingContactosSheetError) {
        res.status(400).json({
          error: err.message,
          availableSheets: err.availableSheets,
        })
        return
      }
      throw err
    }

    const parsed = parseResult.companies
    const { sourceRowCount, mobileLines } = parseResult

    if (parsed.length === 0) {
      res.status(400).json({
        error: 'No se encontraron registros válidos. Asegúrate de que el archivo tenga las columnas: ruc, nombre, telefono, etc.',
      })
      return
    }

    const withoutContacts = parsed.filter((c) => c.contacts.length === 0).length
    const withoutPhone = parsed.filter(
      (c) => c.contacts.length === 0 || !c.contacts.some((ct) => ct.telefono)
    ).length

    const batch = await prisma.$transaction(
      async (tx) => {
        const created = await tx.importBatch.create({
          data: {
            filename,
            displayName,
            fileSizeBytes,
            sourceRowCount,
            totalRecords: parsed.length,
            importedById: req.user!.id,
          },
        })

        const rucToCompanyId = new Map<string, string>()
        for (const company of parsed) {
          const { contacts, name: _name, phone: _phone, email: _email, ...companyFields } = company
          const createdCompany = await tx.company.create({
            data: {
              ruc: companyFields.ruc,
              razonSocial: companyFields.razonSocial ?? null,
              importStatus: companyFields.estado ?? null,
              fechaConsulta: parseFechaConsulta(companyFields.fechaConsulta),
              plan: companyFields.plan ?? null,
              notes: companyFields.notes ?? null,
              importBatchId: created.id,
              contacts:
                contacts.length > 0 ? { create: toContactCreate(contacts) } : undefined,
            },
          })
          rucToCompanyId.set(companyFields.ruc, createdCompany.id)
        }

        if (mobileLines.length > 0) {
          await tx.mobileLine.deleteMany({ where: { importBatchId: created.id } })

          const mobileLineData = mobileLines
            .map((line) => {
              const companyId = rucToCompanyId.get(line.ruc)
              if (!companyId) return null
              return {
                companyId,
                ruc: line.ruc,
                numeroTelefono: line.numeroTelefono ?? null,
                estadoLinea: line.estadoLinea ?? null,
                plan: line.plan ?? null,
                estado: line.estado ?? null,
                importBatchId: created.id,
              }
            })
            .filter((row): row is NonNullable<typeof row> => row !== null)
            .filter((row) => isValidMobileLineNumber(row.numeroTelefono))

          const seenMobileKeys = new Set<string>()
          const dedupedMobileLineData = mobileLineData.filter((row) => {
            const key = `${row.companyId}:${mobileDigits(row.numeroTelefono)}`
            if (seenMobileKeys.has(key)) return false
            seenMobileKeys.add(key)
            return true
          })

          if (dedupedMobileLineData.length > 0) {
            await tx.mobileLine.createMany({ data: dedupedMobileLineData })
          }
        }

        return created
      },
      { timeout: 120_000, maxWait: 10_000 }
    )

    try {
      const storagePath = await saveImportOriginalFile(batch.id, buffer, filename)
      await prisma.importBatch.update({
        where: { id: batch.id },
        data: { storagePath },
      })
    } catch (err) {
      console.error('Failed to save import original file:', err)
    }

    res.status(201).json({
      id: batch.id,
      filename: batch.filename,
      displayName: batch.displayName,
      totalRecords: batch.totalRecords,
      sourceRowCount: batch.sourceRowCount,
      imported: parsed.length,
      withoutContacts,
      withoutPhone,
      mobileLineCount: mobileLines.length,
    })
  }
)

// DELETE /api/imports/:id
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const batchId = req.params.id

  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
  })

  if (!batch) {
    res.status(404).json({ error: 'Importación no encontrada' })
    return
  }

  const usedCount = await prisma.company.count({
    where: {
      importBatchId: batchId,
      OR: [
        { contacts: { some: { assignment: { is: {} } } } },
        { callLogs: { some: {} } },
        { callbacks: { some: {} } },
      ],
    },
  })

  if (usedCount > 0) {
    res.status(400).json({
      error: `Este lote tiene ${usedCount} registro(s) que ya fueron usados por agentes y no puede eliminarse.`,
    })
    return
  }

  try {
    // usedCount === 0 guarantees no assignments, call logs, or callbacks on this batch.
    await prisma.$transaction(
      async (tx) => {
        await tx.mobileLine.deleteMany({ where: { importBatchId: batchId } })
        await tx.company.deleteMany({ where: { importBatchId: batchId } })
        await tx.importBatch.delete({ where: { id: batchId } })
      },
      { timeout: 120_000, maxWait: 10_000 }
    )

    await deleteImportOriginalFile(batch.storagePath)

    res.json({ success: true })
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      (err.code === 'P2003' || err.code === 'P2014')
    ) {
      res.status(400).json({
        error: 'No se puede eliminar la importación porque tiene registros relacionados en uso.',
      })
      return
    }
    const message = err instanceof Error ? err.message : ''
    if (message.includes('Transaction already closed') || message.includes('timeout')) {
      res.status(503).json({
        error:
          'La importación es muy grande y la eliminación tardó demasiado. Intenta de nuevo; si persiste, contacta al administrador.',
      })
      return
    }
    throw err
  }
})

export default router
