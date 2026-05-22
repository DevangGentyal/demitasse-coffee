// Simple smoke test to verify compiled claimTableOwner export exists
const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, '..', 'lib', 'shared', 'data', 'claimTableOwner.js')
if (!fs.existsSync(file)) {
  console.error('FAIL: compiled file not found at', file)
  process.exit(2)
}

const content = fs.readFileSync(file, 'utf8')
if (content.includes('claimTableOwner')) {
  console.log('OK: claimTableOwner symbol found in compiled file')
  process.exit(0)
} else {
  console.error('FAIL: claimTableOwner symbol not found in compiled file')
  process.exit(3)
}
