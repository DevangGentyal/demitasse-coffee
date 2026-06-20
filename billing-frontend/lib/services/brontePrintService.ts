/**
 * Bronte Print Agent — Frontend Service
 *
 * Drop-in replacement for qzPrintService.ts.
 * Communicates with the local Bronte Print Agent via HTTP (localhost:8585).
 *
 * Exports the same API surface as qzPrintService so consumer components
 * only need to change their import path.
 *
 * Key differences from QZ Tray:
 *  - Uses simple fetch() instead of WebSocket
 *  - No certificate/signature setup required
 *  - Connection check is a lightweight HTTP health ping
 *  - Adds testPrint() and checkHealth() not present in QZ
 */

// ── Configuration ───────────────────────────────────────────────────────────

const AGENT_BASE_URL = 'http://localhost:8585'

/** Timeout for agent health checks (ms) */
const HEALTH_CHECK_TIMEOUT = 3000

/** Timeout for print requests (ms) */
const PRINT_TIMEOUT = 30000

// ── Internal state ──────────────────────────────────────────────────────────

let _isConnected = false
let _lastHealthCheck: number = 0
const HEALTH_CACHE_MS = 5000 // Cache health status for 5 seconds

// ── Types ───────────────────────────────────────────────────────────────────

export interface BrontePrintOptions {
  /** Paper width in mm (default: 80 for standard thermal) */
  widthMm?: number
  /** Paper height in mm (default: auto) */
  heightMm?: number
  /** Margins in mm */
  margins?: { top?: number; right?: number; bottom?: number; left?: number }
}

export interface BronteHealthResponse {
  status: string
  version: string
  platform?: string
  uptime?: number
  timestamp?: string
}

export interface BrontePrinter {
  name: string
  isDefault?: boolean
}

// ── Connection helpers ──────────────────────────────────────────────────────

/**
 * Check if the Bronte Print Agent is running.
 * Pings the /health endpoint.
 *
 * This replaces connectQZ() — but instead of establishing a persistent
 * WebSocket, it simply verifies the agent is reachable via HTTP.
 */
export const connectAgent = async (): Promise<void> => {
  try {
    console.log('[BRONTE] Checking agent connectivity...')
    const health = await checkHealth()

    if (health.status === 'ok') {
      _isConnected = true
      console.log(`[BRONTE] ✅ Agent connected (v${health.version})`)
    } else {
      _isConnected = false
      throw new Error('Agent returned non-ok status')
    }
  } catch (err) {
    _isConnected = false
    console.error('[BRONTE] ❌ Agent not reachable:', err)
    throw err
  }
}

/**
 * Disconnect from the agent.
 * No-op for HTTP transport (no persistent connection to close).
 * Kept for API compatibility with qzPrintService.
 */
export const disconnectAgent = async (): Promise<void> => {
  _isConnected = false
  console.log('[BRONTE] Disconnected (state cleared)')
}

/**
 * Whether the agent is currently reachable.
 * Returns the cached health check result.
 */
export const isAgentConnected = (): boolean => _isConnected

// ── Health Check ────────────────────────────────────────────────────────────

/**
 * Perform a health check against the local agent.
 *
 * @returns {Promise<BronteHealthResponse>}
 */
export const checkHealth = async (): Promise<BronteHealthResponse> => {
  const now = Date.now()

  // Return cached result if recent
  if (_isConnected && now - _lastHealthCheck < HEALTH_CACHE_MS) {
    return { status: 'ok', version: '1.0.0' }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT)

    const response = await fetch(`${AGENT_BASE_URL}/health`, {
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`)
    }

    const data: BronteHealthResponse = await response.json()
    _isConnected = data.status === 'ok'
    _lastHealthCheck = now

    return data
  } catch (err: any) {
    _isConnected = false
    _lastHealthCheck = 0

    if (err.name === 'AbortError') {
      throw new Error('Agent health check timed out')
    }
    throw err
  }
}

// ── Printer Discovery ───────────────────────────────────────────────────────

/**
 * List all printers detected by the agent.
 *
 * @returns {Promise<string[]>} Array of printer names
 */
export const listPrinters = async (): Promise<string[]> => {
  console.log('[BRONTE] Requesting printer list...')

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(`${AGENT_BASE_URL}/printers`, {
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`Failed to list printers: ${response.status}`)
    }

    const data = await response.json()

    if (!data.success) {
      throw new Error(data.message || 'Failed to list printers')
    }

    const printerNames = (data.printers || []).map((p: BrontePrinter) => p.name)
    console.log('[BRONTE] Available printers:', printerNames)
    return printerNames
  } catch (err: any) {
    console.error('[BRONTE] ❌ Failed to list printers:', err)
    throw err
  }
}

/**
 * Get the OS default printer name.
 *
 * Falls back to the first printer in the list if the agent
 * doesn't explicitly mark a default.
 */
export const getDefaultPrinter = async (): Promise<string> => {
  const response = await fetch(`${AGENT_BASE_URL}/printers`)

  if (!response.ok) {
    throw new Error(`Failed to get printers: ${response.status}`)
  }

  const data = await response.json()
  const printers: BrontePrinter[] = data.printers || []

  // Look for explicitly marked default
  const defaultPrinter = printers.find((p) => p.isDefault)
  if (defaultPrinter) {
    console.log(`[BRONTE] Default printer: "${defaultPrinter.name}"`)
    return defaultPrinter.name
  }

  // Fall back to first printer
  if (printers.length > 0) {
    console.log(`[BRONTE] No default printer marked, using first: "${printers[0].name}"`)
    return printers[0].name
  }

  throw new Error('No printers available')
}

// ── Printing ────────────────────────────────────────────────────────────────

/**
 * Silently print an HTML string to the named printer.
 *
 * This is the primary print function, matching the API of qzPrintService.silentPrintHTML.
 *
 * @param printerName  Exact OS printer name. Pass `null` to use the default printer.
 * @param html         Full HTML string to print.
 * @param options      Optional sizing overrides.
 */
export const silentPrintHTML = async (
  printerName: string | null,
  html: string,
  options: BrontePrintOptions = {}
): Promise<void> => {
  // Resolve printer name
  const resolvedPrinter = printerName || (await getDefaultPrinter())
  console.log(`[BRONTE] 🖨️ Printing to: "${resolvedPrinter}"`)

  // Generate a simple job ID
  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`

  console.log(`[PRINT] Selected Printer: ${resolvedPrinter}`)
  console.log(`[PRINT] Sending KOT`)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PRINT_TIMEOUT)

    const response = await fetch(`${AGENT_BASE_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        printerName: resolvedPrinter,
        jobType: 'kot',
        jobId,
        html,
        options: {
          widthMm: options.widthMm ?? 80,
          heightMm: options.heightMm ?? null,
          margins: {
            top: options.margins?.top ?? 0,
            right: options.margins?.right ?? 0,
            bottom: options.margins?.bottom ?? 0,
            left: options.margins?.left ?? 0,
          },
        },
      }),
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error(`[PRINT ERROR] ${errorData.message || response.statusText}`)
      throw new Error(errorData.message || `Print failed with status ${response.status}`)
    }

    const result = await response.json()
    console.log(`[PRINT] Response Success`)
    console.log(`[BRONTE] ✅ Print job submitted: "${resolvedPrinter}" (${jobId})`)

    // Update connection state
    _isConnected = true
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error('[PRINT ERROR] Print request timed out')
      throw new Error('Print request timed out — is the agent running?')
    }

    // Check if agent is offline
    if (err.message?.includes('fetch') || err.message?.includes('network') || err.code === 'ECONNREFUSED') {
      _isConnected = false
      console.error('[PRINT ERROR] Printer Offline')
      throw new Error('Bronte Print Agent is not running. Please start the agent and try again.')
    }

    throw err
  }
}

// ── Test Print ──────────────────────────────────────────────────────────────

/**
 * Send a test page to the specified printer.
 *
 * @param printerName  Exact OS printer name
 */
export const testPrint = async (printerName: string): Promise<void> => {
  console.log(`[BRONTE] Test print requested for: "${printerName}"`)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PRINT_TIMEOUT)

    const response = await fetch(`${AGENT_BASE_URL}/print-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ printerName }),
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.message || `Test print failed: ${response.status}`)
    }

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.message || 'Test print failed')
    }

    console.log(`[BRONTE] ✅ Test print completed for "${printerName}"`)
  } catch (err: any) {
    console.error(`[BRONTE] ❌ Test print failed for "${printerName}":`, err)
    throw err
  }
}
