import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

interface DeleteProductRequest { productId: string; }

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

			const productRef = db.collection("products").doc(data.productId);
			const productSnap = await productRef.get();
			if (!productSnap.exists) {
				res.status(404).json({ success: false, message: "Product not found" });
				return;
			}

			await productRef.delete();
			res.status(200).json({ success: true, message: "Product deleted successfully" });
		} catch (error) {
			console.error("deleteProduct error:", error);
			res.status(500).json({ success: false, message: "Internal server error" });
		}
	}
);
