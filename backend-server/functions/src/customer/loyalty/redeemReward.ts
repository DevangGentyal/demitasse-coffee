import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";

export const redeemReward = functions.https.onRequest(
	async (req: Request, res: Response): Promise<void> => {
		const db = admin.firestore();
		res.set("Access-Control-Allow-Origin", "*");
		res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
		res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

		if (req.method === "OPTIONS") {
			res.status(200).send("");
			return;
		}

		try {
			if (req.method !== "POST") {
				res.status(405).json({ success: false, message: "Method not allowed" });
				return;
			}

			const { customerId, productId, rewardId } = req.body;

			if (!customerId) {
				res.status(400).json({ success: false, message: "customerId is required" });
				return;
			}

			if (rewardId) {
				const rewardRef = db.collection("rewards").doc(rewardId);
				const rewardDoc = await rewardRef.get();

				if (!rewardDoc.exists) {
					res.status(404).json({ success: false, message: "Reward not found" });
					return;
				}

				const rewardData = rewardDoc.data();
				if (rewardData?.customerId !== customerId || rewardData?.isUsed) {
					res.status(400).json({ success: false, message: "Reward is invalid or already used" });
					return;
				}

				await rewardRef.update({ isUsed: true });

				await db.collection("loyaltyTransactions").add({
					customerId,
					type: "redeem",
					points: 0,
					rewardId,
					createdAt: FieldValue.serverTimestamp(),
				});

				res.status(200).json({
					success: true,
					message: "Reward redeemed successfully",
					discountAmount: "FREE",
					pointsUsed: 0,
				});
				return;
			}

			if (!productId) {
				res.status(400).json({ success: false, message: "productId or rewardId is required" });
				return;
			}

			const productRef = db.collection("products").doc(productId);
			const productDoc = await productRef.get();

			if (!productDoc.exists) {
				res.status(404).json({ success: false, message: "Product not found" });
				return;
			}

			const product = productDoc.data();
			const price = product?.price || 0;
			const pointsRequired = Math.floor(price * 1.5);

			if (pointsRequired <= 0) {
				res.status(400).json({ success: false, message: "This product is not redeemable" });
				return;
			}

			const customerRef = db.collection("customers").doc(customerId);
			const customerDoc = await customerRef.get();

			if (!customerDoc.exists) {
				res.status(404).json({ success: false, message: "Customer not found" });
				return;
			}

			const currentPoints = customerDoc.data()?.pointsBalance || 0;

			if (currentPoints < pointsRequired) {
				res.status(400).json({ success: false, message: "Insufficient points" });
				return;
			}

			await customerRef.update({
				pointsBalance: FieldValue.increment(-pointsRequired),
			});

			await db.collection("loyaltyTransactions").add({
				customerId,
				type: "redeem",
				points: pointsRequired,
				productId,
				createdAt: FieldValue.serverTimestamp(),
			});

			res.status(200).json({
				success: true,
				message: "Redemption successful",
				discountAmount: price,
				pointsUsed: pointsRequired,
			});
			return;
		} catch (error) {
			console.error("Error redeeming reward:", error);
			res.status(500).json({ success: false, message: "Internal server error", error: String(error) });
			return;
		}
	}
);
