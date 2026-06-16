import path from 'path'
import { Router, Response } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { parseExcel, parseCsv, ParsedCompany, ParseResult, MissingContactosSheetError } from '../lib/parseFile'
import { requireAdmin, AuthRequest } from '../middleware/auth'

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
      return { ...batch, ...counts }
    })
  )

  res.json(batchesWithCounts)
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
    const { sourceRowCount } = parseResult

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

    const batch = await prisma.$transaction(async (tx) => {
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

      for (const company of parsed) {
        const { contacts, name: _name, phone: _phone, email: _email, ...companyFields } = company
        await tx.company.create({
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
      }

      return created
    })

    res.status(201).json({
      id: batch.id,
      filename: batch.filename,
      displayName: batch.displayName,
      totalRecords: batch.totalRecords,
      sourceRowCount: batch.sourceRowCount,
      imported: parsed.length,
      withoutContacts,
      withoutPhone,
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
    await prisma.$transaction(async (tx) => {
      const companies = await tx.company.findMany({
        where: { importBatchId: batchId },
        select: { id: true },
      })
      const companyIds = companies.map((c) => c.id)

      if (companyIds.length > 0) {
        await tx.callback.deleteMany({ where: { companyId: { in: companyIds } } })
        await tx.callLog.deleteMany({ where: { companyId: { in: companyIds } } })
        await tx.company.deleteMany({ where: { importBatchId: batchId } })
      }

      await tx.importBatch.delete({ where: { id: batchId } })
    })

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
    throw err
  }
})

export default router
