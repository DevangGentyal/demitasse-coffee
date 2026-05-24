const admin = require('firebase-admin')

// Reuse existing Firebase Admin SDK — uses GOOGLE_APPLICATION_CREDENTIALS or
// Firebase emulator env vars automatically.
if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: 'demitasse-cafe-pilot' })
}

const db = admin.firestore()
const { Timestamp } = admin.firestore

async function run() {
  const now = Timestamp.now()

  // ── 1. printerConfigs ──────────────────────────────────────────────

  const printers = [
    {
      id: 'chefPrinter',
      data: {
        printerName: 'Chef Printer',
        systemPrinterName: '',
        printerType: 'thermal',
        role: 'food',
        outletId: 'outlet_001',
        width: 250,
        lineHeight: 0,
        headerText: 'Demitasse Coffee',
        footerText: 'Thank You',
        margins: { top: 0, right: 0, bottom: 0, left: 10 },
        assignedCategories: [
          'BAKERY & DESSERTS',
          'BREAKFAST & SUPER FOOD',
          'APPETIZERS & SMALL PLATES',
          'SANDWICHES & BURGERS',
          'MAINS',
          'MEALS & GLOBAL PLATES',
        ],
        assignedItems: [],
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    },
    {
      id: 'counterPrinter',
      data: {
        printerName: 'Counter Printer',
        systemPrinterName: '',
        printerType: 'thermal',
        role: 'coffee',
        outletId: 'outlet_001',
        width: 250,
        lineHeight: 0,
        headerText: 'Demitasse Coffee',
        footerText: 'Thank You',
        margins: { top: 0, right: 0, bottom: 0, left: 10 },
        assignedCategories: [
          'BEVERAGES',
          'COFFEE SPECIALTIES',
        ],
        assignedItems: [],
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    },
  ]

  for (const printer of printers) {
    const ref = db.collection('printerConfigs').doc(printer.id)
    const snap = await ref.get()

    if (snap.exists) {
      // Use merge-safe update to add outletId to existing document without destructively overwriting
      await ref.set({ outletId: printer.data.outletId, updatedAt: now }, { merge: true })
      console.log(`✅ printerConfigs/${printer.id} already exists — updated safely with outletId.`)
    } else {
      await ref.set(printer.data)
      console.log(`✅ printerConfigs/${printer.id} created.`)
    }
  }

  // ── 2. kotBillingSettings ──────────────────────────────────────────

  const settingsRef = db.collection('kotBillingSettings').doc('defaultSettings')
  const settingsSnap = await settingsRef.get()

  if (settingsSnap.exists) {
    // Merge-safe update for existing document
    await settingsRef.set({ outletId: 'outlet_001', updatedAt: now }, { merge: true })
    console.log('✅ kotBillingSettings/defaultSettings already exists — updated safely with outletId.')
  } else {
    await settingsRef.set({
      outletId: 'outlet_001',
      defaultPaperWidth: 250,
      showRestaurantHeader: true,
      showFooter: true,
      autoPrintEnabled: false,
      decimalQuantityDigits: 0,
      createdAt: now,
      updatedAt: now,
    })
    console.log('✅ kotBillingSettings/defaultSettings created.')
  }

  console.log('\n🎉 Setup complete.')
}

run().catch((err) => {
  console.error('❌ Setup failed:', err)
  process.exit(1)
})
