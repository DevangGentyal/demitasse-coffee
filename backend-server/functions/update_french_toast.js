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
  let updated = false;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.name.toLowerCase().includes("french")) {
      console.log("Updating product:", data.name);
      await doc.ref.update({
        variations: [
          {
            label: "Egg Style",
            max: 1,
            min: 1,
            options: [
              { name: "Fried", price: 0 },
              { name: "Boiled", price: 0 },
              { name: "Scrambled", price: 0 },
              { name: "Cheese Omelette", price: 0 }
            ]
          },
          {
            label: "Bread Type",
            max: 1,
            min: 1,
            options: [
              { name: "Sourdough", price: 0 },
              { name: "Croissant", price: 30 }
            ]
          }
        ]
      });
      console.log("Successfully updated French Toast variations!");
      updated = true;
    }
  }
  if (!updated) {
    console.log("No French Toast product found to update.");
  }
}

run().catch(console.error);
