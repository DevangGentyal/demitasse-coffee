/**
 * Bronte Print Agent — Test Print Route
 *
 * POST /print-test
 *
 * Generates a test receipt and prints it silently.
 * Used by the billing frontend to verify printer connectivity.
 *
 * Request body:
 * {
 *   "printerName": "EPSON TM-T82"
 * }
 */

const express = require('express')
const router = express.Router()
const { generatePDF, cleanupPDF } = require('../services/pdfService')
const { printPDF } = require('../services/printExecutor')
const { createRequestLogger } = require('../utils/logger')

/**
 * Generate a test receipt HTML.
 */
function buildTestReceiptHTML(printerName) {
  const now = new Date()
  const dateStr = now.toLocaleString()

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      color: #000;
      background: #fff;
      width: 80mm;
      padding: 4mm;
    }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .divider {
      border-top: 1px dashed #000;
      margin: 3mm 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      margin-bottom: 1mm;
    }
    h1 { font-size: 14px; margin-bottom: 2mm; }
    h2 { font-size: 12px; margin-bottom: 2mm; }
    .meta { font-size: 10px; color: #333; }
    .item { font-size: 11px; margin-bottom: 1.5mm; }
    .footer { font-size: 9px; color: #666; margin-top: 3mm; }
    .success-box {
      border: 2px solid #000;
      padding: 3mm;
      margin: 3mm 0;
      text-align: center;
      font-size: 12px;
      font-weight: 700;
     }
  </style>
</head>
<body>
  <div class="center">
    <h1>Demitasse Coffee</h1>
    <h2>═══ TEST PRINT ═══</h2>
  </div>

  <div class="divider"></div>

  <div class="row">
    <span class="bold">Printer:</span>
    <span>${printerName}</span>
  </div>
  <div class="row">
    <span class="bold">Date:</span>
    <span>${dateStr}</span>
  </div>
  <div class="row">
    <span class="bold">Agent:</span>
    <span>OG Print Agent v1.0.0</span>
  </div>

  <div class="divider"></div>

  <div class="center">
    <div class="item bold">SAMPLE KOT ITEMS</div>
  </div>

  <div class="row">
    <span>Cappuccino</span>
    <span>x2</span>
  </div>
  <div class="row">
    <span>Margherita Pizza</span>
    <span>x1</span>
  </div>
  <div class="row">
    <span>Garlic Bread</span>
    <span>x1</span>
  </div>
  <div class="row">
    <span>Iced Latte</span>
    <span>x1</span>
  </div>

  <div class="divider"></div>

  <div class="success-box">
    ✓ PRINTER WORKING
  </div>

  <div class="divider"></div>

  <div class="center footer">
    <p>This is a test page from OG Print Agent.</p>
    <p>If you can read this, your printer is configured correctly.</p>
    <p>— OG Print Agent —</p>
  </div>
</body>
</html>
`
}

router.post('/', async (req, res) => {
  const { printerName } = req.body
  const log = createRequestLogger({
    requestId: req.requestId,
    printerName,
    jobId: 'test-print',
  })

  if (!printerName) {
    log.error('Test print request missing printerName')
    return res.status(400).json({
      success: false,
      message: 'printerName is required',
    })
  }

  log.info('Test print requested')

  let pdfPath = null

  try {
    const html = buildTestReceiptHTML(printerName)

    log.info('Generating test receipt PDF...')
    pdfPath = await generatePDF(html, { widthMm: 80 })
    log.info('Test receipt PDF generated')

    log.info(`Sending test page to printer: "${printerName}"`)
    await printPDF(pdfPath, printerName, { jobId: 'test-print' })

    log.info('Test print completed successfully')

    res.json({
      success: true,
      message: `Test page sent to "${printerName}"`,
    })
  } catch (err) {
    log.error('Test print failed', {
      error: err.message,
      stack: err.stack,
    })

    res.status(500).json({
      success: false,
      message: 'Test print failed',
      error: err.message,
    })
  } finally {
    if (pdfPath) {
      cleanupPDF(pdfPath)
    }
  }
})

module.exports = router
