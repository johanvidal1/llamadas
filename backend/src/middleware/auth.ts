import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma'

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    role: string
    name: string
    isSuperAdmin: boolean
  }
}

async function authenticateRequest(req: AuthRequest, res: Response): Promise<boolean> {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autorizado' })
    return false
  }

  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: string
      email: string
      role: string
      name: string
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: { id: true, email: true, role: true, name: true, active: true, isSuperAdmin: true },
    })
    if (!user || !user.active) {
      res.status(401).json({ error: 'Sesión inválida. Inicia sesión nuevamente.' })
      return false
    }
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
    }
    return true
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' })
    return false
  }
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!(await authenticateRequest(req, res))) return
  next()
}

export async function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!(await authenticateRequest(req, res))) return
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({ error: 'Acceso restringido a administradores' })
    return
  }
  next()
}
