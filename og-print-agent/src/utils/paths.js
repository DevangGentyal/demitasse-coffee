/**
 * Platform-specific path resolution for Bronte Print Agent.
 *
 * Provides consistent, OS-aware paths for:
 *  - Log files
 *  - Temporary PDF files
 *  - Configuration storage
 */

const path = require('path')
const os = require('os')
const fs = require('fs')

/**
 * Resolve the base data directory for the agent.
 *
 * Windows:  %APPDATA%/BrontePrintAgent
 * macOS:    ~/Library/Application Support/BrontePrintAgent
 * Linux:    ~/.bronte-print-agent
 */
function getDataDir() {
  const platform = process.platform

  let base
  if (platform === 'win32') {
    base = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'OGPrintAgent')
  } else if (platform === 'darwin') {
    base = path.join(os.homedir(), 'Library', 'Application Support', 'OGPrintAgent')
  } else {
    // Linux and others
    base = path.join(os.homedir(), '.og-print-agent')
  }

  return base
}

/**
 * Resolve the log directory.
 */
function getLogDir() {
  return path.join(getDataDir(), 'logs')
}

/**
 * Resolve the temp directory for generated PDFs.
 * Uses a subfolder inside the data dir so cleanup is easy.
 */
function getTempDir() {
  return path.join(getDataDir(), 'temp')
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
  return dirPath
}

module.exports = {
  getDataDir,
  getLogDir,
  getTempDir,
  ensureDir,
}
