import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const updateOffer = functions.https.onRequest(async (req, res) => {
	res.set("Access-Control-Allow-Origin", "*");
	res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE");
	res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

	if (req.method === "OPTIONS") { res.status(200).send(""); return; }

	try {
		const db = admin.firestore();
		if (req.method !== "PUT" && req.method !== "PATCH") { res.status(405).json({ success: false, message: "Method not allowed" }); return; }

		const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
		const data = body;
		if (!data.offerId) { res.status(400).json({ success: false, message: "offerId is required" }); return; }

		const offerRef = db.collection("offers").doc(data.offerId);
		const offerSnap = await offerRef.get();
		if (!offerSnap.exists) { res.status(404).json({ success: false, message: "Offer not found" }); return; }

		const existingData = offerSnap.data();
		if (data.type) {
			const validTypes = ["DISCOUNT", "CATEGORY_DISCOUNT", "B1G1", "COMBO", "BIRTHDAY", "NEW_USER", "BOGO", "FREEBIE"];
			if (!validTypes.includes(data.type.toUpperCase())) { res.status(400).json({ success: false, message: "Invalid offer type" }); return; }
			data.type = data.type.toUpperCase();
		}
		const finalType = data.type || existingData?.type;

		if (finalType === "DISCOUNT" || finalType === "CATEGORY_DISCOUNT") {
			const existingDiscount = existingData?.config?.discount || {};
			const incomingDiscount = data.config?.discount || {};
			const rawDiscVal = incomingDiscount.discountValue ?? existingDiscount.discountValue;
			const discVal = typeof rawDiscVal === "string" ? parseFloat(rawDiscVal) : rawDiscVal;
			if (typeof discVal !== "number" || isNaN(discVal) || discVal <= 0 || discVal > 100) { res.status(400).json({ success: false, message: "Invalid discount value. Must be a number between 1 and 100." }); return; }
			if (data.config?.discount) data.config.discount.discountValue = discVal;
		}

		const updateData: any = { updatedAt: FieldValue.serverTimestamp() };
		if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
		if (data.endDate !== undefined) updateData.endDate = new Date(data.endDate);
		if (data.title !== undefined) updateData.title = String(data.title).trim();
		if (data.description !== undefined) updateData.description = String(data.description);
		if (data.type !== undefined) updateData.type = data.type;
		if (data.category !== undefined || data.applicableCategory !== undefined) {
			const catVal = data.applicableCategory || data.category;
			if (catVal && catVal.toLowerCase() !== 'discount') { updateData.category = catVal; updateData.applicableCategory = catVal; }
		}
		if (data.isActive !== undefined) updateData.isActive = !!data.isActive;
		if (data.autoApply !== undefined) updateData.autoApply = !!data.autoApply;
		if (data.isStackable !== undefined) updateData.isStackable = !!data.isStackable;
		if (data.priority !== undefined) updateData.priority = Number(data.priority);
		if (data.minOrderValue !== undefined) updateData.minOrderValue = Number(data.minOrderValue);
		if (data.usageLimit !== undefined) updateData.usageLimit = Number(data.usageLimit);

		if (data.config !== undefined && data.config !== null) updateData.config = data.config;
		if (data.userRules != null) updateData.userRules = data.userRules;
		if (data.display != null) updateData.display = data.display;

		await offerRef.update(updateData);
		res.status(200).json({ success: true, message: "Offer updated successfully" });
	} catch (error) {
		console.error("updateOffer error:", error);
		res.status(500).json({ success: false, message: "Internal server error", error: error instanceof Error ? error.message : String(error) });
	}
});
