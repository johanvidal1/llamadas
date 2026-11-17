import { NextFunction, Response } from 'express'
import { AuthRequest, requireAdmin, requireAuth } from '../middleware/auth'

/** Local-only. True only for 1/true/yes. Unset or any other value stays false (prod-like). */
export function parseEnvFlag(value: string | undefined): boolean {
  const v = String(value ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

export function isQuoteAgentEnabled(): boolean {
  return parseEnvFlag(process.env.QUOTE_AGENT_ENABLED)
}

/** requireAdmin unless QUOTE_AGENT_ENABLED is on, then any signed-in user. */
export function requireAdminOrLocalAgentQuotes(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (isQuoteAgentEnabled()) return requireAuth(req, res, next)
  return requireAdmin(req, res, next)
}
