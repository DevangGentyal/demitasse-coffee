const admin = require('firebase-admin');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('FIRESTORE_EMULATOR_HOST must be set to use emulator');
  process.exit(1);
}

admin.initializeApp({ projectId: 'demitasse-cafe-pilot' });

const db = admin.firestore();

async function seed() {
  try {
    await db.collection('outlets').doc('test-outlet').set({ name: 'Test Outlet', lat: 12.0, lng: 77.0 });
    console.log('Created outlet test-outlet');

    await db.collection('tables').doc('test-table').set({ name: 'T1', outletId: 'test-outlet', occupied: false });
    console.log('Created table test-table');

    // create a sample product
    await db.collection('products').doc('prod_simple').set({ name: 'Coffee', price: 100 });
    console.log('Created product prod_simple');

    process.exit(0);
  } catch (err) {
    console.error('Seed error', err);
    process.exit(2);
  }
}

seed();
