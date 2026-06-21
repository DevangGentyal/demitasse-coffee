/**
 * Bronte Print Agent — Printer Discovery Route
 *
 * GET /printers
 *
 * Returns all printers detected by the operating system.
 * Used by the billing frontend to populate the printer selection dropdown.
 */

const express = require('express')
const router = express.Router()
const { listSystemPrinters } = require('../services/printerService')
const { createRequestLogger } = require('../utils/logger')

router.get('/', async (req, res) => {
  const log = createRequestLogger({ requestId: req.requestId })

  try {
    log.info('Printer list requested')

    const printers = await listSystemPrinters()

    res.json({
      success: true,
      printers: printers.map((p) => ({
        name: p.name,
        ...(p.isDefault !== undefined && { isDefault: p.isDefault }),
      })),
    })
  } catch (err) {
    log.error('Failed to list printers', {
      error: err.message,
      stack: err.stack,
    })

    res.status(500).json({
      success: false,
      message: 'Failed to detect printers',
      error: err.message,
    })
  }
})

module.exports = router
