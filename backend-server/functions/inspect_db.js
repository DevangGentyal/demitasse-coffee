const admin = require("firebase-admin");

if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: "demitasse-cafe-pilot"
  });
}

const db = admin.firestore();

async function run() {
  const outletId = "paVk0dWW9zLO8u7I7fq70Y7QAQm2";
  console.log("Fetching products for outlet:", outletId);
  const snap = await db.collection("outlets").doc(outletId).collection("products").get();
  console.log(`Total products found: ${snap.size}`);
  snap.forEach(doc => {
    const data = doc.data();
    console.log("- " + data.name + " (" + doc.id + ")");
    if (data.name.toLowerCase().includes("french")) {
      console.log("Found product:", data.name);
      console.log("Variations:", JSON.stringify(data.variations, null, 2));
      console.log("Customizations:", JSON.stringify(data.customizations, null, 2));
    }
  });
}

run().catch(console.error);
