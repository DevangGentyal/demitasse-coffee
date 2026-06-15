const admin = require('firebase-admin');

process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

admin.initializeApp({
  projectId: 'demitasse-cafe-pilot'
});

const db = admin.firestore();

async function run() {
  const users = await db.collection('users').get();
  console.log(`Found ${users.docs.length} users`);
  const uids = users.docs.map(d => d.id);
  
  const outlets = await db.collection('outlets').get();
  for (const outlet of outlets.docs) {
    const orders = await outlet.ref.collection('orders').get();
    for (const order of orders.docs) {
      const data = order.data();
      const customerId = data.customerId;
      if (!uids.includes(customerId)) {
         console.log(`Order ${order.id} in outlet ${outlet.id} has customerId ${customerId} which is NOT in users collection!`);
      } else {
         console.log(`Order ${order.id} belongs to valid user ${customerId}`);
      }
    }
  }
}

run().catch(console.error);
