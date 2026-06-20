/**
 * Bronte Print Agent — Print Route
 *
 * POST /print
 *
 * Accepts an HTML payload, renders it to PDF via Puppeteer,
 * and sends the PDF to the specified printer silently.
 *
 * Request body:
 * {
 *   "printerName": "EPSON TM-T82",
 *   "jobType": "kot",           // "kot" | "bill" | "raw" (future)
 *   "jobId": "order_123",
 *   "html": "<html>...</html>",
 *   "options": {                // optional
 *     "widthMm": 80,
 *     "heightMm": null,
 *     "margins": { "top": 0, "right": 0, "bottom": 0, "left": 0 }
 *   }
 * }
 */

const express = require('express')
const router = express.Router()
const { generatePDF, cleanupPDF } = require('../services/pdfService')
const { printPDF } = require('../services/printExecutor')
const { createRequestLogger } = require('../utils/logger')

router.post('/', async (req, res) => {
  const { printerName, jobType, jobId, html, options = {} } = req.body
  const log = createRequestLogger({
    requestId: req.requestId,
    printerName,
    jobId,
  })

  // ── Validation ──────────────────────────────────────────────────────────

  if (!printerName) {
    log.error('Print request missing printerName')
    return res.status(400).json({
      success: false,
      message: 'printerName is required',
      jobId,
    })
  }

  if (!html) {
    log.error('Print request missing html')
    return res.status(400).json({
      success: false,
      message: 'html content is required',
      jobId,
    })
  }

  log.info('Print request received', {
    jobType: jobType || 'unknown',
    htmlLength: html.length,
  })

  let pdfPath = null

  try {
    // ── Step 1: Generate PDF from HTML ──────────────────────────────────

    log.info('Generating PDF from HTML...')
    pdfPath = await generatePDF(html, {
      widthMm: options.widthMm || 80,
      heightMm: options.heightMm || null,
      margins: options.margins || { top: 0, right: 0, bottom: 0, left: 0 },
    })
    log.info('PDF generated successfully', { pdfPath })

    // ── Step 2: Send PDF to printer ─────────────────────────────────────

    log.info(`Sending job to printer: "${printerName}"`)
    await printPDF(pdfPath, printerName, { jobId })
    log.info('Job completed successfully', {
      printerName,
      jobId,
      jobType,
    })

    res.json({
      success: true,
      jobId,
      message: `Print job sent to "${printerName}"`,
    })
  } catch (err) {
    log.error('Print job failed', {
      error: err.message,
      stack: err.stack,
    })

    res.status(500).json({
      success: false,
      jobId,
      message: 'Print job failed',
      error: err.message,
    })
  } finally {
    // ── Step 3: Cleanup temp file ─────────────────────────────────────

    if (pdfPath) {
      cleanupPDF(pdfPath)
    }
  }
})

module.exports = router
