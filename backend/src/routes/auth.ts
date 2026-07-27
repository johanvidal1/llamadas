import path from 'path'
import fs from 'fs/promises'
import { createReadStream, existsSync } from 'fs'
import { Router, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import { z } from 'zod'
import { computeBillingStatus } from '../lib/billing'
import {
  ELEVATION_TTL_MS,
  signAdminElevationToken,
} from '../lib/adminElevation'
import {
  checkElevateRateLimit,
  recordElevateAttempt,
} from '../lib/elevateAdminRateLimit'
import { prisma } from '../lib/prisma'
import { runWithTenant } from '../lib/tenantContext'
import { requireAuth, AuthRequest } from '../middleware/auth'

const router = Router()

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const ALLOWED_AVATAR_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_AVATAR_MIME.has(file.mimetype)) {
      cb(null, true)
      return
    }
    cb(new Error('Solo se permiten imágenes JPG, PNG o WEBP'))
  },
})

function extForMime(mime: string): string {
  if (mime === 'image/png') return '.png'
  if (mime === 'image/webp') return '.webp'
  return '.jpg'
}

/** Resolve avatar path only under uploads/avatars/{userId}/ (blocks traversal). */
function resolveAvatarAbsolutePath(
  userId: string,
  relativePath: string
): string | null {
  const normalized = relativePath.replace(/\\/g, '/')
  const expectedPrefix = `uploads/avatars/${userId}/`
  if (
    !normalized.startsWith(expectedPrefix) ||
    normalized.includes('..') ||
    normalized.includes('\0')
  ) {
    return null
  }
  const absolute = path.resolve(process.cwd(), normalized)
  const allowedRoot = path.resolve(process.cwd(), 'uploads', 'avatars', userId)
  if (absolute !== allowedRoot && !absolute.startsWith(allowedRoot + path.sep)) {
    return null
  }
  return absolute
}

function publicUserFields(user: {
  id: string
  name: string
  email: string
  role: string
  isSuperAdmin: boolean
  isSystemOwner: boolean
  avatarUrl?: string | null
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isSuperAdmin: user.isSuperAdmin,
    isSystemOwner: user.isSystemOwner,
    hasAvatar: Boolean(user.avatarUrl),
  }
}

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
})

/** Password required; email optional (legacy path when provided). */
const elevateSchema = z.object({
  email: z.string().email('Email inválido').optional(),
  password: z.string().min(1, 'Contraseña requerida'),
})

// POST /api/auth/login
router.post('/login', async (req: AuthRequest, res: Response) => {
  const { email, password } = loginSchema.parse(req.body)

  if (!req.tenant) {
    res.status(400).json({ error: 'Tenant no resuelto' })
    return
  }

  const user = await prisma.user.findFirst({
    where: {
      email: email.toLowerCase(),
      tenantId: req.tenant.id,
      active: true,
    },
  })
  if (!user || user.isArchivedAgent) {
    res.status(401).json({ error: 'Credenciales incorrectas' })
    return
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    res.status(401).json({ error: 'Credenciales incorrectas' })
    return
  }

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      tenantId: user.tenantId,
      tokenVersion: user.tokenVersion,
    },
    process.env.JWT_SECRET as string,
    { expiresIn: '24h' }
  )

  res.json({
    token,
    user: publicUserFields(user),
  })
})

/**
 * POST /api/auth/elevate-admin
 * Authenticated user provides ACTIVE ADMIN password of the same tenant.
 * Body: `{ password }` (preferred) or `{ email, password }` (compat).
 * Without email, bcrypt is tried against all ACTIVE ADMIN users in the tenant.
 */
router.post('/elevate-admin', requireAuth, async (req: AuthRequest, res: Response) => {
  const { email, password } = elevateSchema.parse(req.body)

  if (!req.tenant || !req.user) {
    res.status(400).json({ error: 'Tenant no resuelto' })
    return
  }

  const rate = checkElevateRateLimit(req.tenant.id, req.user.id)
  if (!rate.ok) {
    res.status(429).json({
      error: 'Demasiados intentos. Espera e inténtalo de nuevo.',
      code: 'ADMIN_ELEVATION_RATE_LIMITED',
      retryAfterSec: rate.retryAfterSec,
    })
    return
  }

  const invalid = () => {
    recordElevateAttempt(req.tenant!.id, req.user!.id, false)
    res.status(401).json({
      error: 'Contraseña incorrecta',
      code: 'ADMIN_ELEVATION_INVALID',
    })
  }

  let admin:
    | { id: string; name: string; email: string; password: string }
    | null = null

  if (email) {
    const found = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        tenantId: req.tenant.id,
        role: 'ADMIN',
        active: true,
      },
    })
    if (!found) {
      invalid()
      return
    }
    const valid = await bcrypt.compare(password, found.password)
    if (!valid) {
      invalid()
      return
    }
    admin = found
  } else {
    const admins = await prisma.user.findMany({
      where: {
        tenantId: req.tenant.id,
        role: 'ADMIN',
        active: true,
      },
      select: { id: true, name: true, email: true, password: true },
    })
    for (const candidate of admins) {
      const valid = await bcrypt.compare(password, candidate.password)
      if (valid) {
        admin = candidate
        break
      }
    }
    if (!admin) {
      invalid()
      return
    }
  }

  recordElevateAttempt(req.tenant.id, req.user.id, true)

  const expiresAt = Date.now() + ELEVATION_TTL_MS
  const elevationToken = signAdminElevationToken({
    agentId: req.user.id,
    adminId: admin.id,
    tenantId: req.tenant.id,
  })

  res.json({
    elevationToken,
    expiresAt,
    expiresInMs: ELEVATION_TTL_MS,
    admin: { id: admin.id, name: admin.name, email: admin.email },
  })
})

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isSuperAdmin: true,
      isSystemOwner: true,
      active: true,
      avatarUrl: true,
    },
  })
  if (!user) {
    res.status(404).json({ error: 'Usuario no encontrado' })
    return
  }

  let billing = null
  if (req.tenant && user.role === 'ADMIN') {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenant.id },
      select: {
        id: true,
        slug: true,
        billingEnabled: true,
        billingDay: true,
        graceDays: true,
        paidThrough: true,
        billingContact: true,
      },
    })
    if (tenant) {
      billing = computeBillingStatus(tenant)
    }
  }

  const { avatarUrl: _avatarUrl, ...safe } = user
  res.json({ ...safe, hasAvatar: Boolean(_avatarUrl), billing })
})

// GET /api/auth/me/avatar — stream current user's avatar (auth required)
router.get('/me/avatar', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  })
  if (!user?.avatarUrl) {
    res.status(404).json({ error: 'Sin foto de perfil' })
    return
  }

  const absolutePath = resolveAvatarAbsolutePath(userId, user.avatarUrl)
  if (!absolutePath || !existsSync(absolutePath)) {
    res.status(404).json({ error: 'Archivo no encontrado' })
    return
  }

  const ext = path.extname(user.avatarUrl).toLowerCase()
  const mime =
    ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
  res.setHeader('Content-Type', mime)
  res.setHeader('Cache-Control', 'private, max-age=3600')
  createReadStream(absolutePath).pipe(res)
})

// POST /api/auth/me/avatar — multipart field "avatar"
// Multer leaves resolveTenant ALS; re-enter runWithTenant for Prisma.
router.post(
  '/me/avatar',
  requireAuth,
  (req, res, next) => {
    avatarUpload.single('avatar')(req, res, (err) => {
      if (err) {
        const msg =
          err instanceof multer.MulterError
            ? err.code === 'LIMIT_FILE_SIZE'
              ? 'La imagen debe pesar máximo 2 MB'
              : err.message
            : err instanceof Error
              ? err.message
              : 'Error al subir archivo'
        res.status(400).json({ error: msg })
        return
      }
      next()
    })
  },
  async (req: AuthRequest, res: Response) => {
    const tenantId = req.tenant?.id
    if (!tenantId) {
      res.status(400).json({ error: 'Tenant no resuelto' })
      return
    }

    await runWithTenant(tenantId, async () => {
      const file = req.file
      if (!file) {
        res.status(400).json({ error: 'Selecciona una imagen' })
        return
      }
      if (!ALLOWED_AVATAR_MIME.has(file.mimetype)) {
        res.status(400).json({ error: 'Solo se permiten imágenes JPG, PNG o WEBP' })
        return
      }
      if (file.size > MAX_AVATAR_BYTES) {
        res.status(400).json({ error: 'La imagen debe pesar máximo 2 MB' })
        return
      }

      const userId = req.user!.id
      const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: { avatarUrl: true },
      })

      const dir = path.join(process.cwd(), 'uploads', 'avatars', userId)
      await fs.mkdir(dir, { recursive: true })

      const ext = extForMime(file.mimetype)
      const filename = `avatar${ext}`
      const relativePath = path.join('uploads', 'avatars', userId, filename).replace(/\\/g, '/')
      const absolutePath = resolveAvatarAbsolutePath(userId, relativePath)
      if (!absolutePath) {
        res.status(500).json({ error: 'Ruta de avatar inválida' })
        return
      }
      await fs.writeFile(absolutePath, file.buffer)

      if (existing?.avatarUrl && existing.avatarUrl !== relativePath) {
        const oldAbs = resolveAvatarAbsolutePath(userId, existing.avatarUrl)
        if (oldAbs) await fs.unlink(oldAbs).catch(() => {})
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: relativePath },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isSuperAdmin: true,
          isSystemOwner: true,
          avatarUrl: true,
        },
      })

      res.json(publicUserFields(updated))
    })
  }
)

// DELETE /api/auth/me/avatar
router.delete('/me/avatar', requireAuth, async (req: AuthRequest, res: Response) => {
  const tenantId = req.tenant?.id
  if (!tenantId) {
    res.status(400).json({ error: 'Tenant no resuelto' })
    return
  }

  await runWithTenant(tenantId, async () => {
    const userId = req.user!.id
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    })
    if (user?.avatarUrl) {
      const abs = resolveAvatarAbsolutePath(userId, user.avatarUrl)
      if (abs) await fs.unlink(abs).catch(() => {})
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isSuperAdmin: true,
        isSystemOwner: true,
        avatarUrl: true,
      },
    })
    res.json(publicUserFields(updated))
  })
})

export default router
