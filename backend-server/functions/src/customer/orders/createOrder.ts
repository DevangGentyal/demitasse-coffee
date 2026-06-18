// createOrder.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { createOrGetSession } from '../../shared/session/sessionUtils';
import { handleCustomerPreflight } from '../../shared/utilities/security/cors';
import { getOfferDocs, getProductDoc } from '../../shared/utilities/firestoreCatalog';
import {
	collectRequestedOfferUsages,
	findUsageLimitViolation,
	getAppliedOfferUsageCounts,
	mergeAppliedOfferUsages,
} from '../../shared/utilities/offers/offerUsage';
import { normalizeOrderItemsForPricing, applyOfferPricingByGroup, buildPricingSummaryFromItems } from '../../shared/utilities/offers/orderPricing';
import { calculateSubtotal } from '../../shared/utilities/billing/pricing';
import { applyTax } from '../../shared/utilities/billing/tax';
import { applyOffer } from '../../shared/utilities/offers/applyOffer';

const db = admin.firestore();

const setCors = (res: Response): void => {
	res.set('Access-Control-Allow-Origin', '*');
	res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE');
	res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const verifyToken = async (req: Request): Promise<admin.auth.DecodedIdToken | null> => {
	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader === 'Bearer null') return null;
	return admin.auth().verifyIdToken(authHeader.slice('Bearer '.length));
};

const readString = (value: unknown): string => String(value ?? '').trim();

const resolveCustomerName = async (uid: string, fallbackName: unknown): Promise<string> => {
	try {
		const userSnap = await db.collection('users').doc(uid).get();
		const userData = userSnap.data() || {};
		return readString(userData.name || userData.displayName || fallbackName) || 'Walk-In-Customer';
	} catch {
		return readString(fallbackName) || 'Walk-In-Customer';
	}
};

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

export const createOrder = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	if (handleCustomerPreflight(req, res)) return;
	setCors(res);

	if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
	if (req.method !== 'PUT' && req.method !== 'POST') {
		res.status(405).json({ success: false, message: 'Method not allowed' });
		return;
	}

	try {
		const decoded = await verifyToken(req);
		const uid = decoded?.uid || null;
		const {
			outletId, tableId, sessionId, items,
			placedBy, customerName, customerPhone, customerId,
			offerId,
			autoAppliedOfferId,
			orderType: requestedOrderType,
		} = req.body || {};

		if (!outletId || !Array.isArray(items) || items.length === 0) {
			res.status(400).json({ success: false, message: 'outletId and items array are required' });
			return;
		}

		console.info('[customerOrdersCreate] request summary', {
			outletId: String(outletId),
			tableId: tableId || null,
			sessionId: sessionId || null,
			requestedOrderType: readString(requestedOrderType) || null,
			offerId: readString(offerId) || null,
			autoAppliedOfferId: readString(autoAppliedOfferId) || null,
			itemCount: items.length,
			items: items.map((item: any) => ({
				id: readString(item?.id || item?.productId || null),
				productId: readString(item?.productId || null),
				offerId: readString(item?.offerId || null),
				offerType: readString(item?.offerType || null),
				isCombo: Boolean(item?.isCombo),
				isManualB1G1: Boolean(item?.isManualB1G1),
				isDiscount: Boolean(item?.isDiscount),
				isBirthday: Boolean(item?.isBirthday),
				hasNestedItems: Array.isArray(item?.items) && item.items.length > 0,
				nestedProductIds: Array.isArray(item?.items) ? item.items.map((nested: any) => readString(nested?.productId || nested?.id || null)) : [],
			})),
		});

		// ── Session ──────────────────────────────────────────────────────────
		let activeSessionId = readString(sessionId);
		if (!activeSessionId && tableId) {
			const sessionResult = await createOrGetSession(String(outletId), String(tableId), {
				uid: uid || 'guest',
				name: 'customer',
			});
			activeSessionId = sessionResult.sessionId;
		}

		const resolvedCustomerName = uid ? await resolveCustomerName(uid, customerName) : (readString(customerName) || 'Walk-In-Customer');
		const resolvedCustomerPhone = readString(customerPhone);

		// ── Price resolver (always from products collection) ─────────────────
		const resolveProductPrice = async (productId: string): Promise<number | null> => {
			const id = readString(productId);
			if (!id) return null;
			const productDoc = await getProductDoc(id, String(outletId));
			if (!productDoc || !Number.isFinite(productDoc.price)) return null;
			return productDoc.price;
		};

		// ── Separate NEW_USER synthetic wrapper items from real items ─────────
		// NEW_USER items are client-side placeholders with no real product.
		// They carry the NEW_USER offerId and must NOT be normalised as products.
		const syntheticNewUserOfferIds: string[] = [];
		const realItems = (items as any[]).filter((incomingItem) => {
			if (isSyntheticNewUserItem(incomingItem)) {
				const oid = readString((incomingItem as Record<string, unknown>).offerId);
				if (oid) syntheticNewUserOfferIds.push(oid);
				return false;
			}
			return true;
		});
		const newUserOfferId: string | null = syntheticNewUserOfferIds[0] || null;

		// ── Normalise real items → canonical shape ────────────────────────────
		const normalisedItems = await normalizeOrderItemsForPricing(realItems, resolveProductPrice);

		// Enrich category / subcategory / name from products collection
		for (const item of normalisedItems) {
			if (!item.productId || item.isCombo) continue;
			const productDoc = await getProductDoc(item.productId, String(outletId));
			if (!productDoc) continue;
			item.name = productDoc.name || item.name;
			item.category = productDoc.category || null;
			item.subcategory = productDoc.subcategory || null;
		}

		// ── subTotal ─────────────────────────────────────────────────────────
		const subTotal = calculateSubtotal(normalisedItems);

		// ── Resolve primary offer ID (COMBO / B1G1 / DISCOUNT / BIRTHDAY) ────
		// This is NOT the NEW_USER offer — that is handled separately.
		// We derive it from autoAppliedOfferId/offerId only if it's not a NEW_USER offer.
		const candidateOfferId = readString(autoAppliedOfferId) || readString(offerId) || null;

		// Collect all offer IDs referenced in the cart
		const uniqueOfferIds = new Set<string>();
		if (candidateOfferId) uniqueOfferIds.add(candidateOfferId);
		if (newUserOfferId) uniqueOfferIds.add(newUserOfferId);
		for (const item of normalisedItems) {
			const itemOfferId = readString(item.offerId);
			if (itemOfferId) uniqueOfferIds.add(itemOfferId);
		}
		const offerDocsById = await getOfferDocs(uniqueOfferIds, String(outletId));

		// Pre-Validation: Validate global usage limit and active state
		for (const offerDoc of offerDocsById.values()) {
			if (!offerDoc) continue;
			const isActive = offerDoc.isActive !== false;
			const usageLimit = Number(offerDoc.usageLimit || 0);
			const usedCount = Number(offerDoc.usedCount || 0);

			if (!isActive || (usageLimit > 0 && usedCount >= usageLimit)) {
				throw new Error('OFFER_USAGE_LIMIT_REACHED');
			}
		}

		// Determine if candidateOfferId is actually a NEW_USER offer
		const candidateOfferDoc = candidateOfferId ? offerDocsById.get(candidateOfferId) : null;
		const candidateIsNewUser =
			candidateOfferDoc &&
			(candidateOfferDoc.offerType ?? candidateOfferDoc.type ?? '').toString().toUpperCase() === 'NEW_USER';

		// Primary offer = the non-NEW_USER offer (COMBO, B1G1, DISCOUNT, BIRTHDAY)
		const primaryOfferId: string | null = candidateIsNewUser ? null : (candidateOfferId || null);
		const primaryOfferDoc = primaryOfferId ? (offerDocsById.get(primaryOfferId) || null) : null;

		// NEW_USER offer = either from synthetic wrapper or from candidateOfferId if it's NEW_USER
		const resolvedNewUserOfferId: string | null =
			newUserOfferId || (candidateIsNewUser ? candidateOfferId : null);
		const newUserOfferDoc = resolvedNewUserOfferId
			? (offerDocsById.get(resolvedNewUserOfferId) || null)
			: null;

		if (uid) {
			const { validateRegistrationEligibility } = await import('../../shared/utilities/firestoreCatalog.js');
			await validateRegistrationEligibility(uid, offerDocsById);
		}

		// ✅ DO NOT tag regular items with primaryOfferId.
		// Each item already carries its own offerId from normalization.
		// Regular items (Italian Pasta, Coffee Mocha) have offerId=null and stay in __basic__ group.
		// NEW_USER discount is applied as a separate second pass in applyOfferPricingByGroup.

		// ── Apply offer pricing ───────────────────────────────────────────────
		// First pass: COMBO / B1G1 / DISCOUNT / BIRTHDAY per offerId group
		// Second pass: NEW_USER globally across all eligible items
		const itemsWithPricing = applyOfferPricingByGroup(
			normalisedItems,
			offerDocsById as any,
			applyTax,
			primaryOfferDoc as any,
			newUserOfferDoc as any,
		);

		const { orderType: appliedOrderType } = applyOffer({ subTotal, items: itemsWithPricing }, primaryOfferDoc);
		const resolvedOrderType = readString(requestedOrderType).toUpperCase() || appliedOrderType;

		// ── Grand total ───────────────────────────────────────────────────────
		const pricing = buildPricingSummaryFromItems(itemsWithPricing);

		// ── Offer usage tracking ──────────────────────────────────────────────
		const effectiveOfferIdForUsage = primaryOfferId || resolvedNewUserOfferId;
		const consumedOfferUsages = collectRequestedOfferUsages(itemsWithPricing, effectiveOfferIdForUsage);

		// ── Deduplication (prevent accidental double-submit within 10 s) ──────
		const normalizeForCompare = (its: any[]) =>
			its.map((it: any) => ({
				productId: String(it.productId || it.id || ''),
				qty: Number(it.qty || it.quantity || 0),
				offerId: readString(it.offerId) || null,
				addOns: (Array.isArray(it.addOns) ? it.addOns : [])
					.map((a: any) => ({ name: String(a.name || ''), price: Number(a.price || 0) }))
					.sort((x: any, y: any) => x.name.localeCompare(y.name)),
			}));

		const itemsEqual = (a: any[], b: any[]) => {
			if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
			for (let i = 0; i < a.length; i++) {
				if (a[i].productId !== b[i].productId) return false;
				if (a[i].qty !== b[i].qty) return false;
				if (a[i].offerId !== b[i].offerId) return false;
				const aAddOns = a[i].addOns || [];
				const bAddOns = b[i].addOns || [];
				if (aAddOns.length !== bAddOns.length) return false;
				for (let j = 0; j < aAddOns.length; j++) {
					if (aAddOns[j].name !== bAddOns[j].name || Number(aAddOns[j].price) !== Number(bAddOns[j].price)) return false;
				}
			}
			return true;
		};

		let orderRef = db.collection('outlets').doc(String(outletId)).collection('orders').doc();
		try {
			if (activeSessionId) {
				const tenSecondsAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 10_000);
				const recentSnap = await db
					.collection('outlets').doc(String(outletId)).collection('orders')
					.where('sessionId', '==', activeSessionId)
					.orderBy('timeOfOrder', 'desc')
					.limit(5)
					.get();
				const normNew = normalizeForCompare(itemsWithPricing);
				for (const doc of recentSnap.docs) {
					const od = doc.data() || {};
					const t = od.timeOfOrder;
					// ✅ FIX: guard against undefined/non-Timestamp timeOfOrder before calling toMillis()
					if (!t || typeof t.toMillis !== 'function') continue;
					if (t.toMillis() < tenSecondsAgo.toMillis()) continue;
					if ((readString(od.autoAppliedOfferId) || null) !== primaryOfferId) continue;
					if (itemsEqual(normNew, normalizeForCompare(Array.isArray(od.items) ? od.items : []))) {
						orderRef = doc.ref;
						break;
					}
				}
			}
		} catch (e) {
			console.warn('Order dedupe check failed', String(e));
		}

		// ── Transaction: offer-usage check + write ────────────────────────────
		await db.runTransaction(async (tx) => {
			const existingSnap = await tx.get(orderRef);
			const existingData = existingSnap.data() || {};
			const alreadyCounted = existingSnap.exists && existingData.offerUsageCounted === true;

			// ─────────────────────────────────────────────────────────────
			// PREPARE ORDER NUMBER (READS ONLY)
			// ─────────────────────────────────────────────────────────────
			let orderNo: string;
			let counterRef: FirebaseFirestore.DocumentReference | null = null;
			let nextCount: number | null = null;

			if (existingSnap.exists && existingData.orderNo) {
				orderNo = existingData.orderNo;
			} else {
				const today = new Date();
				const dateKey =
					`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

				counterRef = db
					.collection('outlets')
					.doc(String(outletId))
					.collection('orderCounters')
					.doc(dateKey);

				const counterSnap = await tx.get(counterRef);

				const currentCount = counterSnap.exists
					? Number(counterSnap.data()?.count || 0)
					: 0;

				nextCount = currentCount + 1;

				orderNo = `ODR${String(nextCount).padStart(3, '0')}`;
			}

			// ─────────────────────────────────────────────────────────────
			// GLOBAL OFFER USAGE AND DEACTIVATION (READS FIRST)
			// ─────────────────────────────────────────────────────────────
			const offersMap = new Map<string, { ref: FirebaseFirestore.DocumentReference, snap: FirebaseFirestore.DocumentSnapshot }>();
			if (consumedOfferUsages.length > 0) {
				for (const usage of consumedOfferUsages) {
					let offerRef = db.collection('outlets')
						.doc(String(outletId))
						.collection('offers')
						.doc(usage.offerId);
					let offerSnap = await tx.get(offerRef);
					if (!offerSnap.exists) {
						offerRef = db.collection('offers').doc(usage.offerId);
						offerSnap = await tx.get(offerRef);
					}
					offersMap.set(usage.offerId, { ref: offerRef, snap: offerSnap });

					if (offerSnap.exists) {
						const offerData = offerSnap.data() || {};
						const usageLimit = Number(offerData.usageLimit || 0);
						const usedCount = Number(offerData.usedCount || 0);
						const isActive = offerData.isActive !== false;

						if (!isActive || (usageLimit > 0 && usedCount >= usageLimit)) {
							throw new Error('OFFER_USAGE_LIMIT_REACHED');
						}
					}
				}
			}

			// ─────────────────────────────────────────────────────────────
			// USER / OFFER VALIDATION (READS ONLY)
			// ─────────────────────────────────────────────────────────────
			let userRef: FirebaseFirestore.DocumentReference | null = null;
			let userUpdates: Record<string, any> = {};

			if (!alreadyCounted && uid) {
				userRef = db.collection('users').doc(uid);

				const userSnap = await tx.get(userRef);
				const userData = userSnap.data() || {};

				if (userData.hasPlacedFirstOrder === false) {
					userUpdates.hasPlacedFirstOrder = true;
				}

				if (consumedOfferUsages.length > 0) {
					const offersById = new Map<string, FirebaseFirestore.DocumentData | undefined>();
					for (const usage of consumedOfferUsages) {
						const entry = offersMap.get(usage.offerId);
						const offerSnap = entry?.snap;
						offersById.set(
							usage.offerId,
							offerSnap && offerSnap.exists ? offerSnap.data() : undefined
						);
					}

					const violation = findUsageLimitViolation(
						consumedOfferUsages,
						getAppliedOfferUsageCounts(userData.appliedOffers),
						offersById,
					);

					if (violation) {
						throw new Error('OFFER_USAGE_LIMIT_REACHED');
					}

					userUpdates.appliedOffers = mergeAppliedOfferUsages(
						userData.appliedOffers,
						consumedOfferUsages
					);
				}
			}

			// ─────────────────────────────────────────────────────────────
			// WRITES START HERE
			// ─────────────────────────────────────────────────────────────

			// 1. Global offer usage increment and deactivation
			if (!alreadyCounted && consumedOfferUsages.length > 0) {
				for (const usage of consumedOfferUsages) {
					const entry = offersMap.get(usage.offerId);
					if (entry && entry.snap.exists) {
						const offerData = entry.snap.data() || {};
						const usageLimit = Number(offerData.usageLimit || 0);
						const usedCount = Number(offerData.usedCount || 0);

						const nextUsedCount = usedCount + 1;
						const offerUpdate: Record<string, any> = {
							usedCount: nextUsedCount,
						};
						if (usageLimit > 0 && nextUsedCount >= usageLimit) {
							offerUpdate.isActive = false;
						}
						tx.update(entry.ref, offerUpdate);
					}
				}
			}

			if (counterRef && nextCount !== null) {
				tx.set(
					counterRef,
					{
						count: nextCount,
						updatedAt: FieldValue.serverTimestamp(),
					},
					{ merge: true }
				);
			}

			if (userRef && Object.keys(userUpdates).length > 0) {
				userUpdates.updatedAt = FieldValue.serverTimestamp();

				tx.set(
					userRef,
					userUpdates,
					{ merge: true }
				);
			}

			tx.set(orderRef, {
				id: orderRef.id,
				orderNo,
				outletId: String(outletId),
				orderType: resolvedOrderType,
				customerName: resolvedCustomerName,
				customerId: readString(customerId) || uid || null,
				customerPhone: resolvedCustomerPhone,
				placedBy: readString(placedBy) === 'billing' ? 'billing' : 'customer',
				tableId: tableId || null,
				sessionId: activeSessionId || null,

				items: itemsWithPricing,

				subTotal: pricing.subTotal,
				discount: pricing.discount,
				discountedPrice: pricing.discountedPrice,
				tax: pricing.tax,
				totalAmount: pricing.grandTotal,
				status: req.body?.status || req.body?.orderStatus || 'in-progress',

				autoAppliedOfferId: alreadyCounted
					? (readString(existingData.autoAppliedOfferId) || null)
					: primaryOfferId,

				offerId: primaryOfferId,

				newUserOfferId: resolvedNewUserOfferId || null,

				...(alreadyCounted
					? {
						consumedOfferUsages: Array.isArray(existingData.consumedOfferUsages)
							? existingData.consumedOfferUsages
							: [],
						offerUsageCounted: true,
					}
					: consumedOfferUsages.length > 0
						? {
							consumedOfferUsages,
							offerUsageCounted: true,
						}
						: {}),

				timeOfOrder: FieldValue.serverTimestamp(),
				createdAt: FieldValue.serverTimestamp(),
				updatedAt: FieldValue.serverTimestamp(),
			});
		});

		res.status(201).json({ success: true, id: orderRef.id, message: 'Order created successfully' });
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Internal server error';
		if (message === 'OFFER_USAGE_LIMIT_REACHED') {
			res.status(409).json({ success: false, message: 'Offer usage limit reached. Please remove the offer and try again.' });
			return;
		}
		const status = message === 'Missing token' ? 401 : 500;
		res.status(status).json({ success: false, message, error: String(error) });
	}
});