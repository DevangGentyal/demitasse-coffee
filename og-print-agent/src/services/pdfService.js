/**
 * Bronte Print Agent — PDF Generation Service
 *
 * Uses Puppeteer to render HTML content into a temporary PDF file.
 * The PDF is sized for thermal receipt printers (80mm width by default).
 */

const puppeteer = require('puppeteer')
const path = require('path')
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')
const { getTempDir, ensureDir } = require('../utils/paths')
const { logger } = require('../utils/logger')

// Persistent browser instance (launched once, reused across requests)
let browserInstance = null

/**
 * Get or launch the shared Puppeteer browser instance.
 *
 * @returns {Promise<import('puppeteer').Browser>}
 */
async function getBrowser() {
  if (browserInstance && browserInstance.connected) {
    return browserInstance
  }

  logger.info('Launching Puppeteer browser instance...')

  browserInstance = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
    ],
  })

  // Clean up reference if the browser closes unexpectedly
  browserInstance.on('disconnected', () => {
    logger.warn('Puppeteer browser disconnected unexpectedly')
    browserInstance = null
  })

  logger.info('Puppeteer browser launched successfully')
  return browserInstance
}

/**
 * Render HTML content to a temporary PDF file.
 *
 * @param {string} html        Full HTML document string
 * @param {object} [options]
 * @param {number} [options.widthMm=80]   Paper width in millimeters
 * @param {number} [options.heightMm]     Paper height in mm (null = auto)
 * @param {object} [options.margins]      Page margins in mm
 * @returns {Promise<string>}  Absolute path to the generated PDF file
 */
async function generatePDF(html, options = {}) {
  const {
    widthMm = 80,
    heightMm = null,
    margins = { top: 0, right: 0, bottom: 0, left: 0 },
  } = options

  const tempDir = ensureDir(getTempDir())
  const filename = `og-${uuidv4()}.pdf`
  const outputPath = path.join(tempDir, filename)

  logger.info('PDF generation started', { outputPath, widthMm, heightMm })

  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    // Set the HTML content
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 15000,
    })

    // Configure PDF options for thermal receipt sizing
    const pdfOptions = {
      path: outputPath,
      printBackground: true,
      preferCSSPageSize: false,
      width: `${widthMm}mm`,
      margin: {
        top: `${margins.top || 0}mm`,
        right: `${margins.right || 0}mm`,
        bottom: `${margins.bottom || 0}mm`,
        left: `${margins.left || 0}mm`,
      },
    }

    // If height is specified, use it; otherwise let Puppeteer auto-detect
    if (heightMm) {
      pdfOptions.height = `${heightMm}mm`
    }

    await page.pdf(pdfOptions)

    // Verify the file was created
    if (!fs.existsSync(outputPath)) {
      throw new Error('PDF file was not created')
    }

    const stats = fs.statSync(outputPath)
    logger.info('PDF generated successfully', {
      outputPath,
      sizeBytes: stats.size,
    })

    return outputPath
  } catch (err) {
    logger.error('PDF generation failed', {
      error: err.message,
      stack: err.stack,
    })

    // Clean up partial file
    try {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
    } catch (_) { /* ignore cleanup errors */ }

    throw err
  } finally {
    await page.close().catch(() => { /* ignore */ })
  }
}

/**
 * Delete a temporary PDF file.
 *
 * @param {string} filePath
 */
function cleanupPDF(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      logger.info('Temp PDF cleaned up', { filePath })
    }
  } catch (err) {
    logger.warn('Failed to clean up temp PDF', {
      filePath,
      error: err.message,
    })
  }
}

/**
 * Gracefully close the Puppeteer browser.
 * Call this on agent shutdown.
 */
async function closeBrowser() {
  if (browserInstance) {
    try {
      await browserInstance.close()
      logger.info('Puppeteer browser closed')
    } catch (err) {
      logger.warn('Error closing Puppeteer browser', { error: err.message })
    } finally {
      browserInstance = null
    }
  }
}

module.exports = {
  generatePDF,
  cleanupPDF,
  closeBrowser,
}
