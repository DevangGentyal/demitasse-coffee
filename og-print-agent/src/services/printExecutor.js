/**
 * Bronte Print Agent — Print Executor
 *
 * Dispatches a PDF file to the OS print queue.
 *
 * Windows:  Uses `pdf-to-printer` (SumatraPDF under the hood)
 * macOS:    Uses `unix-print` (lp command)
 * Linux:    Uses `unix-print` (lp command)
 */

const { logger } = require('../utils/logger')

/**
 * Send a PDF file to the specified printer.
 *
 * @param {string} pdfPath      Absolute path to the PDF file
 * @param {string} printerName  OS printer name to send the job to
 * @param {object} [options]
 * @param {string} [options.jobId]  Optional job identifier for logging
 * @returns {Promise<void>}
 */
async function printPDF(pdfPath, printerName, options = {}) {
  const { jobId = 'unknown' } = options
  const platform = process.platform

  logger.info('Sending PDF to printer', {
    printerName,
    jobId,
    pdfPath,
    platform,
  })

  try {
    if (platform === 'win32') {
      await printWindows(pdfPath, printerName)
    } else {
      await printUnix(pdfPath, printerName)
    }

    logger.info('Job sent to printer successfully', {
      printerName,
      jobId,
    })
  } catch (err) {
    logger.error('Printing failed', {
      printerName,
      jobId,
      pdfPath,
      error: err.message,
      stack: err.stack,
    })
    throw err
  }
}

// ── Windows ─────────────────────────────────────────────────────────────────

async function printWindows(pdfPath, printerName) {
  const pdfToPrinter = require('pdf-to-printer')

  const printOptions = {
    printer: printerName,
    // SumatraPDF flags for silent printing
    sumatraPdfPath: undefined, // Uses bundled SumatraPDF
  }

  await pdfToPrinter.print(pdfPath, printOptions)
}

// ── macOS / Linux ───────────────────────────────────────────────────────────

async function printUnix(pdfPath, printerName) {
  const { print } = require('unix-print')

  // unix-print expects the printer name with underscores (CUPS convention)
  const cupsName = printerName.replace(/\s+/g, '_')

  await print(pdfPath, cupsName)
}

module.exports = {
  printPDF,
}
