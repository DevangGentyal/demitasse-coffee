/**
 * Bronte Print Agent — System Tray
 *
 * Creates a system tray icon with a context menu for:
 *  - Status display
 *  - View logs
 *  - List printers
 *  - Restart agent
 *  - Exit
 */

const { Tray, Menu, nativeImage, shell, dialog } = require('electron')
const path = require('path')
const { getLogPath } = require('./utils/logger')
const { listSystemPrinters } = require('./services/printerService')
const { getPort } = require('./server')

let trayInstance = null

/**
 * Create and configure the system tray icon.
 *
 * @param {import('electron').App} app  The Electron app instance
 * @param {Function} onRestart         Callback to restart the server
 * @param {Function} onOpenSettings    Callback to open settings window
 * @returns {Tray}
 */
function createTray(app, onRestart, onOpenSettings) {
  // Resolve tray icon path
  const iconPath = getTrayIconPath()
  const icon = nativeImage.createFromPath(iconPath)

  // Create a small icon for the tray (16x16 on most platforms)
  const trayIcon = icon.isEmpty()
    ? nativeImage.createEmpty()
    : icon.resize({ width: 16, height: 16 })

  trayInstance = new Tray(trayIcon)
  trayInstance.setToolTip('OG Print Agent')

  // Build context menu
  const contextMenu = buildContextMenu(app, onRestart, onOpenSettings)
  trayInstance.setContextMenu(contextMenu)

  return trayInstance
}

/**
 * Build the tray context menu.
 */
function buildContextMenu(app, onRestart, onOpenSettings) {
  const port = getPort()

  return Menu.buildFromTemplate([
    {
      label: 'OG Print Agent',
      enabled: false, // Title item, not clickable
    },
    { type: 'separator' },
    {
      label: `✅ Running on Port ${port}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '⚙️ Settings',
      click: () => {
        if (typeof onOpenSettings === 'function') {
          onOpenSettings()
        }
      },
    },
    { type: 'separator' },
    {
      label: '📊 Status',
      click: () => {
        dialog.showMessageBox({
          type: 'info',
          title: 'OG Print Agent — Status',
          message: 'OG Print Agent is running.',
          detail: [
            `Port: ${port}`,
            `Platform: ${process.platform}`,
            `Uptime: ${formatUptime(process.uptime())}`,
            `Node: ${process.version}`,
            `PID: ${process.pid}`,
          ].join('\n'),
          buttons: ['OK'],
        })
      },
    },
    {
      label: '📂 View Logs',
      click: () => {
        const logDir = getLogPath()
        shell.openPath(logDir).catch(() => {
          shell.showItemInFolder(logDir)
        })
      },
    },
    {
      label: '🖨️ List Printers',
      click: async () => {
        try {
          const printers = await listSystemPrinters()
          const printerNames = printers.map((p) => `  • ${p.name}`).join('\n')

          dialog.showMessageBox({
            type: 'info',
            title: 'Detected Printers',
            message: `Found ${printers.length} printer(s):`,
            detail: printerNames || 'No printers found.',
            buttons: ['OK'],
          })
        } catch (err) {
          dialog.showMessageBox({
            type: 'error',
            title: 'Error',
            message: 'Failed to list printers',
            detail: err.message,
            buttons: ['OK'],
          })
        }
      },
    },
    { type: 'separator' },
    {
      label: '🔄 Restart Agent',
      click: () => {
        if (typeof onRestart === 'function') {
          onRestart()
        }
      },
    },
    {
      label: '❌ Exit',
      click: () => {
        app.quit()
      },
    },
  ])
}

/**
 * Resolve the tray icon path.
 * Checks both development and packaged paths.
 */
function getTrayIconPath() {
  // In packaged app, resources are in process.resourcesPath
  const possiblePaths = [
    path.join(__dirname, '..', 'assets', 'tray-icon.png'),
    path.join(process.resourcesPath || '', 'assets', 'tray-icon.png'),
  ]

  for (const p of possiblePaths) {
    try {
      require('fs').accessSync(p)
      return p
    } catch (_) {
      // Continue to next path
    }
  }

  // Return a path even if it doesn't exist (Electron will show a default icon)
  return possiblePaths[0]
}

/**
 * Format uptime seconds into a human-readable string.
 */
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)

  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/**
 * Destroy the tray icon.
 */
function destroyTray() {
  if (trayInstance) {
    trayInstance.destroy()
    trayInstance = null
  }
}

module.exports = {
  createTray,
  destroyTray,
}
