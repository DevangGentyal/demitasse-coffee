import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

export const updateOffer = functions.https.onRequest(async (req, res) => {
  try {
    const db = admin.firestore();

    // ✅ Only PUT/PATCH allowed
    if (req.method !== "PUT" && req.method !== "PATCH") {
      res.status(405).json({
        success: false,
        message: "Method not allowed",
      });
      return;
    }

    const data = req.body;

    // ✅ Required
    if (!data.offerId) {
      res.status(400).json({
        success: false,
        message: "offerId is required",
      });
      return;
    }

    const offerRef = db.collection("offers").doc(data.offerId);
    const offerSnap = await offerRef.get();

    if (!offerSnap.exists) {
      res.status(404).json({
        success: false,
        message: "Offer not found",
      });
      return;
    }

    const existingData = offerSnap.data();


    // ✅ Type validation
    if (data.type) {
      const validTypes = ["discount", "bogo", "freebie", "CATEGORY_DISCOUNT"];
      if (!validTypes.includes(data.type)) {
        res.status(400).json({ success: false, message: "Invalid offer type" });
        return;
      }

    }
    const finalType = data.type || existingData?.type;

    // ✅ Discount validation
    if (finalType === "DISCOUNT") {
      const discount = data.config?.discount !== undefined ? data.config.discount : existingData?.config?.discount;
      if (!discount) {
        res.status(400).json({ success: false, message: "DISCOUNT requires config.discount object" });
        return;
      }
      const discVal = discount.discountValue;
      if (typeof discVal !== "number" || discVal <= 0 || discVal > 100) {
        res.status(400).json({ success: false, message: "DISCOUNT requires config.discount.discountValue > 0 and <= 100" });
        return;
      }
      if (discount.type === "PRODUCT") {
        if (!Array.isArray(discount.productIds) || discount.productIds.length === 0) {
          res.status(400).json({ success: false, message: "DISCOUNT of type PRODUCT requires productIds" });
          return;
        }
      } else if (discount.type === "CATEGORY") {
        if (!discount.category) {
          res.status(400).json({ success: false, message: "DISCOUNT of type CATEGORY requires a category" });
          return;
        }
      }
    }

    // ✅ Date validation (if updating)
    const startDate = data.startDate
      ? new Date(data.startDate)
      : existingData?.startDate?.toDate?.() || existingData?.startDate;

    const endDate = data.endDate
      ? new Date(data.endDate)
      : existingData?.endDate?.toDate?.() || existingData?.endDate;

    if (startDate && endDate && startDate >= endDate) {
      res.status(400).json({
        success: false,
        message: "startDate must be before endDate",
      });
      return;
    }

    // ✅ B1G1 validation
    if (finalType === "B1G1") {
      const productIds = data.config?.b1g1?.applicableProductIds !== undefined
        ? data.config.b1g1.applicableProductIds
        : existingData?.config?.b1g1?.applicableProductIds;

      if (!Array.isArray(productIds) || productIds.length === 0) {
        res.status(400).json({
          success: false,
          message: "B1G1 requires config.b1g1.applicableProductIds with at least 1 product",
        });
        return;
      }
    }

    // ✅ COMBO validation
    if (finalType === "COMBO") {
      const combo = data.config?.combo !== undefined ? data.config.combo : existingData?.config?.combo;
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

      const comboPrice = data.config?.comboPrice !== undefined ? data.config.comboPrice : existingData?.config?.comboPrice;
      if (typeof comboPrice !== "number" || comboPrice < 0) {
        res.status(400).json({
          success: false,
          message: "COMBO requires config.comboPrice >= 0",
        });
        return;
      }
    }

    // ✅ priority validation
    if (data.priority !== undefined && data.priority !== null) {
      if (typeof data.priority !== "number" || data.priority < 0) {
        res.status(400).json({ success: false, message: "Priority must be a number >= 0" });
        return;
      }
    }

    // ✅ Prepare update object
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (data.title !== undefined) updateData.title = data.title.trim();
    if (data.description !== undefined) updateData.description = data.description;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.category !== undefined) updateData.category = data.category;

    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.autoApply !== undefined) updateData.autoApply = data.autoApply;
    if (data.isStackable !== undefined) updateData.isStackable = data.isStackable;
    if (data.priority !== undefined) updateData.priority = data.priority;

    if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
    if (data.endDate !== undefined) updateData.endDate = new Date(data.endDate);

    if (data.minOrderValue !== undefined) updateData.minOrderValue = data.minOrderValue;

    // ✅ Enforce isCustomizable safety for COMBO
    if (finalType === "COMBO" && data.config?.combo && Array.isArray(data.config.combo)) {
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

    // ✅ Full nested config — merge with existing if partial update
    if (data.config !== undefined) {
      const existingConfig = existingData?.config || {};
      updateData.config = {
        combo: Array.isArray(data.config.combo)
          ? data.config.combo.map((group: any) => ({
            groupName: group.groupName || "Combo Group",
            isFree: !!group.isFree,
            selectionType: group.selectionType === "MULTIPLE" ? "MULTIPLE" : "ONE",
            items: Array.isArray(group.items) ? group.items.map((item: any) => ({
              productId: item.productId,
              isCustomizable: !!item.isCustomizable,
            })) : [],
          }))
          : (existingConfig.combo || null),
        comboPrice: data.config.comboPrice !== undefined
          ? (typeof data.config.comboPrice === "number" ? data.config.comboPrice : 0)
          : (existingConfig.comboPrice ?? 0),
        b1g1: data.config.b1g1 !== undefined
          ? {
            applicableProductIds: Array.isArray(data.config.b1g1.applicableProductIds)
              ? data.config.b1g1.applicableProductIds
              : [],
            type: data.config.b1g1.type || "CHEAPEST_FREE",
          }
          : (existingConfig.b1g1 || null),
        discount: data.config.discount !== undefined
          ? {
            type: data.config.discount.type || (existingConfig.discount?.type || 'PRODUCT'),
            productIds: Array.isArray(data.config.discount.productIds)
              ? data.config.discount.productIds
              : (existingConfig.discount?.productIds || []),
            category: data.config.discount.category !== undefined
              ? data.config.discount.category
              : (existingConfig.discount?.category || null),
            discountValue: typeof data.config.discount.discountValue === "number"
              ? data.config.discount.discountValue
              : (existingConfig.discount?.discountValue ?? 0),
            discountType: "PERCENT",
          }
          : (existingConfig.discount || null),
        selection: data.config.selection !== undefined
          ? {
            enabled: data.config.selection.enabled !== undefined ? !!data.config.selection.enabled : (existingConfig.selection?.enabled ?? false),
            ...(typeof data.config.selection.maxSelection === "number" ? { maxSelection: data.config.selection.maxSelection } : (existingConfig.selection?.maxSelection ? { maxSelection: existingConfig.selection.maxSelection } : {})),
          }
          : (existingConfig.selection || null),
        freeItem: data.config.freeItem !== undefined
          ? data.config.freeItem
          : (existingConfig.freeItem || null),
        loyalty: data.config.loyalty !== undefined
          ? data.config.loyalty
          : (existingConfig.loyalty || null),
      };
    }

    // ✅ Full nested userRules — merge with existing if partial update
    if (data.userRules !== undefined) {
      const existingRules = existingData?.userRules || {};
      updateData.userRules = {
        birthdayOnly: data.userRules.birthdayOnly ?? (existingRules.birthdayOnly ?? false),
        firstOrderOnly: data.userRules.firstOrderOnly ?? (existingRules.firstOrderOnly ?? false),
        inactivityDays: typeof data.userRules.inactivityDays === "number"
          ? data.userRules.inactivityDays
          : (existingRules.inactivityDays ?? 0),
        minOrdersRequired: typeof data.userRules.minOrdersRequired === "number"
          ? data.userRules.minOrdersRequired
          : (existingRules.minOrdersRequired ?? 0),
        usageLimit: typeof data.userRules.usageLimit === "number"
          ? data.userRules.usageLimit
          : (existingRules.usageLimit ?? 0),
      };
    }

    // ✅ Full nested display — merge with existing if partial update
    if (data.display !== undefined) {
      const existingDisplay = existingData?.display || {};
      updateData.display = {
        badge: data.display.badge !== undefined
          ? data.display.badge
          : (existingDisplay.badge || null),
        highlightText: data.display.highlightText !== undefined
          ? data.display.highlightText
          : (existingDisplay.highlightText || null),
      };
    }

    await offerRef.update(updateData);

    res.status(200).json({
      success: true,
      message: "Offer updated successfully",
    });
    return;

  } catch (error) {
    console.error("updateOffer error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
    return;
  }
});