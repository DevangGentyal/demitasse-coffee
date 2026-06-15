import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

interface DeleteProductRequest { productId: string; outletId?: string; }

export const deleteProduct = functions.https.onRequest(
	async (req, res): Promise<void> => {
		res.set("Access-Control-Allow-Origin", "*");
		res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE");
		res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

		if (req.method === "OPTIONS") {
			res.status(200).send("");
			return;
		}

		try {
			if (req.method !== "DELETE") {
				res.status(405).json({ success: false, message: "Method not allowed" });
				return;
			}

			const db = admin.firestore();
			const data: DeleteProductRequest = req.body;
			if (!data || !data.productId) {
				res.status(400).json({ success: false, message: "productId is required" });
				return;
			}

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

			await productRef.delete();
			const resolvedOutletId = productRef.parent.parent?.id;
			if (!resolvedOutletId) {
				throw new Error("Unable to resolve outletId from product path");
			}
			const outletDetailsSnapshot = await db.collection("outlets").doc(resolvedOutletId)
				.collection("outletDetails").limit(1).get();
			if (outletDetailsSnapshot.empty) {
				throw new Error("Outlet details not found");
			}
			await outletDetailsSnapshot.docs[0].ref.update({
				menuVersion: FieldValue.increment(1),
			});
			res.status(200).json({ success: true, message: "Product deleted successfully" });
		} catch (error) {
			console.error("deleteProduct error:", error);
			res.status(500).json({ success: false, message: "Internal server error" });
		}
	}
);
