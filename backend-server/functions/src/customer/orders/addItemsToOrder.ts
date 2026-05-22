import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { calculateSubtotal } from "../../shared/utilities/billing/pricing";
import { applyOffer } from "../../shared/utilities/offers/applyOffer";
import { applyTax } from "../../shared/utilities/billing/tax";
import { handleCustomerPreflight } from "../../shared/utilities/security/cors";

interface InputItem { productId: string; qty: number; variations?: unknown[]; customizations?: unknown[]; offerId?: string; }

const readNumberish = (value: unknown): number => { const numeric = Number(value); return Number.isFinite(numeric) ? numeric : 0; };
const sanitizeQty = (qty: unknown): number => { const value = Number(qty); return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0; };

export const addItemsToOrder = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	const db = admin.firestore();
	if (handleCustomerPreflight(req, res)) return;
	if (req.method !== "POST") { res.status(405).json({ success: false, message: "Method not allowed" }); return; }

	try {
		const { sessionId, items, offerId, userId, guestId } = req.body as { sessionId?: string; items?: InputItem[]; offerId?: string; userId?: string; guestId?: string; };
		const actorId = (userId || guestId || "").trim();
		if (!sessionId || !Array.isArray(items) || items.length === 0 || !actorId) { res.status(400).json({ success: false, message: "sessionId, items and userId or guestId are required" }); return; }

		const transactionResult = await db.runTransaction(async (tx) => {
			const orderQuery = db.collection("orders").where("sessionId", "==", sessionId).limit(1);
			const orderQuerySnap = await tx.get(orderQuery);
			if (orderQuerySnap.empty) throw new Error("ORDER_NOT_FOUND");

			const orderDoc = orderQuerySnap.docs[0];
			const orderRef = orderDoc.ref;
			const orderData = orderDoc.data();
			if (orderData.status !== "ACTIVE") throw new Error("ORDER_NOT_ACTIVE");

			const nextOfferId = offerId ?? (orderData.offerId ? String(orderData.offerId) : null);
			const newItems: any[] = [];
			for (const incomingItem of items) {
				const qty = sanitizeQty(incomingItem.qty);
				if (!incomingItem?.productId || qty <= 0) throw new Error("INVALID_ITEM_PAYLOAD");
				const productSnap = await tx.get(db.collection("products").doc(incomingItem.productId));
				if (!productSnap.exists) throw new Error(`PRODUCT_NOT_FOUND:${incomingItem.productId}`);
				const productData = productSnap.data() || {};
				const basePrice = readNumberish(productData.price);
				const rawVariations = Array.isArray(incomingItem.variations) ? incomingItem.variations : [];
				const isCombo = Boolean((incomingItem as any).isCombo || String((incomingItem as any).offerType || '').toUpperCase() === 'COMBO');

				// Resolve addOns: prefer explicit addOns/addons field, otherwise empty array
				const addOns = Array.isArray((incomingItem as any).addOns)
					? (incomingItem as any).addOns
					: Array.isArray((incomingItem as any).addons)
						? (incomingItem as any).addons
						: [];

				// Resolve a single variation string from incoming structures (preferred: explicit `variation` field)
				const variation = (incomingItem as any).variation
					|| (rawVariations.length > 0 ? (String((rawVariations[0] as any).name || (rawVariations[0] as any).option || (rawVariations[0] as any).type || (rawVariations[0] as any).value || '') ) : '')
                
				const addonsTotal = addOns.reduce((sum: number, addon: any) => sum + readNumberish(addon.price), 0);
				const comboUnitPrice = readNumberish((incomingItem as any).comboPrice ?? (incomingItem as any).unitPrice ?? (incomingItem as any).price ?? basePrice);
				// unitPrice should reflect the stored combo price for combo parents; otherwise use the product base price.
				const unitPrice = isCombo ? comboUnitPrice : basePrice;
				// Combo parents already carry their line total in `price`; normal items are calculated from unit + add-ons.
				const totalPrice = isCombo
					? readNumberish((incomingItem as any).price ?? (incomingItem as any).totalPrice ?? (comboUnitPrice + addonsTotal)) * qty
					: (unitPrice + addonsTotal) * qty;
				console.log(`[addItemsToOrder] item=${incomingItem.productId} basePrice=${basePrice} addonsTotal=${addonsTotal} unitPrice=${unitPrice} qty=${qty} totalPrice=${totalPrice}`);

				newItems.push({
					productId: incomingItem.productId,
					name: String(productData.name || "Unknown Product"),
					category: productData.category || null,
					subcategory: productData.subcategory || null,
					qty,
					status: 'in-progress',
					unitPrice,
					addOns,
					variation: variation || null,
					totalPrice,
					...(isCombo ? { isCombo: true, offerType: 'COMBO', comboPrice: comboUnitPrice, price: readNumberish((incomingItem as any).price ?? totalPrice) } : {}),
					createdBy: actorId,
					addedAt: new Date(),
					offerId: incomingItem.offerId || nextOfferId || null,
				});
			}

			const existingItems = Array.isArray(orderData.items) ? orderData.items : [];
			const mergedItems = existingItems.concat(newItems);

			// Sanitize items: remove `customizations` and `variations` if present, keep only allowed fields
			const sanitizeItem = (it: any) => {
				const allowed: any = {
					productId: it.productId || it.id || null,
					id: it.id || null,
					name: it.name || '',
					category: it.category || null,
					subcategory: it.subcategory || null,
					qty: it.qty || it.quantity || 0,
					status: it.status || 'in-progress',
					unitPrice: it.unitPrice || 0,
					addOns: Array.isArray(it.addOns) ? it.addOns : (Array.isArray(it.addons) ? it.addons : []),
					variation: it.variation || null,
					totalPrice: it.totalPrice || null,
					createdBy: it.createdBy || null,
					addedAt: it.addedAt || null,
					offerId: it.offerId || null,
				};
				if (Array.isArray(it.items)) {
					allowed.items = it.items.map((sub: any) => sanitizeItem(sub));
				}
				return allowed;
			};

			const sanitizedMergedItems = mergedItems.map(sanitizeItem);
			const subtotal = calculateSubtotal(sanitizedMergedItems);
			let appliedOffers: any[] = [];
			let discount = 0;
			if (nextOfferId) {
				const offerSnap = await tx.get(db.collection("offers").doc(nextOfferId));
				if (offerSnap.exists) {
					const offerResult = applyOffer({ outletId: orderData.outletId, items: mergedItems, subtotal }, { id: offerSnap.id, ...(offerSnap.data() || {}) });
					discount = offerResult.discount;
					appliedOffers = offerResult.appliedOffers;
				}
			}

			const taxableAmount = Math.max(subtotal - discount, 0);
			const tax = applyTax(taxableAmount);
			const grandTotal = taxableAmount + tax;
			const updatedPricing = { subtotal, discount, tax, total: grandTotal };
			const updatePayload = { items: sanitizedMergedItems, appliedOffers, itemTotal: subtotal, discount, tax, grandTotal, pricing: updatedPricing, totalAmount: taxableAmount, updatedAt: new Date() };
			tx.update(orderRef, updatePayload);
			return { id: orderDoc.id, ...orderData, ...updatePayload, updatedAt: new Date().toISOString() };
		});

		res.status(200).json({ success: true, message: "Item added successfully", order: transactionResult });
	} catch (error: any) {
		if (error?.message === "ORDER_NOT_FOUND") { res.status(404).json({ success: false, message: "Order not found" }); return; }
		if (error?.message === "ORDER_NOT_ACTIVE") { res.status(409).json({ success: false, message: "Order is not active" }); return; }
		res.status(500).json({ success: false, message: "Internal server error", error: String(error) });
	}
});
