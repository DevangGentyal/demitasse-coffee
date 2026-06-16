const admin = require('firebase-admin');
process.env.FIRESTORE_EMULATOR_HOST = undefined; // make sure we connect to the real Firestore if that's what is being used, or emulator if set
// Let's check environment or default to local/live
admin.initializeApp({ projectId: 'demitasse-cafe-pilot' });

const db = admin.firestore();

(async () => {
  const outletId = 'sDKV5uHXPMeLnEe1xTvKKTbWpaR2';
  console.log('Fetching successPayments for outlet:', outletId);
  const paymentsSnap = await db.collection('outlets').doc(outletId).collection('successPayments').get();
  console.log('successPayments count:', paymentsSnap.size);
  paymentsSnap.docs.forEach(doc => {
    console.log('PAYMENT:', doc.id, doc.data());
  });

  console.log('Fetching ordersHistory for outlet:', outletId);
  const ordersSnap = await db.collection('outlets').doc(outletId).collection('ordersHistory').get();
  console.log('ordersHistory count:', ordersSnap.size);
  ordersSnap.docs.slice(0, 5).forEach(doc => {
    console.log('ORDER:', doc.id, doc.data());
  });
})();
