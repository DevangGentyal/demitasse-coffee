/**
 * Bronte Print Agent — Electron Main Process
 *
 * Entry point for the Electron application.
 *
 * Responsibilities:
 *  1. Start the Express server on port 8585
 *  2. Create system tray icon with context menu
 *  3. Register auto-launch on system boot
 *  4. Handle graceful shutdown
 *
 * The app runs as a background service with NO visible window.
 * All user interaction happens through the system tray menu.
 */

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { startServer, stopServer } = require('./server')
const { createTray, destroyTray } = require('./tray')
const { closeBrowser } = require('./services/pdfService')
const { logger } = require('./utils/logger')
const configService = require('./services/configService')

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  logger.warn('Another instance of OG Print Agent is already running. Exiting.')
  app.quit()
}

// ── Auto-launch configuration ───────────────────────────────────────────────

async function setupAutoLaunch() {
  try {
    const AutoLaunch = require('auto-launch')

    const autoLauncher = new AutoLaunch({
      name: 'OG Print Agent',
      isHidden: true, // Start minimized / in background
    })

    const isEnabled = await autoLauncher.isEnabled()
    if (!isEnabled) {
      await autoLauncher.enable()
      logger.info('Auto-launch enabled — agent will start on system boot')
    } else {
      logger.info('Auto-launch already enabled')
    }
  } catch (err) {
    logger.warn('Failed to configure auto-launch', { error: err.message })
  }
}

// ── Settings Window ─────────────────────────────────────────────────────────

let settingsWindow = null

function openSettingsWindow() {
  if (settingsWindow) {
    if (settingsWindow.isMinimized()) settingsWindow.restore()
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 500,
    title: 'OG Print Agent Settings',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'ui', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  settingsWindow.loadFile(path.join(__dirname, 'ui', 'settings.html'))

  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
}

// ── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('get-origins', () => {
  return configService.getOrigins()
})

ipcMain.handle('set-origins', (event, origins) => {
  configService.setOrigins(origins)
})

// ── App lifecycle ───────────────────────────────────────────────────────────

let tray = null

app.on('ready', async () => {
  logger.info('═══════════════════════════════════════════════')
  logger.info('  OG Print Agent starting...')
  logger.info('═══════════════════════════════════════════════')

  try {
    // Start Express server
    await startServer()

    // Create system tray
    tray = createTray(app, handleRestart, openSettingsWindow)

    // Setup auto-launch
    await setupAutoLaunch()

    logger.info('Agent started successfully')
  } catch (err) {
    logger.error('Failed to start agent', {
      error: err.message,
      stack: err.stack,
    })

    // Show error dialog and exit
    const { dialog } = require('electron')
    dialog.showErrorBox(
      'OG Print Agent — Start Failed',
      `The agent failed to start:\n\n${err.message}\n\nPlease check the logs or try restarting.`
    )
    app.quit()
  }
})

// ── Prevent the app from closing when all windows are closed ────────────────
// (We're a tray app, no windows needed)
app.on('window-all-closed', (e) => {
  e.preventDefault()
})

// ── Graceful shutdown ───────────────────────────────────────────────────────

app.on('before-quit', async () => {
  logger.info('Agent shutting down...')

  try {
    await stopServer()
    await closeBrowser()
    destroyTray()
    logger.info('Agent shut down cleanly')
  } catch (err) {
    logger.error('Error during shutdown', { error: err.message })
  }
})

// ── Restart handler (called from tray menu) ─────────────────────────────────

async function handleRestart() {
  logger.info('Agent restart requested from tray menu')

  try {
    // Stop existing server
    await stopServer()
    await closeBrowser()
    logger.info('Server and browser stopped for restart')

    // Restart server
    await startServer()
    logger.info('Server restarted successfully')

    // Rebuild tray (to update status text if needed)
    destroyTray()
    tray = createTray(app, handleRestart, openSettingsWindow)
  } catch (err) {
    logger.error('Restart failed', { error: err.message })

    const { dialog } = require('electron')
    dialog.showErrorBox(
      'Restart Failed',
      `Failed to restart the agent:\n\n${err.message}`
    )
  }
}

// ── Handle uncaught errors ──────────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', {
    error: err.message,
    stack: err.stack,
  })
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  })
})
