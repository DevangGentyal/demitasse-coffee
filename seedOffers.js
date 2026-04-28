const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function migrateOffersToNewSchema() {
  try {
    console.log("🚀 Migrating offers to new schema...");

    const snapshot = await db.collection("offers").get();

    if (snapshot.empty) {
      console.log("❌ No offers found");
      process.exit(0);
    }

    for (const doc of snapshot.docs) {
      const ref = doc.ref;
      const old = doc.data();

      console.log(`👉 Migrating offer: ${doc.id} (type: ${old.type})`);

      // ── Determine new type (uppercase) ──
      const typeMap = {
        discount: "DISCOUNT",
        bogo: "B1G1",
        freebie: "B1G1", // closest match
        DISCOUNT: "DISCOUNT",
        B1G1: "B1G1",
        COMBO: "COMBO",
        BIRTHDAY: "BIRTHDAY",
        NEW_USER: "NEW_USER",
      };
      const newType = typeMap[old.type] || "DISCOUNT";

      // ── Build config ──
      const config = {
        combo: null,
        b1g1: null,
        discountValue: 0,
        freeItem: null,
        loyalty: null,
      };

      if (newType === "DISCOUNT") {
        const type = old.config?.discount?.category ? "CATEGORY" : "PRODUCT";
        config.discount = {
          type: type,
          productIds: type === "PRODUCT"
            ? (Array.isArray(old.applicableItems)
              ? old.applicableItems.map((i) => i.productId || i).filter(Boolean)
              : (old.config?.discount?.productIds || []))
            : [],
          category: type === "CATEGORY" ? (old.config?.discount?.category || null) : null,
          discountValue: typeof old.discountValue === "number" ? old.discountValue : (old.config?.discount?.discountValue || 0),
          discountType: "PERCENT",
        };
        config.selection = {
          enabled: type === "PRODUCT",
          ...(type === "PRODUCT" ? { maxSelection: 1 } : {})
        };
      }
      if (newType === "B1G1") {
        // Try to pull product IDs from old applicableItems
        const productIds = Array.isArray(old.applicableItems)
          ? old.applicableItems.map((i) => i.productId || i).filter(Boolean)
          : [];
        config.b1g1 = {
          applicableProductIds: productIds,
          type: "CHEAPEST_FREE",
        };
      }
      if (newType === "COMBO") {
        config.combo = [
          {
            groupName: "Combo Group",
            isFree: false,
            selectionType: "ONE",
            items: Array.isArray(old.applicableItems)
              ? old.applicableItems.map((i) => ({
                  productId: i.productId || i,
                  isCustomizable: false,
                }))
              : (Array.isArray(old.config?.combo?.items)
                 ? old.config.combo.items.map((i) => ({ productId: i.productId || i, isCustomizable: false }))
                 : []),
          }
        ];
        config.comboPrice = typeof old.comboPrice === "number" 
          ? old.comboPrice 
          : (old.config?.combo?.comboPrice ?? old.config?.comboPrice ?? 0);
      }

      // ── Build userRules ──
      const userRules = {
        birthdayOnly: old.applicableFor === "birthday" || false,
        firstOrderOnly: old.applicableFor === "new_user" || false,
        inactivityDays: 0,
        minOrdersRequired: 0,
        usageLimit: typeof old.usageLimit === "number" ? old.usageLimit : 0,
      };

      if (newType === "BIRTHDAY") userRules.birthdayOnly = true;
      if (newType === "NEW_USER") userRules.firstOrderOnly = true;

      // ── Build display ──
      const display = {
        badge: null,
        highlightText: null,
      };

      // ── Compose new document (EXACT target schema) ──
      const newData = {
        title: old.title || "",
        description: old.description || "",
        type: newType,
        category: old.category || null,

        outletId: old.outletId,
        isActive: old.isActive ?? true,
        autoApply: old.autoApply ?? false,
        isStackable: old.isStackable ?? false,
        priority: old.priority ?? 0,

        startDate: old.startDate || new Date(),
        endDate: old.endDate || new Date(),

        minOrderValue: typeof old.minOrderValue === "number" ? old.minOrderValue : 0,

        config,
        userRules,
        display,

        createdAt: old.createdAt || new Date(),
        updatedAt: new Date(),
      };

      await ref.set(newData, { merge: false }); // full overwrite to new schema

      console.log(`✅ Migrated: ${doc.id} → type: ${newType}`);
    }

    console.log("🎉 ALL OFFERS MIGRATED TO NEW SCHEMA SUCCESSFULLY");
    process.exit(0);

  } catch (error) {
    console.error("❌ ERROR:", error);
    process.exit(1);
  }
}

migrateOffersToNewSchema();