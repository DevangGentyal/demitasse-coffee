const admin = require("firebase-admin");

// delete process.env.FIRESTORE_EMULATOR_HOST; // Use production db
admin.initializeApp({ projectId: "demitasse-cafe-pilot" });
const db = admin.firestore();

async function test() {
  const p1 = "5ObhyyKvwFbTtEq9kxkE";
  const p2 = "pC5NDUTRkGv5h1CPLXdP";
  const p3 = "y4k2dVAdlz0VE5435fu8";

  console.log("Checking anywhere for product", p1);
  const snap1 = await db.collectionGroup("products").get();
  let found = 0;
  snap1.docs.forEach(d => {
    if (d.id === p1 || d.id === p2 || d.id === p3) {
      console.log("Found product:", d.id, "at path:", d.ref.path);
      found++;
    }
  });
  console.log("Found", found, "matching products in total.");
  process.exit(0);
}

test().catch(console.error);
