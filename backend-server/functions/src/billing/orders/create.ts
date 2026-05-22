import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { earnPoints } from "../../customer/loyalty/earnPoints";
import { createOrGetSession } from "../../shared/session/sessionUtils";

const db = admin.firestore();

const resolvePlacedBy = (value: unknown): "billing" | "customer" => {
	return value === "customer" ? "customer" : "billing";
};

export const createOrder = functions.https.onRequest(
	async (req: Request, res: Response): Promise<void> => {
		res.set("Access-Control-Allow-Origin", "*");
		res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
		res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

		if (req.method === "OPTIONS") {
			res.status(200).send("");
			return;
		}

		try {
			if (req.method !== "PUT") {
				res.status(405).json({ success: false, message: "Method not allowed" });
				return;
			}

			const { outletId, customerName, customerId, customerPhone, placedBy, tableId, items, totalAmount } = req.body;
			if (!outletId || !items || !Array.isArray(items)) {
				res.status(400).json({ success: false, message: "outletId and items array are required" });
				return;
			}
			if (items.length === 0) {
				res.status(400).json({ success: false, message: "Order must contain at least one item" });
				return;
			}

			let activeSessionId = null;
			if (tableId) {
				try {
					const sessionResult = await createOrGetSession(outletId, String(tableId), { uid: customerId || null, name: customerName || null });
					activeSessionId = sessionResult.sessionId;
				} catch (err) {
					console.error("Failed to create/get session for order:", err);
				}
			}

			const orderRef = db.collection("orders").doc();
			const sanitizeItem = (it: any) => {
				const sanitized: any = {
					id: it.id || Math.random().toString(36).substr(2, 9),
					category: it.category || "unknown",
					name: it.name || "",
					quantity: it.quantity || it.qty || 1,
					status: it.status || "in-progress",
					price: it.price || 0,
					addOns: Array.isArray(it.addons) ? it.addons : (Array.isArray(it.addOns) ? it.addOns : []),
					notes: it.notes || "",
					offerId: it.offerId || null,
				};
				if (Array.isArray(it.items)) sanitized.items = it.items.map((sub: any) => sanitizeItem(sub));
				return sanitized;
			};

			const orderData = {
				outletId,
				customerName: (customerName || "Walk-in Customer").trim(),
				customerId: customerId ? String(customerId).trim() : null,
				customerPhone: customerPhone ? String(customerPhone).trim() : "",
				placedBy: resolvePlacedBy(placedBy),
				tableId: tableId || null,
				sessionId: activeSessionId,
				items: items.map((item: any) => sanitizeItem(item)),
				orderStatus: req.body.orderStatus || "in-progress",
				totalAmount: totalAmount || 0,
				timeOfOrder: FieldValue.serverTimestamp(),
				createdAt: FieldValue.serverTimestamp(),
				updatedAt: FieldValue.serverTimestamp(),
			};

			await orderRef.set(orderData);
			if (customerId) {
				earnPoints(customerId, customerName, totalAmount, items, orderRef.id);
			}

			res.status(201).json({ success: true, id: orderRef.id, message: "Order created successfully" });
		} catch (error) {
			console.error("Error creating order:", error);
			res.status(500).json({ success: false, message: "Internal server error", error: String(error) });
		}
	}
);
