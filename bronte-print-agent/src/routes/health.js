/**
 * Bronte Print Agent — Health Check Route
 *
 * GET /health
 *
 * Returns agent status and version. Used by the billing frontend
 * to verify the agent is running and display connection status.
 */

const express = require('express')
const router = express.Router()
const { logger } = require('../utils/logger')

const AGENT_VERSION = '1.0.0'

router.get('/', (req, res) => {
  logger.info('Health check requested')

  res.json({
    status: 'ok',
    version: AGENT_VERSION,
    platform: process.platform,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  })
})

module.exports = router
