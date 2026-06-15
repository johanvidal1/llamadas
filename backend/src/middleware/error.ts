import { Request, Response, NextFunction } from 'express'
import { Prisma } from '@prisma/client'
import { ZodError } from 'zod'

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Datos inválidos',
      details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
    })
    return
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2003') {
      res.status(401).json({ error: 'Sesión inválida. Inicia sesión nuevamente.' })
      return
    }
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Registro duplicado' })
      return
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error('[Prisma Validation]', err.message)
    res.status(400).json({ error: 'Datos inválidos en la base de datos' })
    return
  }

  if (err instanceof Error) {
    const status = err.message.includes('Solo se permiten archivos') ? 400 : 500
    console.error('[Error]', err.message)
    res.status(status).json({ error: err.message })
    return
  }

  res.status(500).json({ error: 'Error interno del servidor' })
}
