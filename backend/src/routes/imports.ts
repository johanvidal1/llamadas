import { Router, Response } from 'express'
import multer from 'multer'
import { prisma } from '../lib/prisma'
import { parseExcel, parseCsv } from '../lib/parseFile'
import { requireAdmin, AuthRequest } from '../middleware/auth'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'text/plain',
    ]
    if (
      allowed.includes(file.mimetype) ||
      file.originalname.match(/\.(xlsx?|csv)$/i)
    ) {
      cb(null, true)
    } else {
      cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls) o CSV (.csv)'))
    }
  },
})

// GET /api/imports — list all import batches
router.get('/', requireAdmin, async (_req: AuthRequest, res: Response) => {
  const batches = await prisma.importBatch.findMany({
    include: {
      importedBy: { select: { name: true } },
      _count: { select: { clients: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  res.json(batches)
})

// GET /api/imports/:id — batch detail
router.get('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const batch = await prisma.importBatch.findUnique({
    where: { id: req.params.id },
    include: {
      importedBy: { select: { name: true } },
      clients: {
        include: {
          assignment: { include: { agent: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'asc' },
        take: 200,
      },
      _count: { select: { clients: true } },
    },
  })
  if (!batch) {
    res.status(404).json({ error: 'Importación no encontrada' })
    return
  }
  res.json(batch)
})

// POST /api/imports — upload and parse file
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
    let parsed

    if (filename.match(/\.csv$/i)) {
      parsed = await parseCsv(buffer)
    } else {
      parsed = await parseExcel(buffer)
    }

    if (parsed.length === 0) {
      res.status(400).json({
        error:
          'No se encontraron registros válidos. Asegúrate de que el archivo tenga columnas reconocidas (nombre, telefono, etc.)',
      })
      return
    }

    const batch = await prisma.importBatch.create({
      data: {
        filename,
        totalRecords: parsed.length,
        importedById: req.user!.id,
        clients: {
          create: parsed,
        },
      },
      include: { _count: { select: { clients: true } } },
    })

    res.status(201).json({
      id: batch.id,
      filename: batch.filename,
      totalRecords: batch.totalRecords,
      imported: batch._count.clients,
    })
  }
)

// DELETE /api/imports/:id — delete a batch only if no agent has used it
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  const batch = await prisma.importBatch.findUnique({
    where: { id: req.params.id },
    include: {
      _count: {
        select: {
          clients: {
            where: {
              OR: [
                { assignment: { isNot: null } },
                { callLogs: { some: {} } },
                { callbacks: { some: {} } },
              ],
            },
          },
        },
      },
    },
  })

  if (!batch) {
    res.status(404).json({ error: 'Importación no encontrada' })
    return
  }

  if (batch._count.clients > 0) {
    res.status(400).json({
      error: `Este lote tiene ${batch._count.clients} registro(s) que ya fueron usados por agentes y no puede eliminarse.`,
    })
    return
  }

  // Delete all clients in the batch, then the batch itself
  await prisma.$transaction([
    prisma.client.deleteMany({ where: { importBatchId: req.params.id } }),
    prisma.importBatch.delete({ where: { id: req.params.id } }),
  ])

  res.json({ success: true })
})

export default router
