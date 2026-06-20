/**
 * Bronte Print Agent — Structured Logging
 *
 * Uses Winston with daily rotating log files.
 *
 * Log format:
 *   [LEVEL] 2026-06-20T10:00:00.000Z | reqId | printerName | jobId | message
 *
 * Log location (platform-specific):
 *   Windows:  %APPDATA%/BrontePrintAgent/logs/
 *   macOS:    ~/Library/Application Support/BrontePrintAgent/logs/
 *   Linux:    ~/.bronte-print-agent/logs/
 */

const winston = require('winston')
const DailyRotateFile = require('winston-daily-rotate-file')
const path = require('path')
const { getLogDir, ensureDir } = require('./paths')

// Ensure log directory exists at import time
const LOG_DIR = ensureDir(getLogDir())

// ── Custom format ───────────────────────────────────────────────────────────

const bronteFormat = winston.format.printf(
  ({ level, message, timestamp, requestId, printerName, jobId, stack }) => {
    const parts = [
      `[${level.toUpperCase()}]`,
      timestamp,
    ]

    if (requestId) parts.push(`| req:${requestId}`)
    if (printerName) parts.push(`| printer:${printerName}`)
    if (jobId) parts.push(`| job:${jobId}`)

    parts.push(`| ${message}`)

    if (stack) parts.push(`\n${stack}`)

    return parts.join(' ')
  }
)

// ── Transports ──────────────────────────────────────────────────────────────

const fileRotateTransport = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: 'bronte-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize: '10m',
  maxFiles: '14d', // Keep 14 days of logs
  zippedArchive: true,
})

const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    bronteFormat
  ),
})

// ── Logger instance ─────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
    bronteFormat
  ),
  defaultMeta: {},
  transports: [
    fileRotateTransport,
    consoleTransport,
  ],
})

// ── Convenience helpers ─────────────────────────────────────────────────────

/**
 * Create a child logger with request-scoped metadata.
 *
 * @param {{ requestId?: string, printerName?: string, jobId?: string }} meta
 * @returns {winston.Logger}
 */
function createRequestLogger(meta = {}) {
  return logger.child(meta)
}

/**
 * Get the path to the current log directory (useful for "View Logs" in tray).
 */
function getLogPath() {
  return LOG_DIR
}

module.exports = {
  logger,
  createRequestLogger,
  getLogPath,
}
