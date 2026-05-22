import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import * as bcrypt from "bcryptjs";
import { handleCustomerPreflight } from "../../shared/utilities/security/cors";

const isActiveOrder = (orderData: FirebaseFirestore.DocumentData): boolean => !["CANCELLED", "COMPLETED", "CLOSED", "DELETED"].includes(String(orderData.status || orderData.orderStatus || orderData.orderLifecycleStatus || "").trim().toUpperCase());
const sanitizeOrderSnapshot = (orderData: FirebaseFirestore.DocumentData): FirebaseFirestore.DocumentData => ({ ...orderData, items: Array.isArray(orderData.items) ? orderData.items.map((item: any) => { const { customizations, variations, ...rest } = item || {}; return rest; }) : [], status: "CANCELLED", orderStatus: "CANCELLED", orderLifecycleStatus: "CANCELLED" });
const getOrderTotal = (orderData: FirebaseFirestore.DocumentData): number => { const directTotal = Number(orderData.grandTotal ?? orderData.totalAmount ?? orderData.itemTotal ?? orderData.pricing?.total); if (Number.isFinite(directTotal)) return directTotal; const items = Array.isArray(orderData.items) ? orderData.items : []; return items.reduce((sum: number, item: any) => { const qty = Number(item?.qty ?? item?.quantity ?? 1); const price = Number(item?.price ?? item?.finalUnitPrice ?? item?.priceRaw ?? 0); return sum + (Number.isFinite(qty) && Number.isFinite(price) ? qty * price : 0); }, 0); };

export const cancelEntireOrder = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	const db = admin.firestore();
	if (handleCustomerPreflight(req, res)) return;
	if (req.method !== "POST") { res.status(405).json({ success: false, message: "Method not allowed" }); return; }

	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith("Bearer ")) { res.status(401).json({ success: false, message: "Unauthorized: Missing token" }); return; }
	try { await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]); } catch { res.status(401).json({ success: false, message: "Unauthorized: Invalid token" }); return; }

	try {
		const { orderId, password, reason } = req.body as { orderId?: string; password?: string; reason?: string };
		if (!orderId || !password || !reason) { res.status(400).json({ success: false, message: "Missing required fields: orderId, password, and reason" }); return; }

		const passwordSnap = await db.collection("secureOrderCancellationAccess").doc("main").get();
		if (!passwordSnap.exists) { res.status(500).json({ success: false, message: "Cancellation password is not configured. Set it in the admin panel first." }); return; }
		const { passkeyHash } = passwordSnap.data() || {}; if (!passkeyHash) { res.status(500).json({ success: false, message: "Invalid configuration: Cancellation password hash is missing." }); return; }
		if (!bcrypt.compareSync(password, passkeyHash)) { res.status(401).json({ success: false, message: "Incorrect cancellation password" }); return; }

		const orderRef = db.collection("orders").doc(orderId);
		const orderSnap = await orderRef.get();
		if (!orderSnap.exists) { res.status(404).json({ success: false, message: "Order not found" }); return; }

		const orderData = orderSnap.data() || {};
		if (!isActiveOrder(orderData)) { res.status(400).json({ success: false, message: "Order is not active" }); return; }

		const sessionId = orderData.sessionId || "";
		const tableId = orderData.tableId || "";
		const outletId = orderData.outletId || "";
		const customerUserId = orderData.userId || orderData.ownerId || orderData.customerId || null;
		const ordersToCancelSnap = sessionId ? await db.collection("orders").where("sessionId", "==", sessionId).where("outletId", "==", outletId).get() : null;
		const ordersToCancel = ordersToCancelSnap && !ordersToCancelSnap.empty ? ordersToCancelSnap.docs.filter((doc) => isActiveOrder(doc.data())) : [orderSnap];
		const orderSnapshots = ordersToCancel.map((doc) => ({ orderId: doc.id, ...sanitizeOrderSnapshot(doc.data() || {}) }));
		const totalOrdersCost = ordersToCancel.reduce((sum, doc) => sum + getOrderTotal(doc.data() || {}), 0);

		const batch = db.batch();
		ordersToCancel.forEach((doc) => batch.delete(doc.ref));
		await batch.commit();

		await db.collection("OrderCancel").doc(sessionId || tableId || orderId).set({ userId: customerUserId, closeReason: reason, outletId, tableId: tableId || null, sessionId: sessionId || null, orderSnapshots, totalOrdersCost, cancelledAt: FieldValue.serverTimestamp() }, { merge: true });

		res.status(200).json({ success: true, message: "Order cancelled successfully" });
	} catch (error) {
		console.error("cancelEntireOrder error:", error);
		res.status(500).json({ success: false, message: "Internal server error" });
	}
});
