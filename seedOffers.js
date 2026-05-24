const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function fixOffersStructure() {
  try {
    console.log("🚀 Fixing existing offers...");

    const snapshot = await db.collection("offers").get();

    if (snapshot.empty) {
      console.log("❌ No offers found");
      process.exit(0);
    }

    for (const doc of snapshot.docs) {
      const ref = doc.ref;

      console.log(`👉 Updating offer: ${doc.id}`);

      await ref.update({
        // 🔥 NEW FIELDS (FORCE ADD)
        applicableItems: [],
        rewardItems: [],
        applicableCategory: null,

        minOrderValue: 0,
        perUserLimit: null,
        isStackable: false,

        // keep existing fields safe
        updatedAt: new Date(),
      });

      console.log(`✅ Updated: ${doc.id}`);
    }

    console.log("🎉 ALL OFFERS UPDATED SUCCESSFULLY");
    process.exit(0);

  } catch (error) {
    console.error("❌ ERROR:", error);
    process.exit(1);
  }
}

fixOffersStructure();