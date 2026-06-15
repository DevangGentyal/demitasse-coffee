const admin = require("firebase-admin");

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
admin.initializeApp({ projectId: "demitasse-cafe-pilot" });

const db = admin.firestore();

async function test() {
  const snap = await db.collection("offers").where("category", "==", "BIRTHDAY").get();
  console.log("Found", snap.size, "birthday offers");
  snap.docs.forEach((doc) => {
    console.log("Offer:", doc.id);
    console.log(JSON.stringify(doc.data(), null, 2));
  });
}

test().catch(console.error);
