import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

export const createOffer = functions.https.onRequest(async (req, res) => {
  try {
    const db = admin.firestore();

    // ✅ Only POST allowed
    if (req.method !== "POST") {
      res.status(405).json({
        success: false,
        message: "Method not allowed",
      });
      return;
    }

    const data = req.body;

    // ✅ Required fields validation
    if (
      !data.outletId ||
      !data.title ||
      !data.type ||
      !data.startDate ||
      !data.endDate
    ) {
      res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
      return;
    }

    const validTypes = [
      "DISCOUNT",
      "CATEGORY_DISCOUNT",
      "B1G1",
      "COMBO",
      "BIRTHDAY",
      "NEW_USER",
      "BOGO",
      "FREEBIE"
    ];

    if (!validTypes.includes(data.type)) {
      res.status(400).json({
        success: false,
        message: "Invalid offer type. Must be one of: " + validTypes.join(", "),
      });
      return;
    }

    // ✅ Discount validation

    if (data.type === "DISCOUNT" || data.type === "CATEGORY_DISCOUNT") {
      if (
        typeof data.discountValue !== "number" ||
        data.discountValue <= 0 ||
        data.discountValue > 100
      ) {
        res.status(400).json({
          success: false,
          message: "Invalid discount value",
        });

        return;
      }
    }

    // ✅ Date validation
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    if (startDate >= endDate) {
      res.status(400).json({
        success: false,
        message: "startDate must be before endDate",
      });
      return;
    }

    // ✅ B1G1 validation
    if (data.type === "B1G1") {
      const productIds = data.config?.b1g1?.applicableProductIds;
      if (!Array.isArray(productIds) || productIds.length === 0) {
        res.status(400).json({
          success: false,
          message: "B1G1 requires config.b1g1.applicableProductIds with at least 1 product",
        });
        return;
      }
    }

    // ✅ COMBO validation
    if (data.type === "COMBO") {
      const combo = data.config?.combo;
      if (!Array.isArray(combo) || combo.length === 0) {
        res.status(400).json({
          success: false,
          message: "COMBO requires config.combo array with at least 1 group",
        });
        return;
      }
      for (const group of combo) {
        if (!Array.isArray(group.items) || group.items.length === 0) {
          res.status(400).json({
            success: false,
            message: "Each COMBO group must have at least 1 item",
          });
          return;
        }
      }
      if (typeof data.config?.comboPrice !== "number" || data.config.comboPrice < 0) {
        res.status(400).json({
          success: false,
          message: "COMBO requires config.comboPrice >= 0",
        });
        return;
      }
    }

    // ✅ priority validation
    if (data.priority !== undefined) {
      if (typeof data.priority !== "number" || data.priority < 0) {
        res.status(400).json({ success: false, message: "Priority must be a number >= 0" });
        return;
      }
    }

    // ✅ Enforce isCustomizable safety for COMBO
    if (data.type === "COMBO" && Array.isArray(data.config?.combo)) {
      try {
        const productRefs: { group: any; item: any }[] = [];
        data.config.combo.forEach((group: any) => {
          if (Array.isArray(group.items)) {
            group.items.forEach((item: any) => {
              if (item.isCustomizable && item.productId) {
                productRefs.push({ group, item });
              }
            });
          }
        });

        if (productRefs.length > 0) {
          const productDocs = await Promise.all(
            productRefs.map(p => db.collection("products").doc(p.item.productId).get())
          );
          productDocs.forEach((doc, idx) => {
            const category = doc.data()?.category?.toLowerCase();
            if (!doc.exists || category !== "coffee") {
              productRefs[idx].item.isCustomizable = false;
            }
          });
        }
      } catch (e) {
        console.error("Error validating product categories for customization", e);
      }
    }

    // ✅ Build full nested config object
    const config = {
      combo: Array.isArray(data.config?.combo)
        ? data.config.combo.map((group: any) => ({
          groupName: group.groupName || "Combo Group",
          isFree: !!group.isFree,
          selectionType: group.selectionType === "MULTIPLE" ? "MULTIPLE" : "ONE",
          items: Array.isArray(group.items) ? group.items.map((item: any) => ({
            productId: item.productId,
            isCustomizable: !!item.isCustomizable,
          })) : [],
        }))
        : null,
      comboPrice: typeof data.config?.comboPrice === "number" ? data.config.comboPrice : 0,
      b1g1: data.config?.b1g1
        ? {
          applicableProductIds: Array.isArray(data.config.b1g1.applicableProductIds)
            ? data.config.b1g1.applicableProductIds
            : [],
          type: data.config.b1g1.type || "CHEAPEST_FREE",
        }
        : null,
      discount: data.config?.discount
        ? {
          type: data.config.discount.type,
          productIds: Array.isArray(data.config.discount.productIds) ? data.config.discount.productIds : [],
          category: data.config.discount.category || null,
          discountValue: typeof data.config.discount.discountValue === "number" ? data.config.discount.discountValue : 0,
          discountType: "PERCENT",
        }
        : null,
      selection: data.config?.selection
        ? {
          enabled: !!data.config.selection.enabled,
          ...(typeof data.config.selection.maxSelection === "number" ? { maxSelection: data.config.selection.maxSelection } : {}),
        }
        : null,
      freeItem: data.config?.freeItem || null,
      loyalty: data.config?.loyalty || null,
    };

    // ✅ Build full nested userRules object
    const userRules = {
      birthdayOnly: data.userRules?.birthdayOnly ?? false,
      firstOrderOnly: data.userRules?.firstOrderOnly ?? false,
      inactivityDays: typeof data.userRules?.inactivityDays === "number"
        ? data.userRules.inactivityDays
        : 0,
      minOrdersRequired: typeof data.userRules?.minOrdersRequired === "number"
        ? data.userRules.minOrdersRequired
        : 0,
      usageLimit: typeof data.userRules?.usageLimit === "number"
        ? data.userRules.usageLimit
        : 0,
    };

    // ✅ Build full nested display object
    const display = {
      badge: data.display?.badge || null,
      highlightText: data.display?.highlightText || null,
    };

    // ✅ Create document
    const offerRef = db.collection("offers").doc();

    const offerData = {
      title: data.title.trim(),
      description: data.description || "",
      type: data.type,
      category: data.category || null,

      outletId: data.outletId,
      isActive: data.isActive ?? true,
      autoApply: data.autoApply ?? false,
      isStackable: data.isStackable ?? false,
      priority: data.priority ?? 0,

      startDate: startDate,
      endDate: endDate,

      minOrderValue: typeof data.minOrderValue === "number" ? data.minOrderValue : 0,

      config,
      userRules,
      display,

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await offerRef.set(offerData);

    res.status(201).json({
      success: true,
      message: "Offer created successfully",
      data: {
        offerId: offerRef.id,
      },
    });
    return;

  } catch (error) {
    console.error("createOffer error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
    return;
  }
});