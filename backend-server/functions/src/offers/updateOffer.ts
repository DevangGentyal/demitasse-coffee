import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const updateOffer = functions.https.onRequest(async (req, res) => {
  // Set CORS headers
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(200).send("");
    return;
  }

  try {
    const db = admin.firestore();

    if (req.method !== "PUT" && req.method !== "PATCH") {
      res.status(405).json({
        success: false,
        message: "Method not allowed",
      });
      return;
    }

    // Robust body parsing
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const data = body;

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
      if (!validTypes.includes(data.type.toUpperCase())) {
        res.status(400).json({ success: false, message: "Invalid offer type" });
        return;
      }
      data.type = data.type.toUpperCase();
    }
    const finalType = data.type || existingData?.type;

    // ✅ Discount validation
    if (finalType === "DISCOUNT" || finalType === "CATEGORY_DISCOUNT") {
      const existingDiscount = existingData?.config?.discount || {};
      const incomingDiscount = data.config?.discount || {};

      const rawDiscVal = incomingDiscount.discountValue ?? existingDiscount.discountValue;
      const discVal = typeof rawDiscVal === "string" ? parseFloat(rawDiscVal) : rawDiscVal;

      if (typeof discVal !== "number" || isNaN(discVal) || discVal <= 0 || discVal > 100) {
        res.status(400).json({
          success: false,
          message: "Invalid discount value. Must be a number between 1 and 100.",
        });
        return;
      }

      if (data.config?.discount) {
        data.config.discount.discountValue = discVal;
      }

      const discountType = incomingDiscount.type || existingDiscount.type || "PRODUCT";
      if (discountType === "PRODUCT") {
        const pIds = incomingDiscount.productIds || existingDiscount.productIds;
        if (!Array.isArray(pIds) || pIds.length === 0) {
          res.status(400).json({ success: false, message: "DISCOUNT of type PRODUCT requires productIds" });
          return;
        }
      } else if (discountType === "CATEGORY") {
        const cat = incomingDiscount.category || existingDiscount.category;
        if (!cat) {
          res.status(400).json({ success: false, message: "DISCOUNT of type CATEGORY requires a category" });
          return;
        }
      }
    }

    // Prepare update object
    const updateData: any = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
    if (data.endDate !== undefined) updateData.endDate = new Date(data.endDate);

    const startDate = updateData.startDate || existingData?.startDate?.toDate?.() || existingData?.startDate;
    const endDate = updateData.endDate || existingData?.endDate?.toDate?.() || existingData?.endDate;

    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      res.status(400).json({
        success: false,
        message: "startDate must be before endDate",
      });
      return;
    }

    // COMBO validation
    if (finalType === "COMBO") {
      const combo = data.config?.combo !== undefined ? data.config.combo : existingData?.config?.combo;
      if (!Array.isArray(combo) || combo.length === 0) {
        res.status(400).json({ success: false, message: "COMBO requires config.combo array" });
        return;
      }
      const comboPrice = data.config?.comboPrice !== undefined ? data.config.comboPrice : existingData?.config?.comboPrice;
      if (typeof comboPrice !== "number" || comboPrice < 0) {
        res.status(400).json({ success: false, message: "COMBO requires config.comboPrice >= 0" });
        return;
      }
    }

    if (data.title !== undefined) updateData.title = String(data.title).trim();
    if (data.description !== undefined) updateData.description = String(data.description);
    if (data.type !== undefined) updateData.type = data.type;

    if (data.category !== undefined || data.applicableCategory !== undefined) {
      const catVal = data.applicableCategory || data.category;
      if (catVal && catVal.toLowerCase() !== 'discount') {
        updateData.category = catVal;
        updateData.applicableCategory = catVal;
      }
    }

    if (data.isActive !== undefined) updateData.isActive = !!data.isActive;
    if (data.autoApply !== undefined) updateData.autoApply = !!data.autoApply;
    if (data.isStackable !== undefined) updateData.isStackable = !!data.isStackable;
    if (data.priority !== undefined) updateData.priority = Number(data.priority);
    if (data.minOrderValue !== undefined) updateData.minOrderValue = Number(data.minOrderValue);
    if (data.usageLimit !== undefined) updateData.usageLimit = Number(data.usageLimit);

    // Enforce isCustomizable safety for COMBO
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

    if (data.config !== undefined && data.config !== null) {
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
        comboPrice: data.config.comboPrice !== undefined && data.config.comboPrice !== null
          ? Number(data.config.comboPrice)
          : (existingConfig.comboPrice ?? 0),
        b1g1: (data.config.b1g1 != null)
          ? {
            applicableProductIds: Array.isArray(data.config.b1g1.applicableProductIds)
              ? data.config.b1g1.applicableProductIds
              : [],
            type: data.config.b1g1.type || "CHEAPEST_FREE",
          }
          : (existingConfig.b1g1 || null),
        discount: (data.config.discount != null)
          ? {
            type: data.config.discount.type || (existingConfig.discount?.type || 'PRODUCT'),
            productIds: Array.isArray(data.config.discount.productIds)
              ? data.config.discount.productIds
              : (existingConfig.discount?.productIds || []),
            category: data.config.discount.category !== undefined
              ? data.config.discount.category
              : (existingConfig.discount?.category || null),
            discountValue: Number(data.config.discount.discountValue || 0),
            discountType: "PERCENT",
          }
          : (existingConfig.discount || null),
        selection: (data.config.selection != null)
          ? {
            enabled: !!data.config.selection.enabled,
            ...(typeof data.config.selection.maxSelection === "number" ? { maxSelection: data.config.selection.maxSelection } : (existingConfig.selection?.maxSelection ? { maxSelection: existingConfig.selection.maxSelection } : {})),
          }
          : (existingConfig.selection || null),
        freeItem: data.config.freeItem !== undefined ? data.config.freeItem : (existingConfig.freeItem || null),
        loyalty: data.config.loyalty !== undefined ? data.config.loyalty : (existingConfig.loyalty || null),
      };
    }

    if (data.userRules != null) {
      //  const existingRules = existingData?.userRules || {};
      updateData.userRules = {
        birthdayOnly: !!data.userRules.birthdayOnly,
        firstOrderOnly: !!data.userRules.firstOrderOnly,
        inactivityDays: Number(data.userRules.inactivityDays || 0),
        minOrdersRequired: Number(data.userRules.minOrdersRequired || 0),
        perUserLimit: Number(data.userRules.perUserLimit ?? 1),
      };
    }

    if (data.display != null) {
      const existingDisplay = existingData?.display || {};
      updateData.display = {
        badge: data.display.badge || existingDisplay.badge || null,
        highlightText: data.display.highlightText || existingDisplay.highlightText || null,
      };
    }

    await offerRef.update(updateData);

    res.status(200).json({
      success: true,
      message: "Offer updated successfully",
    });

  } catch (error) {
    console.error("updateOffer error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});