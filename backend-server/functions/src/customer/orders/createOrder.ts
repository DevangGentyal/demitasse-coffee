import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { createOrGetSession } from '../../shared/session/sessionUtils';
import { handleCustomerPreflight } from '../../shared/utilities/security/cors';
import {
	collectRequestedOfferUsages,
	findUsageLimitViolation,
	getAppliedOfferUsageCounts,
	mergeAppliedOfferUsages,
} from '../../shared/utilities/offers/offerUsage';

const db = admin.firestore();

const setCors = (res: Response): void => {
	res.set('Access-Control-Allow-Origin', '*');
	res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE');
	res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const verifyToken = async (req: Request): Promise<admin.auth.DecodedIdToken> => {
	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		throw new Error('Missing token');
	}
	return admin.auth().verifyIdToken(authHeader.slice('Bearer '.length));
};

const readString = (value: unknown): string => String(value ?? '').trim();
const readNumber = (value: unknown, fallback = 0): number => {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : fallback;
};

const sanitizeOrderItem = (item: any, basePrice: number = 0) => {
	const qty = Math.max(1, Math.floor(readNumber(item.qty ?? item.quantity, 1)));
	const addOns = Array.isArray(item.addOns) ? item.addOns : (Array.isArray(item.addons) ? item.addons : []);
	const addonsTotal = addOns.reduce((sum: number, addon: any) => sum + readNumber(addon.price, 0), 0);
	const isCombo = Boolean(item.isCombo || String(item.offerType || '').toUpperCase() === 'COMBO');
	const comboUnitPrice = readNumber(item.comboPrice ?? item.unitPrice ?? item.price ?? basePrice, basePrice);
	// unitPrice should reflect the stored combo price for combo parents; otherwise use the product base price.
	const unitPrice = isCombo ? comboUnitPrice : basePrice;
	// Combo parents already carry their line total in `price`; normal items are calculated from unit + add-ons.
	const totalPrice = isCombo
		? readNumber(item.price ?? item.totalPrice ?? (comboUnitPrice + addonsTotal), 0) * qty
		: (unitPrice + addonsTotal) * qty;
	const sanitized: any = {
		id: readString(item.id || item.productId) || Math.random().toString(36).substr(2, 9),
		productId: readString(item.productId || item.id) || null,
		name: readString(item.name || item.title || item.productName),
		qty,
		status: readString(item.status) || 'in-progress',
		unitPrice: unitPrice,
		totalPrice: totalPrice,
		addOns,
		variation: readString(item.variation) || null,
		notes: readString(item.notes),
		offerId: readString(item.offerId) || null,
	};
	if (isCombo) {
		sanitized.isCombo = true;
		sanitized.offerType = 'COMBO';
		sanitized.comboPrice = comboUnitPrice;
		sanitized.price = readNumber(item.price ?? totalPrice, totalPrice);
	}
	if (Array.isArray(item.items)) {
		sanitized.items = item.items.map((sub: any) => sanitizeOrderItem(sub, 0));
	}
	return sanitized;
};

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

	if (req.method === 'OPTIONS') {
		res.status(204).send('');
		return;
	}

	if (req.method !== 'PUT' && req.method !== 'POST') {
		res.status(405).json({ success: false, message: 'Method not allowed' });
		return;
	}

	try {
		const decoded = await verifyToken(req);
		const { outletId, tableId, sessionId, items, totalAmount, placedBy, customerName, customerPhone, customerId, autoAppliedOfferId } = req.body || {};
		if (!outletId || !Array.isArray(items) || items.length === 0) {
			res.status(400).json({ success: false, message: 'outletId and items array are required' });
			return;
		}

		let activeSessionId = readString(sessionId);
		if (!activeSessionId && tableId) {
			const sessionResult = await createOrGetSession(String(outletId), String(tableId), {
				uid: decoded.uid,
				name: 'customer',
			});
			activeSessionId = sessionResult.sessionId;
		}

		const resolvedCustomerName = await resolveCustomerName(decoded.uid, customerName);
		const resolvedCustomerPhone = readString(customerPhone);
		const sanitizedItems = await Promise.all(items.map(async (item: any) => {
			let productPrice = 0;
			let category = null;
			let subcategory = null;
			
			if (item.productId) {
				try {
					const prodSnap = await db.collection('products').doc(String(item.productId)).get();
					if (prodSnap.exists) {
						const p = prodSnap.data() || {};
						productPrice = readNumber(p.price, 0);
						category = readString(p.category) || null;
						subcategory = readString(p.subcategory) || null;
					}
				} catch (e) {
					// ignore fetch errors and continue with 0 price
				}
			}
			
			const s = sanitizeOrderItem(item, productPrice);
			if (category) s.category = category;
			if (subcategory) s.subcategory = subcategory;
			return s;
		}));
		const computedTotal = sanitizedItems.reduce((sum: number, item: any) => sum + readNumber(item.totalPrice, 0), 0);
		const orderTotal = Number.isFinite(computedTotal) ? computedTotal : readNumber(totalAmount, 0);
		const requestedAutoAppliedOfferId = readString(autoAppliedOfferId) || null;
		const consumedOfferUsages = collectRequestedOfferUsages(sanitizedItems, requestedAutoAppliedOfferId);

		// Deduplicate recent identical orders for same session to avoid accidental double-submits
		const normalizeItems = (its: any[]) => its.map((it: any) => ({
			productId: String(it.productId || it.id || ''),
			qty: Number(it.qty || it.quantity || 0),
			offerId: readString(it.offerId) || null,
			addOns: Array.isArray(it.addOns) ? it.addOns.map((a: any) => ({ name: String(a.name || ''), price: Number(a.price || 0) })).sort((x: any, y: any) => x.name.localeCompare(y.name)) : [],
		}));

		const itemsEqual = (a: any[], b: any[]) => {
			if (!Array.isArray(a) || !Array.isArray(b)) return false;
			if (a.length !== b.length) return false;
			for (let i = 0; i < a.length; i++) {
				const ai = a[i];
				const bi = b[i];
				if (ai.productId !== bi.productId) return false;
				if (ai.qty !== bi.qty) return false;
				if (ai.offerId !== bi.offerId) return false;
				if ((ai.addOns || []).length !== (bi.addOns || []).length) return false;
				for (let j = 0; j < (ai.addOns || []).length; j++) {
					const aaj = ai.addOns[j];
					const baj = bi.addOns[j];
					if (aaj.name !== baj.name || Number(aaj.price) !== Number(baj.price)) return false;
				}
			}
			return true;
		};

		let orderRef = db.collection('orders').doc();
		try {
			if (activeSessionId) {
				const tenSecondsAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 10000);
				const recentQuery = await db.collection('orders')
					.where('sessionId', '==', String(activeSessionId))
					.orderBy('timeOfOrder', 'desc')
					.limit(5)
					.get();
				const normalizedNew = normalizeItems(sanitizedItems);
				for (const doc of recentQuery.docs) {
					const od = doc.data() || {};
					const timeOfOrder = od.timeOfOrder as admin.firestore.Timestamp | undefined;
					if (!timeOfOrder || timeOfOrder.toMillis() < tenSecondsAgo.toMillis()) continue;
					const existingItems = normalizeItems(Array.isArray(od.items) ? od.items : []);
					if ((readString(od.autoAppliedOfferId) || null) !== requestedAutoAppliedOfferId) continue;
					if (itemsEqual(normalizedNew, existingItems)) {
						orderRef = doc.ref; // reuse existing
						break;
					}
				}
			}
		} catch (e) {
			// ignore dedupe errors and proceed to create new order
			console.warn('Order dedupe check failed', String(e));
		}
		await db.runTransaction(async (tx) => {
			const existingOrderSnap = await tx.get(orderRef);
			const existingOrderData = existingOrderSnap.data() || {};
			const alreadyCounted = existingOrderSnap.exists && existingOrderData.offerUsageCounted === true;

			if (consumedOfferUsages.length > 0 && !alreadyCounted) {
				const userRef = db.collection('users').doc(decoded.uid);
				const userSnap = await tx.get(userRef);
				const userData = userSnap.data() || {};
				const offersById = new Map<string, FirebaseFirestore.DocumentData | undefined>();
				for (const usage of consumedOfferUsages) {
					const offerSnap = await tx.get(db.collection('offers').doc(usage.offerId));
					offersById.set(usage.offerId, offerSnap.exists ? offerSnap.data() : undefined);
				}
				const violation = findUsageLimitViolation(
					consumedOfferUsages,
					getAppliedOfferUsageCounts(userData.appliedOffers),
					offersById
				);
				if (violation) throw new Error('OFFER_USAGE_LIMIT_REACHED');

				tx.set(userRef, {
					appliedOffers: mergeAppliedOfferUsages(userData.appliedOffers, consumedOfferUsages),
					updatedAt: FieldValue.serverTimestamp(),
				}, { merge: true });
			}

			tx.set(orderRef, {
				id: orderRef.id,
				outletId: String(outletId),
				customerName: resolvedCustomerName,
				customerId: readString(customerId) || decoded.uid,
				customerPhone: resolvedCustomerPhone,
				placedBy: readString(placedBy) === 'billing' ? 'billing' : 'customer',
				tableId: tableId || null,
				sessionId: activeSessionId || null,
				items: sanitizedItems,
				orderStatus: req.body?.orderStatus || 'in-progress',
				itemTotal: computedTotal,
				totalAmount: orderTotal,
				autoAppliedOfferId: alreadyCounted
					? (readString(existingOrderData.autoAppliedOfferId) || null)
					: requestedAutoAppliedOfferId,
				...(alreadyCounted ? {
					consumedOfferUsages: Array.isArray(existingOrderData.consumedOfferUsages) ? existingOrderData.consumedOfferUsages : [],
					offerUsageCounted: true,
				} : consumedOfferUsages.length > 0 ? {
					consumedOfferUsages,
					offerUsageCounted: true,
				} : {}),
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
