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

    // ✅ Type validation (if updating)
    const validTypes = ["discount", "bogo", "freebie"];
    if (data.type && !validTypes.includes(data.type)) {
      res.status(400).json({
        success: false,
        message: "Invalid offer type",
      });
      return;
    }

    const finalType = data.type || existingData?.type;

    // ✅ Discount validation
    if (finalType === "discount") {
      const discountValue =
        data.discountValue !== undefined
          ? data.discountValue
          : existingData?.discountValue;

      if (
        typeof discountValue !== "number" ||
        discountValue <= 0 ||
        discountValue > 100
      ) {
        res.status(400).json({
          success: false,
          message: "Invalid discount value",
        });
        return;
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
    if (finalType === "bogo") {
      const appItems = data.applicableItems !== undefined ? data.applicableItems : existingData?.applicableItems;
      const rewItems = data.rewardItems !== undefined ? data.rewardItems : existingData?.rewardItems;
      if (!Array.isArray(appItems) || appItems.length === 0) {
        res.status(400).json({ success: false, message: "BOGO requires applicableItems" });
        return;
      }
      if (!Array.isArray(rewItems) || rewItems.length === 0) {
        res.status(400).json({ success: false, message: "BOGO requires rewardItems" });
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

    // ✅ Prepare update object
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (data.title !== undefined) updateData.title = data.title.trim();
    if (data.description !== undefined) updateData.description = data.description;

    if (data.type !== undefined) updateData.type = data.type;

    if (data.discountValue !== undefined) {
      updateData.discountValue =
        finalType === "discount" ? data.discountValue : null;
    }

    if (data.couponCode !== undefined)
      updateData.couponCode = data.couponCode || null;

    if (data.applicableFor !== undefined)
      updateData.applicableFor = data.applicableFor;

    if (data.applicableItems !== undefined) updateData.applicableItems = data.applicableItems;
    if (data.rewardItems !== undefined) updateData.rewardItems = data.rewardItems;
    if (data.applicableCategory !== undefined) updateData.applicableCategory = data.applicableCategory;

    if (data.minOrderValue !== undefined) updateData.minOrderValue = data.minOrderValue;
    if (data.perUserLimit !== undefined) updateData.perUserLimit = data.perUserLimit;
    if (data.isStackable !== undefined) updateData.isStackable = data.isStackable;

    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.isTrending !== undefined) updateData.isTrending = data.isTrending;
    if (data.autoApply !== undefined) updateData.autoApply = data.autoApply;
    if (data.priority !== undefined) updateData.priority = data.priority;

    if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
    if (data.endDate !== undefined) updateData.endDate = new Date(data.endDate);

    if (data.usageLimit !== undefined)
      updateData.usageLimit = data.usageLimit || null;

    // ❌ DO NOT update usedCount manually

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