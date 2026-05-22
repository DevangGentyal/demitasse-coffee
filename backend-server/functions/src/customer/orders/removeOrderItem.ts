import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { applyOffer } from "../../shared/utilities/offers/applyOffer";
import { applyTax } from "../../shared/utilities/billing/tax";
import { handleCustomerPreflight } from "../../shared/utilities/security/cors";

const isActiveOrder = (orderData: FirebaseFirestore.DocumentData): boolean => !["CANCELLED", "CLOSED", "DELETED"].includes(String(orderData.status || orderData.orderStatus || orderData.orderLifecycleStatus || "").trim().toUpperCase());
const getItemKey = (item: any): string => String(item?.id || item?.productId || "").trim();
const getItemTotal = (item: any): number => { const explicitTotal = Number(item?.totalPrice); if (Number.isFinite(explicitTotal) && explicitTotal > 0) return explicitTotal; const qty = Math.max(1, Number(item?.qty ?? item?.quantity ?? 1)); const price = Number(item?.finalUnitPrice ?? item?.price ?? item?.priceRaw ?? 0); return Number.isFinite(price) ? qty * price : 0; };
const getOrderItems = (orderData: FirebaseFirestore.DocumentData): any[] => Array.isArray(orderData.items) ? orderData.items : [];

export const removeOrderItem = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	const db = admin.firestore();
	if (handleCustomerPreflight(req, res)) return;
	if (req.method !== "POST") { res.status(405).json({ success: false, message: "Method not allowed" }); return; }

	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith("Bearer ")) { res.status(401).json({ success: false, message: "Unauthorized: Missing token" }); return; }
	try { await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]); } catch { res.status(401).json({ success: false, message: "Unauthorized: Invalid token" }); return; }

	try {
		const { outletId, orderId, itemId } = req.body as { outletId?: string; orderId?: string; itemId?: string };
		if (!outletId || !orderId || !itemId) { res.status(400).json({ success: false, message: "Missing required fields: outletId, orderId, and itemId" }); return; }

		const transactionResult = await db.runTransaction(async (tx) => {
			const orderRef = db.collection("orders").doc(orderId);
			const orderSnap = await tx.get(orderRef);
			if (!orderSnap.exists) throw new Error("ORDER_NOT_FOUND");
			const orderData = orderSnap.data() || {};
			if (orderData.outletId !== outletId) throw new Error("OUTLET_MISMATCH");
			if (!isActiveOrder(orderData)) throw new Error("ORDER_NOT_ACTIVE");

			const items = Array.isArray(orderData.items) ? orderData.items : [];
			const itemIndex = items.findIndex((i: any) => getItemKey(i) === itemId);
			if (itemIndex === -1) throw new Error("ITEM_NOT_FOUND");

			if (items.length <= 1) {
				const relatedOrderDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
				const sessionId = String(orderData.sessionId || "").trim();
				const tableId = String(orderData.tableId || "").trim();
				if (sessionId) { const sessionOrdersSnap = await tx.get(db.collection("orders").where("sessionId", "==", sessionId).where("outletId", "==", outletId).limit(50)); sessionOrdersSnap.docs.forEach((doc) => relatedOrderDocs.set(doc.id, doc)); }
				if (tableId) { const tableOrdersSnap = await tx.get(db.collection("orders").where("tableId", "==", tableId).where("outletId", "==", outletId).limit(50)); tableOrdersSnap.docs.forEach((doc) => relatedOrderDocs.set(doc.id, doc)); }
				if (relatedOrderDocs.size === 0) relatedOrderDocs.set(orderSnap.id, orderSnap as FirebaseFirestore.QueryDocumentSnapshot);
				const activeTableItemCount = Array.from(relatedOrderDocs.values()).reduce((count, doc) => count + (isActiveOrder(doc.data()) ? getOrderItems(doc.data()).length : 0), 0);
				if (activeTableItemCount <= 1) throw new Error("CANNOT_REMOVE_LAST_ITEM");
				tx.delete(orderRef);
				return { id: orderId, deleted: true, items: [], updatedAt: new Date().toISOString() };
			}

			const remainingItems = items.filter((i: any) => getItemKey(i) !== itemId);
			const subtotal = remainingItems.reduce((sum: number, item: any) => sum + getItemTotal(item), 0);
			const nextOfferId = orderData.offerId ? String(orderData.offerId) : null;
			let appliedOffers: any[] = []; let discount = 0;
			if (nextOfferId) {
				const offerSnap = await tx.get(db.collection("offers").doc(nextOfferId));
				if (offerSnap.exists) {
					const offerResult = applyOffer({ outletId, items: remainingItems, subtotal }, { id: offerSnap.id, ...(offerSnap.data() || {}) });
					discount = offerResult.discount; appliedOffers = offerResult.appliedOffers;
				}
			}

			const taxableAmount = Math.max(subtotal - discount, 0);
			const tax = applyTax(taxableAmount);
			const grandTotal = taxableAmount + tax;
			const updatePayload = { items: remainingItems, appliedOffers, itemTotal: subtotal, discount, tax, grandTotal, pricing: { subtotal, discount, tax, total: grandTotal }, totalAmount: taxableAmount, updatedAt: FieldValue.serverTimestamp() };
			tx.update(orderRef, updatePayload);
			return { id: orderId, ...orderData, ...updatePayload, updatedAt: new Date().toISOString() };
		});

		res.status(200).json({ success: true, message: "Item removed successfully", order: transactionResult });
	} catch (error: any) {
		if (error instanceof Error) {
			if (error.message === "ORDER_NOT_FOUND") { res.status(404).json({ success: false, message: "Order not found" }); return; }
			if (error.message === "OUTLET_MISMATCH") { res.status(400).json({ success: false, message: "Order does not belong to this outlet" }); return; }
			if (error.message === "ORDER_NOT_ACTIVE") { res.status(409).json({ success: false, message: "Order is not active" }); return; }
			if (error.message === "ITEM_NOT_FOUND") { res.status(404).json({ success: false, message: "Item not found in order" }); return; }
			if (error.message === "CANNOT_REMOVE_LAST_ITEM") { res.status(400).json({ success: false, message: "Cannot remove the final item. Please cancel the entire order instead." }); return; }
		}
		res.status(500).json({ success: false, message: "Internal server error", error: String(error) });
	}
});
