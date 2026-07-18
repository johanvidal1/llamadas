import 'express-async-errors'
import 'dotenv/config'
import express from 'express'
import cors from 'cors'

import { ensureArchivedAgent } from './lib/archivedAgent'
import { OPTICK_TENANT_ID } from './lib/tenant'
import { runWithTenant } from './lib/tenantContext'
import authRouter from './routes/auth'
import usersRouter from './routes/users'
import importsRouter from './routes/imports'
import clientsRouter from './routes/clients'
import contactsRouter from './routes/contacts'
import assignmentsRouter from './routes/assignments'
import callsRouter from './routes/calls'
import callbacksRouter from './routes/callbacks'
import dashboardRouter from './routes/dashboard'
import adminRouter from './routes/admin'
import platformRouter from './routes/platform'
import contactRouter from './routes/contact'
import presenceRouter from './routes/presence'
import { errorHandler } from './middleware/error'
import { resolveTenant } from './middleware/tenant'

const app = express()
const PORT = process.env.PORT || 3001

app.set('trust proxy', 1)

function normalizeOrigin(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

function parseOriginList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((o) => normalizeOrigin(o))
    .filter(Boolean)
}

const parsedOrigins = parseOriginList(
  process.env.FRONTEND_URL || 'http://localhost:5173'
)
const extraOrigins = parseOriginList(process.env.CORS_EXTRA_ORIGINS)
const allowedOrigins = [...new Set([...parsedOrigins, ...extraOrigins])]

/** Same-origin tenant frontends: https://{slug}.optickcloud.com */
const TENANT_ORIGIN = /^https:\/\/[\w-]+\.optickcloud\.com$/

const localhostOnly = allowedOrigins.every(
  (o) => o.includes('localhost') || o.includes('127.0.0.1')
)
if (process.env.NODE_ENV === 'production' && localhostOnly) {
  console.warn(
    'FRONTEND_URL should list your production frontend origin(s), e.g. https://crm.optickcloud.com'
  )
}

console.log(
  `CORS allowed origins: [${allowedOrigins.join(', ')}] + *.optickcloud.com`
)

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true)
        return
      }
      const normalized = normalizeOrigin(origin)
      if (allowedOrigins.includes(normalized)) {
        callback(null, origin)
        return
      }
      if (TENANT_ORIGIN.test(normalized)) {
        callback(null, origin)
        return
      }
      if (
        process.env.NODE_ENV !== 'production' &&
        (normalized.startsWith('http://localhost:') ||
          normalized.startsWith('http://127.0.0.1:'))
      ) {
        callback(null, origin)
        return
      }
      callback(new Error('Not allowed by CORS'))
    },
    credentials: true,
  })
)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Health skips tenant resolution (load balancers / deploy checks)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use(resolveTenant)

// Routes (require req.tenant)
app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/imports', importsRouter)
app.use('/api/clients', clientsRouter)
app.use('/api/contacts', contactsRouter)
app.use('/api/assignments', assignmentsRouter)
app.use('/api/calls', callsRouter)
app.use('/api/callbacks', callbacksRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/admin', adminRouter)
app.use('/api/platform', platformRouter)
app.use('/api/contact', contactRouter)
app.use('/api/presence', presenceRouter)

// Global error handler (must be last)
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`🚀 API corriendo en http://localhost:${PORT}`)
  // Startup has no HTTP tenant; Optick is the only tenant until PR5 demo.
  void runWithTenant(OPTICK_TENANT_ID, () => ensureArchivedAgent()).catch((err) => {
    console.error('No se pudo asegurar el agente comodín:', err)
  })
})

export default app
