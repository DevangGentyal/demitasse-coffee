import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

interface UpdateProductRequest {
	productId: string;
	outletId?: string;
	name?: string;
	category?: string;
	subcategory?: string;
	price?: number;
	taxPercent?: number;
	isVeg?: boolean;
	imageUrl?: string;
	customizations?: any[];
	variations?: any[];
	sortOrder?: number;
	isAvailable?: boolean;
}

export const updateProduct = functions.https.onRequest(
	async (req, res): Promise<void> => {
		res.set("Access-Control-Allow-Origin", "*");
		res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE");
		res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");



		if (req.method === "OPTIONS") {
			res.status(200).send("");
			return;
		}

		try {
			const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
			const data: UpdateProductRequest = body;

			console.log(
				"[updateProduct] body",
				JSON.stringify(data, null, 2)
			);
			console.log(
				"[updateProduct] outletId",
				data.outletId
			);

			if (!data || !data.productId) {
				res.status(400).json({ success: false, message: "productId is required" });
				return;
			}

			const db = admin.firestore();
			let productRef = null;
			const outletId = data.outletId || "";
			if (outletId) {
				productRef = db.collection("outlets").doc(outletId).collection("products").doc(data.productId);
			} else {
				const querySnap = await db.collectionGroup("products").where(admin.firestore.FieldPath.documentId(), "==", data.productId).limit(1).get();
				if (!querySnap.empty) {
					productRef = querySnap.docs[0].ref;
				}
			}

			if (!productRef) {
				res.status(404).json({ success: false, message: "Product not found" });
				return;
			}
			const productSnap = await productRef.get();

			if (!productSnap.exists) {
				res.status(404).json({ success: false, message: "Product not found" });
				return;
			}

			const updateData: any = {};
			if (data.name !== undefined) updateData.name = data.name.trim();
			if (data.category !== undefined) updateData.category = data.category;
			if (data.subcategory !== undefined) updateData.subcategory = data.subcategory;
			if (data.price !== undefined) {
				const p = Number(data.price);
				if (isNaN(p) || p < 0) {
					res.status(400).json({ success: false, message: "Invalid price" });
					return;
				}
				updateData.price = p;
			}
			if (data.taxPercent !== undefined) {
				const t = Number(data.taxPercent);
				if (isNaN(t) || t < 0 || t > 100) {
					res.status(400).json({ success: false, message: "Invalid taxPercent" });
					return;
				}
				updateData.taxPercent = t;
			}
			if (data.isVeg !== undefined) updateData.isVeg = !!data.isVeg;
			if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;
			if (data.customizations !== undefined) updateData.customizations = data.customizations;
			if (data.variations !== undefined) updateData.variations = data.variations;
			if (data.sortOrder !== undefined) updateData.sortOrder = Number(data.sortOrder);
			if (data.isAvailable !== undefined) updateData.isAvailable = String(data.isAvailable) === "true" || data.isAvailable === true;

			updateData.updatedAt = FieldValue.serverTimestamp();
			updateData["priceRaw"] = FieldValue.delete();

			await productRef.update(updateData);

			res.status(200).json({ success: true, message: "Product updated successfully" });
		} catch (error) {
			console.error("updateProduct error:", error);
			res.status(500).json({ success: false, message: "Internal server error", error: error instanceof Error ? error.message : String(error) });
		}
	}
);
