import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { calculateSubtotal } from "../../shared/utilities/billing/pricing";
import { applyTax } from "../../shared/utilities/billing/tax";
import { applyOffer } from "../../shared/utilities/offers/applyOffer";
import { handleCustomerPreflight } from "../../shared/utilities/security/cors";

const db = admin.firestore();
const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const readNumber = (value: unknown, fallback = 0): number => { const numeric = Number(value); return Number.isFinite(numeric) ? numeric : fallback; };
const sanitizeOrderItems = (rawItems: unknown[]): any[] => Array.isArray(rawItems) ? rawItems.map((item) => { const data = (item || {}) as Record<string, unknown>; const qty = Math.max(1, Math.floor(readNumber(data.qty ?? data.quantity, 1))); const unitPrice = readNumber(data.unitPrice ?? data.finalUnitPrice ?? data.price, 0); const explicitTotal = readNumber(data.totalPrice, NaN); const normalizedItem: any = { productId: String(data.productId || data.id || ""), name: String(data.name || ""), qty, quantity: qty, unitPrice, finalUnitPrice: unitPrice, price: unitPrice, totalPrice: Number.isFinite(explicitTotal) ? explicitTotal : unitPrice * qty, addOns: Array.isArray(data.addOns) ? data.addOns : (Array.isArray(data.addons) ? data.addons : []) }; if (Array.isArray(data.items)) normalizedItem.items = data.items.map((sub: any) => ({ ...sub, addOns: Array.isArray(sub.addOns) ? sub.addOns : (Array.isArray(sub.addons) ? sub.addons : []) })); if (readString(data.createdBy)) normalizedItem.createdBy = readString(data.createdBy); return normalizedItem; }) : [];

export const generateBill = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	if (handleCustomerPreflight(req, res)) return;
	if (req.method !== "POST") { res.status(405).json({ success: false, message: "Method not allowed" }); return; }

	try {
		const { sessionId, tableId } = req.body as { sessionId?: string; tableId?: string };
		console.info('[customerBillingGenerateBill] request', {
			method: req.method,
			sessionId: sessionId || null,
			tableId: tableId || null,
		});
		if (!sessionId && !tableId) { res.status(400).json({ success: false, message: "sessionId or tableId is required" }); return; }

		const result = await db.runTransaction(async (tx) => {
			let candidates: FirebaseFirestore.QueryDocumentSnapshot[] = [];
			if (sessionId && tableId) {
				const [sessionSnap, tableSnap] = await Promise.all([tx.get(db.collection("orders").where("sessionId", "==", sessionId)), tx.get(db.collection("orders").where("tableId", "==", tableId.toString()))]);
				const map = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
				sessionSnap.docs.forEach(d => map.set(d.id, d)); tableSnap.docs.forEach(d => map.set(d.id, d)); candidates = Array.from(map.values());
			} else if (sessionId) { candidates = (await tx.get(db.collection("orders").where("sessionId", "==", sessionId))).docs; }
			else if (tableId) { candidates = (await tx.get(db.collection("orders").where("tableId", "==", tableId.toString()))).docs; }
			console.info('[customerBillingGenerateBill] candidate count before filter', {
				sessionId: sessionId || null,
				tableId: tableId || null,
				count: candidates.length,
				ids: candidates.map(doc => doc.id),
			});

			candidates = candidates.filter(doc => { const data = doc.data(); const status = String(data.status || "").toUpperCase(); const oStatus = String(data.orderStatus || "").toLowerCase(); return status !== "ARCHIVED" && oStatus !== "archived"; });
			console.info('[customerBillingGenerateBill] candidate count after filter', {
				sessionId: sessionId || null,
				tableId: tableId || null,
				count: candidates.length,
				ids: candidates.map(doc => doc.id),
			});
			if (candidates.length === 0) throw new Error("ORDER_NOT_FOUND");

			const allItems: any[] = []; let outletId = ""; let primaryOrderDoc = candidates[0];
			for (const doc of candidates) { const data = doc.data(); if (!outletId) outletId = String(data.outletId || ""); allItems.push(...sanitizeOrderItems(Array.isArray(data.items) ? data.items : [])); const curTime = readNumber((data.updatedAt as { toMillis?: () => number })?.toMillis?.(), 0) || readNumber((data.createdAt as { toMillis?: () => number })?.toMillis?.(), 0); const priTime = readNumber((primaryOrderDoc.data().updatedAt as { toMillis?: () => number })?.toMillis?.(), 0) || readNumber((primaryOrderDoc.data().createdAt as { toMillis?: () => number })?.toMillis?.(), 0); if (curTime > priTime) primaryOrderDoc = doc; }
			if (allItems.length === 0) throw new Error("EMPTY_CART");

			const subtotal = calculateSubtotal(allItems);
			const savedOfferId = primaryOrderDoc.data().offerId ? String(primaryOrderDoc.data().offerId) : null;
			let discount = 0; let appliedOffers: Array<{ offerId: string; title: string; type: string; amount: number }> = [];
			if (savedOfferId) { const offerSnap = await tx.get(db.collection("offers").doc(savedOfferId)); if (offerSnap.exists) { const offerResult = applyOffer({ outletId, items: allItems, subtotal }, { id: offerSnap.id, ...(offerSnap.data() || {}) }); discount = offerResult.discount; appliedOffers = offerResult.appliedOffers; } }

			const taxableAmount = Math.max(subtotal - discount, 0);
			const tax = applyTax(taxableAmount);
			const total = taxableAmount + tax;
			return { orderId: primaryOrderDoc.id, sessionId: primaryOrderDoc.data().sessionId || null, tableId: primaryOrderDoc.data().tableId || null, items: allItems, pricing: { subtotal, discount, tax, total }, appliedOffers, noteToCustomer: "Your calculated bill is ready." };
		});

		res.status(200).json({ success: true, ...result });
	} catch (error) {
		if (error instanceof Error) {
			if (error.message === "ORDER_NOT_FOUND") { res.status(404).json({ success: false, message: "Order not found" }); return; }
			if (error.message === "EMPTY_CART") { res.status(400).json({ success: false, message: "Cannot finalize empty order" }); return; }
		}
		console.error("generateBill error:", error);
		res.status(500).json({ success: false, message: "Internal server error", error: String(error) });
	}
});