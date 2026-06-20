/**
 * Bronte Print Agent — Express Server
 *
 * Local HTTP server running on port 8585.
 * Provides endpoints for health checks, printer discovery, and silent printing.
 *
 * CORS is configured to allow requests from localhost and production domains.
 */

const express = require('express')
const cors = require('cors')
const { v4: uuidv4 } = require('uuid')
const { logger } = require('./utils/logger')

// ── Routes ──────────────────────────────────────────────────────────────────
const healthRouter = require('./routes/health')
const printersRouter = require('./routes/printers')
const printRouter = require('./routes/print')
const printTestRouter = require('./routes/printTest')

// ── Configuration ───────────────────────────────────────────────────────────
const PORT = process.env.BRONTE_PORT || 8585

const ALLOWED_ORIGINS = [
  // Local development
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  // Production domains (update these to match your actual domains)
  /\.demitasse\.cafe$/,
  /\.vercel\.app$/,
]

// ── App setup ───────────────────────────────────────────────────────────────

const app = express()

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server, Postman, curl)
      if (!origin) return callback(null, true)

      // Check against allowed origins
      const allowed = ALLOWED_ORIGINS.some((pattern) => {
        if (typeof pattern === 'string') return origin === pattern
        if (pattern instanceof RegExp) return pattern.test(origin)
        return false
      })

      if (allowed) {
        return callback(null, true)
      }

      logger.warn('CORS blocked request from origin', { origin })
      return callback(new Error(`CORS: Origin ${origin} not allowed`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

// Parse JSON bodies (with a generous limit for large HTML payloads)
app.use(express.json({ limit: '10mb' }))

// ── Request ID middleware ───────────────────────────────────────────────────
app.use((req, _res, next) => {
  req.requestId = uuidv4().split('-')[0] // Short 8-char ID for log readability
  next()
})

// ── Request logging middleware ──────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now()

  res.on('finish', () => {
    const duration = Date.now() - start
    logger.info(`${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`, {
      requestId: req.requestId,
    })
  })

  next()
})

// ── Mount routes ────────────────────────────────────────────────────────────
app.use('/health', healthRouter)
app.use('/printers', printersRouter)
app.use('/print', printRouter)
app.use('/print-test', printTestRouter)

// ── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
  })
})

// ── Global error handler ────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  logger.error('Unhandled server error', {
    error: err.message,
    stack: err.stack,
  })

  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message,
  })
})

// ── Server start ────────────────────────────────────────────────────────────

let serverInstance = null

/**
 * Start the Express server.
 *
 * @returns {Promise<import('http').Server>}
 */
function startServer() {
  return new Promise((resolve, reject) => {
    serverInstance = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Bronte Print Agent started on http://localhost:${PORT}`)
      resolve(serverInstance)
    })

    serverInstance.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use. Another instance may be running.`)
      }
      reject(err)
    })
  })
}

/**
 * Stop the Express server.
 */
function stopServer() {
  return new Promise((resolve) => {
    if (serverInstance) {
      serverInstance.close(() => {
        logger.info('Express server stopped')
        resolve()
      })
    } else {
      resolve()
    }
  })
}

/**
 * Get the port the server is running on.
 */
function getPort() {
  return PORT
}

module.exports = {
  startServer,
  stopServer,
  getPort,
}

// ── Standalone mode (when run directly without Electron) ────────────────────
if (require.main === module) {
  startServer()
    .then(() => {
      console.log(`\n  🖨️  Bronte Print Agent running at http://localhost:${PORT}\n`)
    })
    .catch((err) => {
      console.error('Failed to start server:', err.message)
      process.exit(1)
    })
}
