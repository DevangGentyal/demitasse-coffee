import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();
const normalizeOrderStatus = (value: unknown): "pending" | "in-progress" | "ready" | "completed" => {
	const raw = String(value || "").trim().toLowerCase();
	if (raw === "in-progress" || raw === "in progress" || raw === "working" || raw === "preparing") return "in-progress";
	if (raw === "ready") return "ready";
	if (raw === "completed" || raw === "complete" || raw === "delivered" || raw === "finalized") return "completed";
	return "pending";
};

export const updateOrder = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	res.set("Access-Control-Allow-Origin", "*");
	res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
	res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
	if (req.method === "OPTIONS") { res.status(200).send(""); return; }

	try {
		if (req.method !== "PUT") { res.status(405).json({ success: false, message: "Method not allowed" }); return; }
		const { outletId, orderId, orderStatus, status } = req.body;
		if (!outletId || !orderId) { res.status(400).json({ success: false, message: "outletId and orderId are required" }); return; }
		const nextStatusSource = orderStatus ?? status;
		if (typeof nextStatusSource === "undefined" || nextStatusSource === null || String(nextStatusSource).trim() === "") {
			res.status(400).json({ success: false, message: "status or orderStatus is required" });
			return;
		}

		const orderRef = db.collection("orders").doc(orderId);
		const orderSnap = await orderRef.get();
		if (!orderSnap.exists) { res.status(404).json({ success: false, message: "Order not found" }); return; }
		const orderData = orderSnap.data();
		if (orderData?.outletId !== outletId) { res.status(403).json({ success: false, message: "Order does not belong to this outlet" }); return; }

		const normalizedOrderStatus = normalizeOrderStatus(nextStatusSource);
		const updateData: any = {
			status: normalizedOrderStatus,
			orderStatus: normalizedOrderStatus,
			updatedAt: FieldValue.serverTimestamp(),
		};

		await orderRef.update(updateData);
		res.status(200).json({ success: true, id: orderId, message: "Order updated successfully" });
	} catch (error) {
		console.error("Error updating order:", error);
		res.status(500).json({ success: false, message: "Internal server error", error: String(error) });
	}
});
