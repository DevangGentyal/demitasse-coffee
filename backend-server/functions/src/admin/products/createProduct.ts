import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

interface CreateProductRequest {
	outletId: string;
	name: string;
	category: string;
	subcategory?: string;
	price: number;
	taxPercent?: number | null;
	isVeg?: boolean;
	imageUrl?: string;
	customizations?: any[];
	variations?: any[];
	sortOrder?: number;
}

export const createProduct = functions.https.onRequest(
	async (req, res): Promise<void> => {
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
				res.status(405).json({ success: false, message: "Method not allowed" });
				return;
			}

			const data: CreateProductRequest = req.body;
			if (!data.outletId || !data.name || !data.category || data.price === undefined) {
				res.status(400).json({ success: false, message: "Missing required fields" });
				return;
			}

			if (typeof data.price !== "number" || data.price < 0) {
				res.status(400).json({ success: false, message: "Invalid price" });
				return;
			}

			if (data.taxPercent !== undefined && data.taxPercent !== null) {
				if (typeof data.taxPercent !== "number" || data.taxPercent < 0 || data.taxPercent > 100) {
					res.status(400).json({ success: false, message: "Invalid taxPercent" });
					return;
				}
			}

			const productRef = db.collection("outlets").doc(data.outletId).collection("products").doc();
			const productDoc: any = {
				id: productRef.id,
				outletId: data.outletId,
				name: data.name.trim(),
				category: data.category,
				subcategory: data.subcategory || null,
				price: data.price,
				taxPercent: data.taxPercent,
				isVeg: data.isVeg ?? true,
				isAvailable: true,
				imageUrl: data.imageUrl || "",
				customizations: Array.isArray(data.customizations) ? data.customizations : [],
				variations: Array.isArray(data.variations) ? data.variations : [],
				sortOrder: data.sortOrder ?? 0,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			// Remove any keys that have null or undefined values
			Object.keys(productDoc).forEach(key => {
				if (productDoc[key] === null || productDoc[key] === undefined) {
					delete productDoc[key];
				}
			});

			await productRef.set(productDoc);
			const outletDetailsSnapshot = await db.collection("outlets").doc(data.outletId)
				.collection("outletDetails").limit(1).get();
			if (outletDetailsSnapshot.empty) {
				throw new Error("Outlet details not found");
			}
			await outletDetailsSnapshot.docs[0].ref.update({
				menuVersion: FieldValue.increment(1),
			});

			res.status(201).json({ success: true, message: "Product created successfully", data: { productId: productRef.id } });
			return;
		} catch (error) {
			console.error("createProduct error:", error);
			res.status(500).json({ success: false, message: "Internal server error" });
			return;
		}
	}
);
