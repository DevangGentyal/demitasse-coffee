import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const createOffer = functions.https.onRequest(async (req, res) => {
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

    if (req.method !== "POST") {
      res.status(405).json({
        success: false,
        message: "Method not allowed",
      });
      return;
    }

    // Robust body parsing
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const data = body;

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
        message: "Invalid offer type",
      });
      return;
    }

    // ✅ Discount validation
    if (data.type === "DISCOUNT" || data.type === "CATEGORY_DISCOUNT") {
      const rawDiscountVal = data.discountValue ?? data.config?.discount?.discountValue;
      const discountVal = typeof rawDiscountVal === "string" ? parseFloat(rawDiscountVal) : rawDiscountVal;
      
      if (typeof discountVal !== "number" || isNaN(discountVal) || discountVal <= 0 || discountVal > 100) {
        res.status(400).json({
          success: false,
          message: "Invalid discount value. Must be a number between 1 and 100.",
        });
        return;
      }
      
      data.discountValue = discountVal;
      if (data.config?.discount) {
        data.config.discount.discountValue = discountVal;
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
      comboPrice: Number(data.config?.comboPrice || 0),
      b1g1: data.config?.b1g1
        ? {
          applicableProductIds: Array.isArray(data.config.b1g1.applicableProductIds)
            ? data.config.b1g1.applicableProductIds
            : [],
          type: data.config.b1g1.type || "CHEAPEST_FREE",
        }
        : null,
      discount: (data.type === "DISCOUNT" || data.type === "CATEGORY_DISCOUNT")
        ? {
          type: data.config?.discount?.type || (data.type === "CATEGORY_DISCOUNT" ? "CATEGORY" : "PRODUCT"),
          productIds: Array.isArray(data.config?.discount?.productIds) ? data.config.discount.productIds : [],
          category: data.config?.discount?.category || data.applicableCategory || data.category || null,
          discountValue: Number(data.discountValue || 0),
          discountType: "PERCENT",
        }
        : (data.config?.discount || null),
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
      birthdayOnly: !!data.userRules?.birthdayOnly,
      firstOrderOnly: !!data.userRules?.firstOrderOnly,
      inactivityDays: Number(data.userRules?.inactivityDays || 0),
      minOrdersRequired: Number(data.userRules?.minOrdersRequired || 0),
      perUserLimit: Number(data.userRules?.perUserLimit ?? 1),
    };

    const display = {
      badge: data.display?.badge || null,
      highlightText: data.display?.highlightText || null,
    };

    const offerRef = db.collection("offers").doc();

    const offerData = {
      title: String(data.title).trim(),
      description: String(data.description || ""),
      type: data.type,
      applicableCategory: (data.applicableCategory && data.applicableCategory.toLowerCase() !== 'discount') 
        ? data.applicableCategory 
        : (data.category && data.category.toLowerCase() !== 'discount' ? data.category : (data.config?.discount?.category && data.config.discount.category.toLowerCase() !== 'discount' ? data.config.discount.category : null)),
      category: (data.category && data.category.toLowerCase() !== 'discount') 
        ? data.category 
        : (data.applicableCategory && data.applicableCategory.toLowerCase() !== 'discount' ? data.applicableCategory : (data.config?.discount?.category && data.config.discount.category.toLowerCase() !== 'discount' ? data.config.discount.category : null)),

      outletId: data.outletId,
      isActive: data.isActive ?? true,
      autoApply: !!data.autoApply,
      isStackable: !!data.isStackable,
      priority: Number(data.priority || 0),
      startDate: startDate,
      endDate: endDate,
      minOrderValue: Number(data.minOrderValue || 0),
      usageLimit: Number(data.usageLimit || 0),
      usedCount: 0,
      config,
      userRules,
      display,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await offerRef.set(offerData);

    res.status(201).json({
      success: true,
      message: "Offer created successfully",
      data: {
        offerId: offerRef.id,
      },
    });
  } catch (error) {
    console.error("createOffer error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});