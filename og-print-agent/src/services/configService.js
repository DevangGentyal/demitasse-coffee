const fs = require('fs')
const path = require('path')
const { app } = require('electron')
const { logger } = require('../utils/logger')

const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'https://billing.demitasse.online',
  '.*\\.demitasse\\.cafe$',
  '.*\\.vercel\\.app$'
]

class ConfigService {
  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'origins-config.json')
    this.origins = this.loadConfig()
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8')
        const parsed = JSON.parse(data)
        if (parsed.origins && Array.isArray(parsed.origins)) {
          return parsed.origins
        }
      }
    } catch (err) {
      logger.error('Failed to load config', { error: err.message })
    }
    
    // Save defaults if file doesn't exist or is invalid
    this.saveConfig(DEFAULT_ORIGINS)
    return [...DEFAULT_ORIGINS]
  }

  saveConfig(originsArray) {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify({ origins: originsArray }, null, 2), 'utf8')
      this.origins = originsArray
    } catch (err) {
      logger.error('Failed to save config', { error: err.message })
    }
  }

  getOrigins() {
    return this.origins
  }

  setOrigins(originsArray) {
    this.saveConfig(originsArray)
  }

  // Determine if a given origin is allowed based on string and regex matching
  isAllowed(requestOrigin) {
    if (!requestOrigin) return true // Allow requests with no origin

    return this.origins.some((pattern) => {
      if (pattern.startsWith('.*') || pattern.includes('\\.')) {
        // Treat as regex
        try {
          const regex = new RegExp(pattern)
          return regex.test(requestOrigin)
        } catch (e) {
          return requestOrigin === pattern
        }
      }
      return requestOrigin === pattern
    })
  }
}

// Singleton instance
const configService = new ConfigService()

module.exports = configService
