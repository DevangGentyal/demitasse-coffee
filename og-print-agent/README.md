# Bronte Print Agent

Silent local printing service for Demitasse Cafe POS.

## Overview

Bronte Print Agent is an Electron-based application that runs as a background service on the cafe's local machine. It receives print requests from the billing web application via HTTP and silently prints to local thermal printers — no browser print dialogs required.

## Architecture

```
Billing Frontend (Next.js)
        ↓  HTTP POST
Bronte Print Agent (localhost:8585)
        ↓  Puppeteer → PDF
OS Print Queue
        ↓
Thermal Printer
```

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Run the Express server only (no Electron)
npm run server-only

# Run with Electron (tray icon)
npm start
```

### Building Installers

```bash
# Windows (.exe)
npm run build:win

# macOS (.dmg)
npm run build:mac

# Linux (AppImage)
npm run build:linux

# All platforms
npm run build:all
```

## API Endpoints

### Health Check

```
GET http://localhost:8585/health

Response:
{
  "status": "ok",
  "version": "1.0.0",
  "platform": "win32",
  "uptime": 3600
}
```

### List Printers

```
GET http://localhost:8585/printers

Response:
{
  "success": true,
  "printers": [
    { "name": "EPSON TM-T82", "isDefault": true },
    { "name": "Kitchen Printer" }
  ]
}
```

### Print HTML

```
POST http://localhost:8585/print

Body:
{
  "printerName": "EPSON TM-T82",
  "jobType": "kot",
  "jobId": "order_123",
  "html": "<html>...</html>",
  "options": {
    "widthMm": 80,
    "margins": { "top": 0, "right": 0, "bottom": 0, "left": 0 }
  }
}

Response:
{
  "success": true,
  "jobId": "order_123",
  "message": "Print job sent to \"EPSON TM-T82\""
}
```

### Test Print

```
POST http://localhost:8585/print-test

Body:
{
  "printerName": "EPSON TM-T82"
}

Response:
{
  "success": true,
  "message": "Test page sent to \"EPSON TM-T82\""
}
```

## Log Files

Logs are stored with daily rotation (14-day retention):

| Platform | Path |
|----------|------|
| Windows  | `%APPDATA%/BrontePrintAgent/logs/` |
| macOS    | `~/Library/Application Support/BrontePrintAgent/logs/` |
| Linux    | `~/.bronte-print-agent/logs/` |

### Log Format

```
[INFO] 2026-06-20T10:00:00.000+05:30 | req:a1b2c3d4 | printer:EPSON TM-T82 | job:order_123 | Print request received
```

## System Tray

When running with Electron, the agent adds a system tray icon with:

- **Status** — Shows port, platform, uptime
- **View Logs** — Opens log directory
- **List Printers** — Shows detected printers
- **Restart Agent** — Restarts the Express server
- **Exit** — Shuts down the agent

## Troubleshooting

### Port 8585 already in use

Another instance may be running. Kill it:
- **Windows**: `taskkill /f /im "Bronte Print Agent.exe"`
- **macOS/Linux**: `kill $(lsof -t -i:8585)`

### Printer not detected

1. Ensure the printer is installed at the OS level
2. Check `Settings > Printers & Scanners` (or equivalent)
3. Try `GET /printers` to see what the agent detects

### PDF generation fails

1. Check if Puppeteer Chromium is properly installed
2. Run `npm install puppeteer` again
3. Check logs for detailed error messages

### Agent doesn't start on boot

1. Check auto-launch settings in your OS
2. Re-enable via tray menu → Status
3. Manually add to startup programs if needed
