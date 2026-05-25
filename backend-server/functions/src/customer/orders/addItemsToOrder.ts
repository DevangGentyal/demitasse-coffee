// addItemsToOrder.ts
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { calculateSubtotal } from "../../shared/utilities/billing/pricing";
import { applyTax } from "../../shared/utilities/billing/tax";
import { handleCustomerPreflight } from "../../shared/utilities/security/cors";
import { FieldValue } from "firebase-admin/firestore";
import {
	normalizeOrderItemsForPricing,
	buildPricingSummary,
	NormalisedOrderItem,
} from "../../shared/utilities/offers/orderPricing";
import { applyOffer, OfferDocument } from "../../shared/utilities/offers/applyOffer";
import {
	collectRequestedOfferUsages,
	findUsageLimitViolation,
	getAppliedOfferUsageCounts,
	mergeAppliedOfferUsages,
} from "../../shared/utilities/offers/offerUsage";

interface InputItem {
	productId: string;
	qty: number;
	addOns?: Array<{ name?: string; price?: number }>;
	offerId?: string;
	items?: InputItem[];
	name?: string;
}

const readNumber = (value: unknown): number => {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
};

const readString = (v: unknown): string => String(v ?? '').trim();

const summarizeIncomingItem = (item: InputItem | unknown) => {
	const value = (item || {}) as Record<string, unknown>;
	const nestedItems = Array.isArray(value.items) ? value.items : [];
	return {
		id: readString(value.productId || value.id || null),
		productId: readString(value.productId || null),
		offerId: readString(value.offerId || null),
		qty: readNumber(value.qty ?? value.quantity ?? 0),
		isWrapper: nestedItems.length > 0,
		hasOfferFlags: Boolean(value.offerId || value.offerType || value.isCombo || value.isManualB1G1 || value.isDiscount || value.isBirthday),
		nestedProductIds: nestedItems.map((nested) => readString((nested as Record<string, unknown>).productId || (nested as Record<string, unknown>).id || null)),
	};
};

export const addItemsToOrder = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	const db = admin.firestore();
	if (handleCustomerPreflight(req, res)) return;
	if (req.method !== "POST") { res.status(405).json({ success: false, message: "Method not allowed" }); return; }

	try {
		const { sessionId, items, offerId, userId, guestId } = req.body as {
			sessionId?: string;
			items?: InputItem[];
			offerId?: string;
			userId?: string;
			guestId?: string;
		};

		const actorId = (userId || guestId || "").trim();
		if (!sessionId || !Array.isArray(items) || items.length === 0 || !actorId) {
			res.status(400).json({ success: false, message: "sessionId, items and userId or guestId are required" });
			return;
		}

		console.info('[addItemsToOrder] incoming request', {
			sessionId,
			actorId,
			offerId: readString(offerId) || null,
			itemCount: items.length,
			items: items.map(summarizeIncomingItem),
		});

		const transactionResult = await db.runTransaction(async (tx) => {
			// ── Fetch the order ───────────────────────────────────────────────
			const orderQuery = db.collection("orders").where("sessionId", "==", sessionId).limit(1);
			const orderQuerySnap = await tx.get(orderQuery);
			if (orderQuerySnap.empty) throw new Error("ORDER_NOT_FOUND");

			const orderDoc = orderQuerySnap.docs[0];
			const orderRef = orderDoc.ref;
			const orderData = orderDoc.data();
			if (orderData.status !== "ACTIVE") throw new Error("ORDER_NOT_ACTIVE");

			// The effective offerId: incoming request overrides, then fall back to what's already on the order
			const effectiveOfferId: string | null =
				readString(offerId) || readString(orderData.autoAppliedOfferId) || null;

			let offerDoc: OfferDocument | null = null;
			if (effectiveOfferId) {
				const offerSnap = await tx.get(db.collection("offers").doc(effectiveOfferId));
				if (offerSnap.exists) {
					offerDoc = { id: offerSnap.id, ...(offerSnap.data() || {}) } as OfferDocument;
				}
			}

			// ── Price resolver (always from products collection) ──────────────
			const productCache = new Map<string, number>();
			const resolveProductPrice = async (productId: string): Promise<number | null> => {
				const id = readString(productId);
				if (!id) return null;
				if (productCache.has(id)) return productCache.get(id)!;
				const snap = await tx.get(db.collection("products").doc(id));
				if (!snap.exists) return null;
				const price = readNumber((snap.data() || {}).price);
				if (Number.isFinite(price)) { productCache.set(id, price); return price; }
				return null;
			};

			// ── Normalise & validate new items ────────────────────────────────
			const newNormalized: NormalisedOrderItem[] = [];
			for (const incomingItem of items) {
				console.info('[addItemsToOrder] normalizing incoming item', summarizeIncomingItem(incomingItem));
				const normalisedItems = await normalizeOrderItemsForPricing([incomingItem], resolveProductPrice);
				for (const normalised of normalisedItems) {
					console.info('[addItemsToOrder] resolved normalized item', {
						productId: normalised.productId,
						name: normalised.name,
						offerId: normalised.offerId,
						offerType: normalised.offerType || null,
						offerTitle: normalised.offerTitle || null,
						isOfferItem: Boolean(normalised.isOfferItem),
						qty: normalised.qty,
						unitPrice: normalised.unitPrice,
						totalPrice: normalised.totalPrice,
					});
					const productSnap = await tx.get(db.collection("products").doc(normalised.productId));
					if (productSnap.exists) {
						const pd = productSnap.data() || {};
						normalised.name = readString(pd.name) || normalised.name;
						normalised.category = readString(pd.category) || null;
						normalised.subcategory = readString(pd.subcategory) || null;
					}
					normalised.status = 'in-progress';
					normalised.createdBy = actorId;
					normalised.addedAt = new Date();
					normalised.offerId = readString(normalised.offerId) || readString(incomingItem.offerId) || effectiveOfferId;
					newNormalized.push(normalised);
				}
			}

			console.info('[addItemsToOrder] normalized product ids', newNormalized.map((item) => ({
				productId: item.productId,
				name: item.name,
				offerId: item.offerId,
				isFree: false,
			})));

			// ── Merge with existing items ─────────────────────────────────────
			const existingItems: NormalisedOrderItem[] = Array.isArray(orderData.items) ? orderData.items : [];
			const mergedItems = [...existingItems, ...newNormalized];

			// ── subTotal ──────────────────────────────────────────────────────
			const subTotal = calculateSubtotal(mergedItems);

			// ── Offer / discount ──────────────────────────────────────────────
			const { orderType, discount } = applyOffer({ subTotal, items: mergedItems }, offerDoc);

			// ── Grand total ───────────────────────────────────────────────────
			// discountedPrice = max(subTotal - discount, 0)
			// tax             = floor(discountedPrice * 5%)
			// grandTotal      = discountedPrice + tax
			const pricing = buildPricingSummary(subTotal, discount, applyTax);

			const existingUsageCounts = getAppliedOfferUsageCounts(orderData.consumedOfferUsages);
			const requestedOfferUsages = collectRequestedOfferUsages(newNormalized, effectiveOfferId);
			const deltaOfferUsages = requestedOfferUsages.filter((usage) => {
				const existingCount = existingUsageCounts.get(usage.offerId) || 0;
				return usage.count > existingCount;
			});
			const consumedOfferUsages = mergeAppliedOfferUsages(orderData.consumedOfferUsages, deltaOfferUsages);

			// ── Offer usage tracking (user-level) ─────────────────────────────
			if (deltaOfferUsages.length > 0) {
				const userRef = db.collection("users").doc(actorId);
				const userSnap = await tx.get(userRef);
				const userData = userSnap.data() || {};
				const offersById = new Map<string, FirebaseFirestore.DocumentData | undefined>();
				for (const usage of deltaOfferUsages) {
					const offerSnap = await tx.get(db.collection("offers").doc(usage.offerId));
					offersById.set(usage.offerId, offerSnap.exists ? offerSnap.data() : undefined);
				}
				const violation = findUsageLimitViolation(
					deltaOfferUsages,
					getAppliedOfferUsageCounts(userData.appliedOffers),
					offersById,
				);
				if (violation) throw new Error("OFFER_USAGE_LIMIT_REACHED");

				tx.set(userRef, {
					appliedOffers: mergeAppliedOfferUsages(userData.appliedOffers, deltaOfferUsages),
					updatedAt: FieldValue.serverTimestamp(),
				}, { merge: true });
			}

			const updatePayload = {
				orderType,
				items: mergedItems,
				autoAppliedOfferId: effectiveOfferId,
				offerId: effectiveOfferId,
				subTotal: pricing.subTotal,
				discount: pricing.discount,
				discountedPrice: pricing.discountedPrice,
				tax: pricing.tax,
				// grandTotal is intentionally not stored on order documents.
				...(consumedOfferUsages.length > 0
					? {
						consumedOfferUsages: Array.isArray(orderData.consumedOfferUsages)
							? mergeAppliedOfferUsages(orderData.consumedOfferUsages, consumedOfferUsages)
							: consumedOfferUsages,
						offerUsageCounted: true,
					}
					: {}),
				updatedAt: new Date(),
			};

			tx.update(orderRef, updatePayload);

			return {
				id: orderDoc.id,
				...orderData,
				...updatePayload,
				updatedAt: new Date().toISOString(),
			};
		});

		res.status(200).json({ success: true, message: "Item added successfully", order: transactionResult });
	} catch (error: any) {
		if (error?.message === "ORDER_NOT_FOUND") { res.status(404).json({ success: false, message: "Order not found" }); return; }
		if (error?.message === "ORDER_NOT_ACTIVE") { res.status(409).json({ success: false, message: "Order is not active" }); return; }
		if (error?.message === "INVALID_ITEM_PAYLOAD") { res.status(400).json({ success: false, message: "Invalid item payload" }); return; }
		if (error?.message?.startsWith("PRODUCT_NOT_FOUND:")) {
			res.status(404).json({ success: false, message: error.message }); return;
		}
		res.status(500).json({ success: false, message: "Internal server error", error: String(error) });
	}
});