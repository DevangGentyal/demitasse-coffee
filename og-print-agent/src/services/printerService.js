/**
 * Bronte Print Agent — Cross-Platform Printer Discovery
 *
 * Detects all printers installed on the operating system.
 *
 * Windows:  Uses PowerShell `Get-Printer` cmdlet
 * macOS:    Uses `lpstat -a` command
 * Linux:    Uses `lpstat -a` command
 */

const { exec } = require('child_process')
const { logger } = require('../utils/logger')

/**
 * List all printers detected by the operating system.
 *
 * @returns {Promise<Array<{ name: string, isDefault?: boolean }>>}
 */
async function listSystemPrinters() {
  const platform = process.platform
  logger.info('Printer scan started', { platform })

  try {
    let printers

    if (platform === 'win32') {
      printers = await listWindowsPrinters()
    } else if (platform === 'darwin') {
      printers = await listMacPrinters()
    } else {
      printers = await listLinuxPrinters()
    }

    printers.forEach((p) => {
      logger.info(`Found printer: ${p.name}`, { printerName: p.name })
    })

    logger.info(`Printer scan completed. Found ${printers.length} printer(s)`)
    return printers
  } catch (err) {
    logger.error('Printer scan failed', { error: err.message, stack: err.stack })
    throw err
  }
}

// ── Windows ─────────────────────────────────────────────────────────────────

function listWindowsPrinters() {
  return new Promise((resolve, reject) => {
    // PowerShell command that returns printer names as JSON
    const cmd = `powershell -NoProfile -Command "Get-Printer | Select-Object -Property Name, Default | ConvertTo-Json -Compress"`

    exec(cmd, { timeout: 10000 }, (err, stdout, stderr) => {
      if (err) {
        logger.error('Windows printer discovery failed', { error: err.message, stderr })
        return reject(new Error(`Failed to list printers: ${err.message}`))
      }

      try {
        const raw = stdout.trim()
        if (!raw) return resolve([])

        let parsed = JSON.parse(raw)
        // PowerShell returns a single object (not array) when there's only one printer
        if (!Array.isArray(parsed)) parsed = [parsed]

        const printers = parsed.map((p) => ({
          name: p.Name || p.name || 'Unknown',
          isDefault: Boolean(p.Default),
        }))

        resolve(printers)
      } catch (parseErr) {
        logger.error('Failed to parse Windows printer list', {
          error: parseErr.message,
          stdout: stdout.substring(0, 500),
        })
        reject(new Error(`Failed to parse printer list: ${parseErr.message}`))
      }
    })
  })
}

// ── macOS ───────────────────────────────────────────────────────────────────

function listMacPrinters() {
  return new Promise((resolve, reject) => {
    exec('lpstat -a 2>/dev/null', { timeout: 10000 }, (err, stdout) => {
      if (err) {
        // lpstat returns error when no printers are configured
        if (err.code === 1) return resolve([])
        return reject(new Error(`Failed to list printers: ${err.message}`))
      }

      const printers = parseLpstatOutput(stdout)
      resolve(printers)
    })
  })
}

// ── Linux ───────────────────────────────────────────────────────────────────

function listLinuxPrinters() {
  return new Promise((resolve, reject) => {
    exec('lpstat -a 2>/dev/null', { timeout: 10000 }, (err, stdout) => {
      if (err) {
        if (err.code === 1) return resolve([])
        return reject(new Error(`Failed to list printers: ${err.message}`))
      }

      const printers = parseLpstatOutput(stdout)
      resolve(printers)
    })
  })
}

// ── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Parse `lpstat -a` output into printer objects.
 *
 * Example line: "EPSON_TM_T82 accepting requests since Mon Jun 20 10:00:00 2026"
 */
function parseLpstatOutput(output) {
  if (!output || !output.trim()) return []

  return output
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      // Printer name is the first token before " accepting"
      const match = line.match(/^(\S+)\s+accepting/)
      const name = match ? match[1] : line.split(/\s+/)[0]
      return {
        name: name.replace(/_/g, ' '), // Replace underscores with spaces for readability
      }
    })
    .filter((p) => p.name)
}

/**
 * Find the OS default printer.
 *
 * @returns {Promise<string|null>}
 */
async function getDefaultPrinter() {
  const platform = process.platform

  if (platform === 'win32') {
    return new Promise((resolve) => {
      exec(
        'powershell -NoProfile -Command "(Get-WmiObject -Query \\"SELECT * FROM Win32_Printer WHERE Default=TRUE\\").Name"',
        { timeout: 10000 },
        (err, stdout) => {
          if (err) return resolve(null)
          const name = stdout.trim()
          resolve(name || null)
        }
      )
    })
  }

  // macOS / Linux
  return new Promise((resolve) => {
    exec('lpstat -d 2>/dev/null', { timeout: 10000 }, (err, stdout) => {
      if (err) return resolve(null)
      // Output: "system default destination: PrinterName"
      const match = stdout.match(/:\s*(.+)/)
      resolve(match ? match[1].trim().replace(/_/g, ' ') : null)
    })
  })
}

module.exports = {
  listSystemPrinters,
  getDefaultPrinter,
}
