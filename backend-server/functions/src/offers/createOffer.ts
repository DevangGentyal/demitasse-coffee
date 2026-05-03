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

    // ✅ Type validation
    const validTypes = ["discount", "bogo", "freebie", "CATEGORY_DISCOUNT"];
    if (!validTypes.includes(data.type)) {
      res.status(400).json({
        success: false,
        message: "Invalid offer type",
      });
      return;
    }

    // ✅ Discount validation
    if (data.type === "discount" || data.type === "CATEGORY_DISCOUNT") {
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

    // ✅ Arrays validation
    if (data.applicableItems !== undefined && !Array.isArray(data.applicableItems)) {
      res.status(400).json({ success: false, message: "applicableItems must be an array" });
      return;
    }
    if (data.rewardItems !== undefined && !Array.isArray(data.rewardItems)) {
      res.status(400).json({ success: false, message: "rewardItems must be an array" });
      return;
    }

    // ✅ BOGO validation
    if (data.type === "bogo") {
      if (!Array.isArray(data.applicableItems) || data.applicableItems.length === 0) {
        res.status(400).json({ success: false, message: "BOGO requires applicableItems" });
        return;
      }
      if (!Array.isArray(data.rewardItems) || data.rewardItems.length === 0) {
        res.status(400).json({ success: false, message: "BOGO requires rewardItems" });
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

    // ✅ usageLimit / perUserLimit validation
    if (data.usageLimit !== undefined && data.usageLimit !== null) {
      if (typeof data.usageLimit !== "number" || data.usageLimit < 1) {
        res.status(400).json({ success: false, message: "usageLimit must be >= 1" });
        return;
      }
    }
    if (data.perUserLimit !== undefined && data.perUserLimit !== null) {
      if (typeof data.perUserLimit !== "number" || data.perUserLimit < 1) {
        res.status(400).json({ success: false, message: "perUserLimit must be >= 1" });
        return;
      }
    }

    // ✅ Create document
    const offerRef = db.collection("offers").doc();

    const offerData = {
      outletId: data.outletId,
      title: data.title.trim(),
      description: data.description || "",

      type: data.type,
      discountValue:
        data.type === "discount" ? data.discountValue : null,

      couponCode: data.couponCode || null,
      applicableFor: data.applicableFor || "all",

      applicableItems: Array.isArray(data.applicableItems) ? data.applicableItems : [],
      rewardItems: Array.isArray(data.rewardItems) ? data.rewardItems : [],
      applicableCategory: data.applicableCategory || null,

      minOrderValue: typeof data.minOrderValue === "number" ? data.minOrderValue : 0,
      perUserLimit: data.perUserLimit ?? null,
      isStackable: data.isStackable ?? false,

      isActive: data.isActive ?? true,
      isTrending: data.isTrending ?? false,
      autoApply: data.autoApply ?? false,
      priority: data.priority ?? 0,

      startDate: startDate,
      endDate: endDate,

      usageLimit: data.usageLimit || null,
      usedCount: 0,

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