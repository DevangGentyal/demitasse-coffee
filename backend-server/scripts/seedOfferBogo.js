const admin = require('firebase-admin');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('FIRESTORE_EMULATOR_HOST must be set to use emulator');
  process.exit(1);
}

admin.initializeApp({ projectId: 'demitasse-cafe-pilot' });
const db = admin.firestore();

async function seed() {
  try {
    const offerId = 'offer_bogo_1';
    const offer = {
      title: 'BOGO Coffee',
      type: 'BOGO',
      isActive: true,
      outletId: 'test-outlet',
      applicableItems: ['prod_simple'],
      startDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 1000 * 60 * 60)),
      endDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 1000 * 60 * 60 * 24)),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('offers').doc(offerId).set(offer);
    console.log('Created offer', offerId);

    // Attach to order1
    await db.collection('orders').doc('order1').update({ offerId });
    console.log('Attached offer to order1');

    process.exit(0);
  } catch (err) {
    console.error('seed offer error', err);
    process.exit(2);
  }
}

seed();
