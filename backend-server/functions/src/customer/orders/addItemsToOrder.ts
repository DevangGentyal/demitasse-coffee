// addItemsToOrder.ts
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { calculateSubtotal } from "../../shared/utilities/billing/pricing";
import { applyTax } from "../../shared/utilities/billing/tax";
import { getOfferDocs, getProductDoc } from "../../shared/utilities/firestoreCatalog";
import { handleCustomerPreflight } from "../../shared/utilities/security/cors";
import { FieldValue } from "firebase-admin/firestore";
import {
	normalizeOrderItemsForPricing,
	applyOfferPricingByGroup,
	buildPricingSummaryFromItems,
	NormalisedOrderItem,
} from "../../shared/utilities/offers/orderPricing";
import { applyOffer } from "../../shared/utilities/offers/applyOffer";
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

const isSyntheticNewUserItem = (item: unknown): boolean => {
	const v = (item || {}) as Record<string, unknown>;
	const offerType = String(v.offerType || '').trim().toUpperCase();
	const productId = String(v.productId || v.id || '').trim();
	return (
		offerType === 'NEW_USER' &&
		(!productId || productId.startsWith('new_user_') || productId.startsWith('discount_')) &&
		(!Array.isArray(v.items) || (v.items as unknown[]).length === 0)
	);
};

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
			const orderQuery = db.collectionGroup("orders").where("sessionId", "==", sessionId).limit(1);
			const orderQuerySnap = await tx.get(orderQuery);
			if (orderQuerySnap.empty) throw new Error("ORDER_NOT_FOUND");

			const orderDoc = orderQuerySnap.docs[0];
			const orderRef = orderDoc.ref;
			const orderData = orderDoc.data();
			if (orderData.status !== "ACTIVE") throw new Error("ORDER_NOT_ACTIVE");

			const outletId = orderData.outletId;
			if (!outletId) throw new Error("OUTLET_ID_NOT_FOUND_ON_ORDER");

			// ── Resolve offer IDs ─────────────────────────────────────────────
			// The primary offer on the order (COMBO, B1G1, DISCOUNT, etc.)
			const primaryOfferId: string | null =
				readString(offerId) || readString(orderData.autoAppliedOfferId) || null;

			// ── Price resolver (always from products collection) ──────────────
			const resolveProductPrice = async (productId: string): Promise<number | null> => {
				const id = readString(productId);
				if (!id) return null;
				const productDoc = await getProductDoc(id, outletId);
				return productDoc && Number.isFinite(productDoc.price) ? productDoc.price : null;
			};

			// ── Filter out synthetic NEW_USER wrapper items ───────────────────
			// These are client-side offer placeholders with no real product.
			// Capture their offerId separately — they represent the NEW_USER offer.
			const syntheticNewUserOfferIds: string[] = [];
			const realItems = items.filter((incomingItem) => {
				if (isSyntheticNewUserItem(incomingItem)) {
					const oid = readString((incomingItem as unknown as Record<string, unknown>).offerId);
					if (oid) syntheticNewUserOfferIds.push(oid);
					return false;
				}
				return true;
			});

			// NEW_USER offer ID (separate from primaryOfferId — applied as a second pass)
			const newUserOfferId: string | null = syntheticNewUserOfferIds[0] || null;

			// ── Normalise & validate new items ────────────────────────────────
			const newNormalized: NormalisedOrderItem[] = [];
			for (const incomingItem of realItems) {
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
					const productDoc = await getProductDoc(normalised.productId, outletId);
					if (productDoc) {
						normalised.name = productDoc.name || normalised.name;
						normalised.category = productDoc.category || null;
						normalised.subcategory = productDoc.subcategory || null;
					}
					normalised.status = 'in-progress';
					normalised.createdBy = actorId;
					normalised.addedAt = new Date();

					// ✅ FIX: Only assign offerId from the incoming item itself.
					// Do NOT fall back to primaryOfferId/resolvedEffectiveOfferId here —
					// that would wrongly tag unrelated regular items with the combo/primary offer.
					// Regular items that have no offerId stay as offerId=null.
					// NEW_USER offer is applied as a second pass in applyOfferPricingByGroup.
					const itemExplicitOfferId =
						readString(normalised.offerId) ||
						readString(incomingItem.offerId) ||
						null;
					normalised.offerId = itemExplicitOfferId;

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

			// ── Collect all offer IDs referenced in the cart ──────────────────
			const offerIds = new Set<string>();
			if (primaryOfferId) offerIds.add(primaryOfferId);
			if (newUserOfferId) offerIds.add(newUserOfferId);
			for (const item of mergedItems) {
				const itemOfferId = readString(item.offerId);
				if (itemOfferId) offerIds.add(itemOfferId);
			}
			const offerDocsById = await getOfferDocs(offerIds, outletId);

			// ── subTotal ──────────────────────────────────────────────────────
			const subTotal = calculateSubtotal(mergedItems);
			const primaryOfferDoc = primaryOfferId ? offerDocsById.get(primaryOfferId) : null;
			const newUserOfferDoc = newUserOfferId ? offerDocsById.get(newUserOfferId) : null;

			// Validate NEW_USER min order value if applicable
			if (newUserOfferDoc) {
				if (mergedItems.length === 0) throw new Error("EMPTY_CART");
				const minOrder = Number(newUserOfferDoc.minOrderValue || 0);
				if (subTotal < minOrder) throw new Error(`MIN_ORDER_VALUE_NOT_REACHED:${minOrder}`);
			}

			// ── Apply offer pricing ───────────────────────────────────────────
			// Pass primaryOfferDoc as the primary (COMBO/B1G1/DISCOUNT/BIRTHDAY).
			// newUserOfferDoc is passed separately so applyOfferPricingByGroup can
			// run it as a second pass across all items after other offers are applied.
			const itemsWithPricing = applyOfferPricingByGroup(
				mergedItems,
				offerDocsById as any,
				applyTax,
				primaryOfferDoc || null,
				newUserOfferDoc || null,
			);

			// ── Get order type ────────────────────────────────────────────────
			const { orderType } = applyOffer(
				{ subTotal, items: itemsWithPricing },
				primaryOfferDoc || null,
			);

			// ── Grand total ───────────────────────────────────────────────────
			const pricing = buildPricingSummaryFromItems(itemsWithPricing);

			// ── Offer usage tracking ──────────────────────────────────────────
			const effectiveOfferIdForUsage = primaryOfferId || newUserOfferId;
			const existingUsageCounts = getAppliedOfferUsageCounts(orderData.consumedOfferUsages);
			const requestedOfferUsages = collectRequestedOfferUsages(itemsWithPricing, effectiveOfferIdForUsage);
			const deltaOfferUsages = requestedOfferUsages.filter((usage) => {
				const existingCount = existingUsageCounts.get(usage.offerId) || 0;
				return usage.count > existingCount;
			});
			const consumedOfferUsages = mergeAppliedOfferUsages(orderData.consumedOfferUsages, deltaOfferUsages);

			if (deltaOfferUsages.length > 0) {
				const userRef = db.collection("users").doc(actorId);
				const userSnap = await tx.get(userRef);
				const userData = userSnap.data() || {};
				const offersById = new Map<string, FirebaseFirestore.DocumentData | undefined>();
				for (const usage of deltaOfferUsages) {
					const offerSnap = await tx.get(db.collection("outlets").doc(outletId).collection("offers").doc(usage.offerId));
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
				items: itemsWithPricing,
				autoAppliedOfferId: primaryOfferId,
				offerId: primaryOfferId,
				// Store NEW_USER offer ID separately so it's preserved across re-calculations
				newUserOfferId: newUserOfferId || orderData.newUserOfferId || null,
				subTotal: pricing.subTotal,
				discount: pricing.discount,
				discountedPrice: pricing.discountedPrice,
				tax: pricing.tax,
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
		if (error?.message?.startsWith("MIN_ORDER_VALUE_NOT_REACHED:")) {
			res.status(400).json({ success: false, message: error.message }); return;
		}
		res.status(500).json({ success: false, message: "Internal server error", error: String(error) });
	}
});