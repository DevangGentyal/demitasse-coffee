const admin = require('firebase-admin');

// IMPORTANT: Do not set FIRESTORE_EMULATOR_HOST so it hits production!
admin.initializeApp({
  projectId: 'demitasse-cafe-pilot'
});

const db = admin.firestore();

async function run() {
  console.log('--- USERS ---');
  const users = await db.collection('users').limit(5).get();
  const uids = users.docs.map(d => d.id);
  console.log('Sample UIDs:', uids);
  
  if (uids.length > 0) {
      const uid = uids[0];
      const userDoc = users.docs[0].data();
      console.log(`Checking orders for user ${uid}, dob: ${userDoc.dob}`);
      
      const outlets = await db.collection('outlets').get();
      let totalActive = 0;
      let totalHistory = 0;
      for (const outlet of outlets.docs) {
          const active = await outlet.ref.collection('orders').where('customerId', '==', uid).get();
          const history = await outlet.ref.collection('orderHistory').where('customerId', '==', uid).get();
          
          if (active.size > 0 || history.size > 0) {
              console.log(`Outlet ${outlet.id}: ${active.size} active, ${history.size} history`);
              totalActive += active.size;
              totalHistory += history.size;
          }
      }
      console.log(`User ${uid} totals: ${totalActive} active, ${totalHistory} history`);
  }

  console.log('\n--- OFFERS ---');
  const outlets = await db.collection('outlets').limit(1).get();
  if (outlets.size > 0) {
      const offers = await outlets.docs[0].ref.collection('offers').get();
      offers.forEach(doc => {
          const data = doc.data();
          console.log(`Offer ${doc.id} - Title: "${data.title}", Category: "${data.category}", Type: "${data.type}", offerType: "${data.offerType}"`);
          if (data.category === 'BIRTHDAY' || data.title?.toLowerCase().includes('birthday')) {
             console.log(`   -> ProductIds: ${JSON.stringify(data.config?.reward?.productIds || data.rewardItems?.map(r=>r.productId))}`);
          }
      });
  }
}

run().catch(console.error);
