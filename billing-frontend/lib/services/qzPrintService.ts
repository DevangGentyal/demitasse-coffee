/**
 * @deprecated — This service has been replaced by brontePrintService.ts
 *
 * The Bronte Print Agent replaces QZ Tray for silent local printing.
 * This file is kept for reference only.
 *
 * Migration:
 *   import { silentPrintHTML } from '@/lib/services/brontePrintService'
 *
 * See: og-print-agent/README.md
 */

/**
 * QZ Tray Silent Printing Service (DEPRECATED)
 *
 * Centralises all QZ Tray interactions:
 *  - Auto-connect / reconnect
 *  - Silent HTML printing to a named printer
 *  - Fallback to default printer
 *
 * Uses unsigned / demo mode (no certificate required).
 */

import qz from 'qz-tray'

// ── Unsigned / demo mode ──────────────────────────────────────────────────────
// QZ Tray will show a one-time "trust this site" dialog on first connection.
// Once the user clicks "Allow", it is remembered for the session.
qz.security.setCertificatePromise(() =>
  Promise.resolve(
    // Empty string = unsigned mode.  Replace with a real PEM certificate
    // once a QZ Tray license is purchased.
    ''
  )
)
qz.security.setSignatureAlgorithm('SHA512')
qz.security.setSignaturePromise(() => (_hash: string) =>
  Promise.resolve('')
)

// ── Connection helpers ────────────────────────────────────────────────────────

let connectPromise: Promise<void> | null = null

/**
 * Connect to the local QZ Tray service.
 * Re-uses an in-flight connection attempt and auto-retries on failure.
 */
export const connectQZ = async (): Promise<void> => {
  if (qz.websocket.isActive()) {
    console.log('[QZ] Already connected')
    return
  }

  // Avoid duplicate connection attempts
  if (connectPromise) {
    console.log('[QZ] Connection attempt already in progress, waiting...')
    return connectPromise
  }

  connectPromise = (async () => {
    try {
      console.log('[QZ] Connecting to QZ Tray...')
      await qz.websocket.connect({ retries: 3, delay: 1 })
      console.log('[QZ] ✅ Connected to QZ Tray')
    } catch (err) {
      console.error('[QZ] ❌ Failed to connect to QZ Tray:', err)
      throw err
    } finally {
      connectPromise = null
    }
  })()

  return connectPromise
}

/**
 * Disconnect from QZ Tray (call on unmount / cleanup).
 */
export const disconnectQZ = async (): Promise<void> => {
  if (qz.websocket.isActive()) {
    try {
      await qz.websocket.disconnect()
      console.log('[QZ] Disconnected')
    } catch (err) {
      console.warn('[QZ] Error during disconnect:', err)
    }
  }
}

/**
 * Whether the QZ Tray websocket is currently active.
 */
export const isQZConnected = (): boolean => qz.websocket.isActive()

// ── Printing ──────────────────────────────────────────────────────────────────

export interface QZPrintOptions {
  /** Paper width in mm (default: 80 for standard thermal) */
  widthMm?: number
  /** Paper height in mm (default: auto) */
  heightMm?: number
  /** Margins in mm */
  margins?: { top?: number; right?: number; bottom?: number; left?: number }
}

/**
 * Silently print an HTML string to the named printer.
 *
 * @param printerName  Exact Windows printer name (as shown in Devices & Printers)
 *                     Pass `null` to use the OS default printer.
 * @param html         Full HTML string to print
 * @param options      Optional sizing overrides
 */
export const silentPrintHTML = async (
  printerName: string | null,
  html: string,
  options: QZPrintOptions = {}
): Promise<void> => {
  // Ensure connection
  await connectQZ()

  const resolvedPrinter = printerName || (await getDefaultPrinter())
  console.log(`[QZ] 🖨️ Printing to: "${resolvedPrinter}"`)

  const config = qz.configs.create(resolvedPrinter, {
    size: {
      width: options.widthMm ?? 80,
      height: options.heightMm ?? null, // null = auto-height
    },
    units: 'mm',
    margins: {
      top: options.margins?.top ?? 0,
      right: options.margins?.right ?? 0,
      bottom: options.margins?.bottom ?? 0,
      left: options.margins?.left ?? 0,
    },
    colorType: 'grayscale',
    scaleContent: true,
  })

  const data = [
    {
      type: 'pixel' as const,
      format: 'html' as const,
      flavor: 'plain' as const,
      data: html,
    },
  ]

  await qz.print(config, data)
  console.log(`[QZ] ✅ Print job submitted to "${resolvedPrinter}"`)
}

/**
 * Get the OS default printer name.
 */
export const getDefaultPrinter = async (): Promise<string> => {
  await connectQZ()
  const defaultPrinter = await qz.printers.getDefault()
  console.log(`[QZ] Default printer: "${defaultPrinter}"`)
  return defaultPrinter
}

/**
 * List all available printers (useful for debugging).
 */
export const listPrinters = async (): Promise<string[]> => {
  await connectQZ()
  const printers = await qz.printers.find()
  console.log('[QZ] Available printers:', printers)
  return Array.isArray(printers) ? printers : [printers]
}
