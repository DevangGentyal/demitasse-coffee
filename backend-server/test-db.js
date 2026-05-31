const admin = require("firebase-admin");

// Force using the real production Firestore
delete process.env.FIRESTORE_EMULATOR_HOST;
delete process.env.FIREBASE_FIRESTORE_EMULATOR_HOST;

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: "demitasse-cafe-pilot"
  });
}

const db = admin.firestore();

async function run() {
  try {
    console.log("--- OUTLETS ---");
    const outletsSnap = await db.collection("outlets").limit(5).get();
    outletsSnap.docs.forEach(doc => {
      console.log(`Outlet ID: "${doc.id}", Name: "${doc.data().name}"`);
    });

    if (outletsSnap.empty) {
      console.log("No outlets found!");
      return;
    }

    const firstOutletId = outletsSnap.docs[0].id;
    console.log(`\nQuerying stats using Outlet ID: "${firstOutletId}"`);

    console.log("\n--- ORDERS (Active) ---");
    const ordersSnap = await db.collection("orders").limit(5).get();
    ordersSnap.docs.forEach(doc => {
      console.log(`Order ID: "${doc.id}", outletId: "${doc.data().outletId}", status: "${doc.data().status || doc.data().orderStatus}"`);
    });

    console.log("\n--- PRODUCTS ---");
    const productsSnap = await db.collection("products").limit(5).get();
    productsSnap.docs.forEach(doc => {
      const p = doc.data();
      console.log(`Product ID: "${doc.id}", outletId: "${p.outletId}", name: "${p.name}", isAvailable: ${p.isAvailable}, isActive: ${p.isActive}`);
    });

    console.log("\n--- OFFERS ---");
    const offersSnap = await db.collection("offers").limit(5).get();
    offersSnap.docs.forEach(doc => {
      const o = doc.data();
      console.log(`Offer ID: "${doc.id}", outletId: "${o.outletId}", code: "${o.code}", isActive: ${o.isActive}, startDate: ${o.startDate}, endDate: ${o.endDate}`);
    });

    console.log("\n--- ORDERS HISTORY ---");
    const historySnap = await db.collection("ordersHistory").limit(5).get();
    historySnap.docs.forEach(doc => {
      const h = doc.data();
      console.log(`History ID: "${doc.id}", outletId: "${h.outletId}", archivedAt: ${h.archivedAt?.toDate ? h.archivedAt.toDate().toISOString() : h.archivedAt}`);
    });

    console.log("\n--- CANCEL ORDERS ---");
    const cancelSnap = await db.collection("orderCancel").limit(5).get();
    cancelSnap.docs.forEach(doc => {
      const c = doc.data();
      console.log(`Cancel ID: "${doc.id}", outletId: "${c.outletId}", cancelledAt: ${c.cancelledAt?.toDate ? c.cancelledAt.toDate().toISOString() : c.cancelledAt}`);
    });

  } catch (error) {
    console.error("Error running diagnostics:", error);
  }
}

run();
