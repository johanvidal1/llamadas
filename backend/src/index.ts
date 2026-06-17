import 'express-async-errors'
import 'dotenv/config'
import express from 'express'
import cors from 'cors'

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
import contactRouter from './routes/contact'
import { errorHandler } from './middleware/error'

const app = express()
const PORT = process.env.PORT || 3001

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true,
  })
)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Routes
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
app.use('/api/contact', contactRouter)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Global error handler (must be last)
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`🚀 API corriendo en http://localhost:${PORT}`)
})

export default app
