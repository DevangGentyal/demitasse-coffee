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

		// ── Normalise items → canonical shape with correct unitPrice/totalPrice
		const normalisedItems = await normalizeOrderItemsForPricing(items, resolveProductPrice);

		// Enrich category / subcategory / name from products collection
		for (const item of normalisedItems) {
			const productDoc = await getProductDoc(item.productId, String(outletId));
			if (!productDoc) continue;
			item.name = productDoc.name || item.name;
			item.category = productDoc.category || null;
			item.subcategory = productDoc.subcategory || null;
		}

		// ── subTotal ─────────────────────────────────────────────────────────
		const subTotal = calculateSubtotal(normalisedItems);

		// ── Offer / discount ─────────────────────────────────────────────────
		const requestedOfferId = readString(autoAppliedOfferId) || readString(offerId) || null;
		const uniqueOfferIds = new Set<string>();
		if (requestedOfferId) uniqueOfferIds.add(requestedOfferId);
		for (const item of normalisedItems) {
			const itemOfferId = readString(item.offerId);
			if (itemOfferId) uniqueOfferIds.add(itemOfferId);
		}
		const offerDocsById = await getOfferDocs(uniqueOfferIds, String(outletId));
		if (uid) {
			const { validateRegistrationEligibility } = await import('../../shared/utilities/firestoreCatalog.js');
			await validateRegistrationEligibility(uid, offerDocsById);
		}

		// ── Tag normal items with the auto-applied registration offer ID ─────────
		if (requestedOfferId && offerDocsById.has(requestedOfferId)) {
			for (const item of normalisedItems) {
				const isSpecial = item.isFree || item.isCombo || item.isManualB1G1 || item.isBirthday;
				const hasOwnOffer = item.offerId && item.offerId !== requestedOfferId;
				if (!isSpecial && !hasOwnOffer) {
					item.offerId = requestedOfferId;
				}
			}
		}

		// ── Apply offer to each item individually ──────────────────────────
		const primaryOfferDoc = requestedOfferId ? (offerDocsById.get(requestedOfferId) || null) : null;
		const itemsWithPricing = applyOfferPricingByGroup(normalisedItems, offerDocsById as any, applyTax, primaryOfferDoc as any);
		const { orderType: appliedOrderType } = applyOffer({ subTotal, items: itemsWithPricing }, primaryOfferDoc);
		const resolvedOrderType = readString(requestedOrderType).toUpperCase() || appliedOrderType;
		// ── Grand total ───────────────────────────────────────────────────
		// grandTotal      = discountedPrice + tax
		const pricing = buildPricingSummaryFromItems(itemsWithPricing);

		// ── Offer usage tracking ─────────────────────────────────────────────
		const consumedOfferUsages = collectRequestedOfferUsages(itemsWithPricing, requestedOfferId);

		// ── Deduplication (prevent accidental double-submit within 10 s) ─────
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
				const recentSnap = await db.collection('outlets').doc(String(outletId)).collection('orders')
					.where('sessionId', '==', activeSessionId)
					.orderBy('timeOfOrder', 'desc')
					.limit(5)
					.get();
				const normNew = normalizeForCompare(itemsWithPricing);
				for (const doc of recentSnap.docs) {
					const od = doc.data() || {};
					const t = od.timeOfOrder as admin.firestore.Timestamp | undefined;
					if (!t || t.toMillis() < tenSecondsAgo.toMillis()) continue;
					if ((readString(od.autoAppliedOfferId) || null) !== requestedOfferId) continue;
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

			if (!alreadyCounted && uid) {
				const userRef = db.collection('users').doc(uid);
				const userSnap = await tx.get(userRef);
				const userData = userSnap.data() || {};
				const userUpdates: Record<string, any> = {};

				if (userData.hasPlacedFirstOrder === false) {
					userUpdates.hasPlacedFirstOrder = true;
				}

				if (consumedOfferUsages.length > 0) {
					const offersById = new Map<string, FirebaseFirestore.DocumentData | undefined>();
					for (const usage of consumedOfferUsages) {
						const offerSnap = await tx.get(db.collection('outlets').doc(String(outletId)).collection('offers').doc(usage.offerId));
						offersById.set(usage.offerId, offerSnap.exists ? offerSnap.data() : undefined);
					}
					const violation = findUsageLimitViolation(
						consumedOfferUsages,
						getAppliedOfferUsageCounts(userData.appliedOffers),
						offersById,
					);
					if (violation) throw new Error('OFFER_USAGE_LIMIT_REACHED');

					userUpdates.appliedOffers = mergeAppliedOfferUsages(userData.appliedOffers, consumedOfferUsages);
				}

				if (Object.keys(userUpdates).length > 0) {
					userUpdates.updatedAt = FieldValue.serverTimestamp();
					tx.set(userRef, userUpdates, { merge: true });
				}
			}

			tx.set(orderRef, {
				id: orderRef.id,
				outletId: String(outletId),
				orderType: resolvedOrderType,
				customerName: resolvedCustomerName,
				customerId: readString(customerId) || uid || null,
				customerPhone: resolvedCustomerPhone,
				placedBy: readString(placedBy) === 'billing' ? 'billing' : 'customer',
				tableId: tableId || null,
				sessionId: activeSessionId || null,

				// ── Items (canonical shape with item-level pricing) ──────────
				items: itemsWithPricing,

				// ── Pricing (calculated from item-level values) ────────────────
				subTotal: pricing.subTotal,
				discount: pricing.discount,
				discountedPrice: pricing.discountedPrice,
				tax: pricing.tax,
				totalAmount: pricing.grandTotal,
				status: req.body?.status || req.body?.orderStatus || 'in-progress',
				autoAppliedOfferId: alreadyCounted
					? (readString(existingData.autoAppliedOfferId) || null)
					: requestedOfferId,
				offerId: requestedOfferId,
				...(alreadyCounted
					? {
						consumedOfferUsages: Array.isArray(existingData.consumedOfferUsages) ? existingData.consumedOfferUsages : [],
						offerUsageCounted: true,
					}
					: consumedOfferUsages.length > 0
					? { consumedOfferUsages, offerUsageCounted: true }
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
