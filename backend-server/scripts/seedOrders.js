const admin = require('firebase-admin');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('FIRESTORE_EMULATOR_HOST must be set to use emulator');
  process.exit(1);
}

admin.initializeApp({ projectId: 'demitasse-cafe-pilot' });
const db = admin.firestore();

async function seed() {
  try {
    const sessionId = 'sess_test_1';
    await db.collection('sessions').doc(sessionId).set({ outletId: 'test-outlet', tableId: 'test-table', ownerId: 'guest_test_123', status: 'ACTIVE', createdAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log('Created session', sessionId);

    await db.collection('tables').doc('test-table').update({ activeSessionId: sessionId, isOccupied: true });
    console.log('Updated table activeSessionId');

    await db.collection('orders').doc('order1').set({ outletId: 'test-outlet', tableId: 'test-table', sessionId: sessionId, status: 'ACTIVE', items: [{ productId: 'prod_simple', qty: 1, price: 100 }], createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log('Created order order1');

    process.exit(0);
  } catch (err) {
    console.error('seed orders error', err);
    process.exit(2);
  }
}

seed();
