/**
 * DEV / PILOT ONLY
 * Firestore seed script for Demitasse Cafe
 */

const admin = require("firebase-admin");

// Uses your logged-in Firebase CLI credentials
admin.initializeApp({
    projectId: "demitasse-cafe-pilot",
  });
  
const db = admin.firestore();

async function seed() {
  /* =======================
     1️⃣ OUTLETS
  ======================= */
  await db.collection("outlets").doc("outlet_001").set({
    name: "Demitasse Coffee – Wakad",
    managerName: "Rahul Patil",
    location: "Wakad, Pune",
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  /* =======================
     2️⃣ TABLES
  ======================= */
  await db.collection("tables").doc("table_01").set({
    outletId: "outlet_001",
    label: "Table 1",
    isOccupied: false,
    activeSessionId: null,
  });

  await db.collection("tables").doc("table_02").set({
    outletId: "outlet_001",
    label: "Table 2",
    isOccupied: false,
    activeSessionId: null,
  });

  /* =======================
     3️⃣ PRODUCTS
  ======================= */
  await db.collection("products").doc("product_cappuccino").set({
    outletId: "outlet_001",
    name: "Cappuccino",
    price: 160,
    taxPercent: 5,
    category: "Coffee",
    isVeg: true,
    isAvailable: true,
    sortOrder: 1,
    imageUrl: "https://example.com/cappuccino.jpg",
    customizations: [
      { label: "Extra Sugar", price: 10 },
      { label: "Large Size", price: 40 },
    ],
  });

  await db.collection("products").doc("product_brownie").set({
    outletId: "outlet_001",
    name: "Chocolate Brownie",
    price: 120,
    taxPercent: 5,
    category: "Dessert",
    isVeg: true,
    isAvailable: true,
    sortOrder: 2,
    imageUrl: "https://example.com/brownie.jpg",
    customizations: [],
  });

  /* =======================
     4️⃣ OFFERS
  ======================= */
  await db.collection("offers").doc("WELCOME10").set({
    outletId: "outlet_001",
    code: "WELCOME10",
    applicableProductIds: ["product_cappuccino", "product_brownie"],
    isVegOnly: true,
    discountType: "PERCENT",
    discountValue: 10,
    isActive: true,
    validTill: admin.firestore.Timestamp.fromDate(
      new Date("2026-03-31T23:59:59")
    ),
  });

  /* =======================
     5️⃣ SESSIONS
  ======================= */
  await db.collection("sessions").doc("session_001").set({
    outletId: "outlet_001",
    tableId: "table_01",
    status: "ACTIVE",
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
    closedAt: null,
  });

  /* =======================
     6️⃣ ORDERS
  ======================= */
  await db.collection("orders").doc("order_001").set({
    sessionId: "session_001",
    outletId: "outlet_001",
    tableId: "table_01",
    items: [
      {
        productId: "product_cappuccino",
        name: "Cappuccino",
        qty: 2,
        unitPrice: 160,
      },
    ],
    subtotal: 320,
    tax: 16,
    discount: 32,
    finalAmount: 304,
    paymentStatus: "PENDING",
    orderStatus: "CREATED",
    couponCode: "WELCOME10",
    orderSource: "QR",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  /* =======================
     7️⃣ PAYMENTS
  ======================= */
  await db.collection("payments").doc("payment_001").set({
    orderId: "order_001",
    amount: 304,
    method: "UPI",
    gatewayTxnId: "razorpay_txn_123456",
    status: "SUCCESS",
    paidAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  /* =======================
     8️⃣ CUSTOMERS
  ======================= */
  await db.collection("customers").doc("customer_001").set({
    phone: "+919876543210",
    totalOrders: 3,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  /* =======================
     9️⃣ LOYALTY TRANSACTIONS
  ======================= */
  await db.collection("loyaltyTransactions").doc("loyalty_001").set({
    customerId: "customer_001",
    orderId: "order_001",
    pointsEarned: 15,
    pointsRedeemed: 0,
    balanceAfter: 15,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  /* =======================
     🔟 DAILY REPORTS (AGGREGATED)
  ======================= */
  await db.collection("dailyReports").doc("outlet_001_2026-02-02").set({
    outletId: "outlet_001",
    date: "2026-02-02",
    totalOrders: 1,
    totalRevenue: 304,
    sourceBreakdown: {
      QR: 1,
      ZOMATO: 0,
      SWIGGY: 0,
    },
  });

  console.log("✅ Firestore seeded successfully");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seeding failed", err);
    process.exit(1);
  });
