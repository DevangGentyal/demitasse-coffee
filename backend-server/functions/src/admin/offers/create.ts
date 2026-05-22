import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const createOffer = functions.https.onRequest(async (req, res) => {
	res.set("Access-Control-Allow-Origin", "*");
	res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE");
	res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

	if (req.method === "OPTIONS") { res.status(200).send(""); return; }

	try {
		const db = admin.firestore();
		if (req.method !== "POST") { res.status(405).json({ success: false, message: "Method not allowed" }); return; }

		const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
		const data = body;
		if (!data.outletId || !data.title || !data.type || !data.startDate || !data.endDate) { res.status(400).json({ success: false, message: "Missing required fields" }); return; }

		const validTypes = ["DISCOUNT", "CATEGORY_DISCOUNT", "B1G1", "COMBO", "BIRTHDAY", "NEW_USER", "BOGO", "FREEBIE"];
		if (!validTypes.includes(data.type)) { res.status(400).json({ success: false, message: "Invalid offer type" }); return; }

		if (data.type === "DISCOUNT" || data.type === "CATEGORY_DISCOUNT") {
			const rawDiscountVal = data.discountValue ?? data.config?.discount?.discountValue;
			const discountVal = typeof rawDiscountVal === "string" ? parseFloat(rawDiscountVal) : rawDiscountVal;
			if (typeof discountVal !== "number" || isNaN(discountVal) || discountVal <= 0 || discountVal > 100) { res.status(400).json({ success: false, message: "Invalid discount value. Must be a number between 1 and 100." }); return; }
			data.discountValue = discountVal;
			if (data.config?.discount) data.config.discount.discountValue = discountVal;
		}

		const startDate = new Date(data.startDate);
		const endDate = new Date(data.endDate);
		if (startDate >= endDate) { res.status(400).json({ success: false, message: "startDate must be before endDate" }); return; }

		const offerRef = db.collection("offers").doc();
		await offerRef.set({
			title: String(data.title).trim(),
			description: String(data.description || ""),
			type: data.type,
			applicableCategory: data.applicableCategory || data.category || null,
			category: data.category || data.applicableCategory || null,
			outletId: data.outletId,
			isActive: data.isActive ?? true,
			autoApply: !!data.autoApply,
			isStackable: !!data.isStackable,
			priority: Number(data.priority || 0),
			startDate,
			endDate,
			minOrderValue: Number(data.minOrderValue || 0),
			usageLimit: Number(data.usageLimit || 0),
			usedCount: 0,
			config: data.config || null,
			userRules: data.userRules || null,
			display: data.display || null,
			createdAt: FieldValue.serverTimestamp(),
			updatedAt: FieldValue.serverTimestamp(),
		});

		res.status(201).json({ success: true, message: "Offer created successfully", data: { offerId: offerRef.id } });
	} catch (error) {
		console.error("createOffer error:", error);
		res.status(500).json({ success: false, message: "Internal server error", error: error instanceof Error ? error.message : String(error) });
	}
});
