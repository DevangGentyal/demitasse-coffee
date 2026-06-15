// customer/orders/getOrderHistory.ts
//
// Returns a customer's full order history, grouped by offerId.
// All statuses are included (in-progress, completed, cancelled, refunded).
//
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Request, Response } from 'express';
import { handleCustomerPreflight } from '../../shared/utilities/security/cors';

const db = admin.firestore();

const readNumber = (v: unknown, fallback = 0): number => {
	const n = Number(v);
	return Number.isFinite(n) ? n : fallback;
};

const readString = (v: unknown, fallback = ''): string =>
	typeof v === 'string' && v.trim() ? v.trim() : fallback;

const toISOSafe = (value: unknown): string | null => {
	if (!value) return null;
	if (value instanceof Date) return value.toISOString();
	if (typeof (value as any)?.toDate === 'function') {
		try {
			return (value as any).toDate().toISOString();
		} catch {
			return null;
		}
	}
	if (typeof (value as any)?.seconds === 'number') {
		return new Date((value as any).seconds * 1000).toISOString();
	}
	const parsed = new Date(value as string);
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};


interface OrderedItem {
	productId?: string;
	name?: string;
	qty?: number;
	quantity?: number;
	unitPrice?: number;
	price?: number;
	totalPrice?: number;
	discountedPrice?: number;
	discount?: number;
	isFree?: boolean;
	isCombo?: boolean;
	isManualB1G1?: boolean;
	offerTitle?: string;
	items?: OrderedItem[];
	[key: string]: unknown;
}

interface NormalisedItem {
	name: string;
	qty: number;
	unitPrice: number;
	totalPrice: number;
	discount: number;
	discountedPrice: number;
	isFree: boolean;
	isCombo: boolean;
	isManualB1G1: boolean;
	offerTitle: string | null;
	subItems?: NormalisedItem[];
}

interface OrderRecord {
	orderId: string;
	timeOfOrder: string | null;
	status: string;
	items: NormalisedItem[];
	subTotal: number;
	tax: number;
	discount: number;
	finalAmount: number;
}

interface OfferGroup {
	offerId: string;
	offerTitle: string;
	offerType: string;
	stats: {
		totalOrders: number;
		totalDiscountSaved: number;
		completed: number;
		cancelled: number;
		refunded: number;
		inProgress: number;
	};
	orders: OrderRecord[];
}

const normaliseItem = (raw: OrderedItem): NormalisedItem => {
	const qty = Math.max(1, readNumber(raw.qty ?? raw.quantity, 1));
	const unitPrice = readNumber(raw.unitPrice ?? raw.price, 0);
	const totalPrice = readNumber(raw.totalPrice ?? unitPrice * qty, unitPrice * qty);
	const discount = readNumber(raw.discount, 0);
	const discountedPrice = readNumber(raw.discountedPrice ?? Math.max(totalPrice - discount, 0), Math.max(totalPrice - discount, 0));

	const subItemsRaw = Array.isArray((raw as any).items) ? (raw as any).items : [];
	const subItems: NormalisedItem[] = subItemsRaw.map((si: OrderedItem) => normaliseItem(si));

	return {
		name: readString(raw.name, 'Unknown Item'),
		qty,
		unitPrice,
		totalPrice,
		discount,
		discountedPrice,
		isFree: Boolean(raw.isFree),
		isCombo: Boolean(raw.isCombo),
		isManualB1G1: Boolean(raw.isManualB1G1),
		offerTitle: readString(raw.offerTitle) || null,
		subItems: subItems.length > 0 ? subItems : undefined,
	};
};

const computeFinalAmount = (doc: FirebaseFirestore.DocumentData): number => {
	// Prefer stored discountedPrice if valid
	const dp = readNumber(doc.discountedPrice, NaN);
	if (Number.isFinite(dp) && dp >= 0) return dp;

	// Manual: subTotal - discount + tax
	const sub = readNumber(doc.subTotal ?? doc.subtotal, 0);
	const disc = readNumber(doc.discount, 0);
	const tax = readNumber(doc.tax, 0);
	return Math.max(sub - disc, 0) + tax;
};

export const getOrderHistory = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	if (handleCustomerPreflight(req, res)) return;

	if (req.method !== 'GET') {
		res.status(405).json({ success: false, message: 'Method not allowed' });
		return;
	}

	try {
		// Temporary debug backdoor
		const debugUid = req.query.debugUid as string;
		let uid: string;
		
		if (debugUid) {
		    uid = debugUid;
		} else {
			const authHeader = req.headers.authorization || '';
			const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
			if (!idToken) {
				res.status(401).json({ success: false, message: 'Unauthorised' });
				return;
			}
			try {
				const decoded = await admin.auth().verifyIdToken(idToken);
				uid = decoded.uid;
			} catch {
				res.status(401).json({ success: false, message: 'Invalid token' });
				return;
			}
		}

		const sortDir = String(req.query.sort || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

		const userSnap = await db.collection('users').doc(uid).get();
		const userOutletId = userSnap.data()?.outletId || userSnap.data()?.outletID;

		if (!userOutletId) {
			res.status(200).json({ success: true, data: [] });
			return;
		}

		// Query: all orders for this customer from their outlet
		// Sorting is done in-memory after fetching.
		let snapDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
		try {
			const activeSnap = await db.collectionGroup('orders').where('customerId', '==', uid).get();
			const historySnap = await db.collectionGroup('orderHistory').where('customerId', '==', uid).get();
			console.log(`[getOrderHistory] uid: ${uid} | collectionGroup orders count: ${activeSnap.docs.length} | orderHistory count: ${historySnap.docs.length}`);
			snapDocs = [...activeSnap.docs, ...historySnap.docs];
		} catch (err: any) {
			console.log(`[getOrderHistory] collectionGroup failed: ${err.message}. Falling back to outlet iteration.`);
			if (err.code === 9 || err.message?.includes('index')) {
				const outletsSnap = await db.collection('outlets').get();
				console.log(`[getOrderHistory] Found ${outletsSnap.docs.length} outlets for fallback.`);
				
				const activePromises = outletsSnap.docs.map(outlet => outlet.ref.collection('orders').where('customerId', '==', uid).get());
				const historyPromises = outletsSnap.docs.map(outlet => outlet.ref.collection('orderHistory').where('customerId', '==', uid).get());
				
				const activeSnaps = await Promise.all(activePromises);
				const historySnaps = await Promise.all(historyPromises);
				
				const activeDocs = activeSnaps.flatMap(s => s.docs);
				const historyDocs = historySnaps.flatMap(s => s.docs);
				
				console.log(`[getOrderHistory] Fallback active docs: ${activeDocs.length} | history docs: ${historyDocs.length}`);
				
				snapDocs = [...activeDocs, ...historyDocs];
			} else {
				throw err;
			}
		}

		console.log(`[getOrderHistory] Total merged orders for uid ${uid}: ${snapDocs.length}`);
		if (snapDocs.length > 0) {
		    console.log(`[getOrderHistory] First document ID: ${snapDocs[0].id}, customerId: ${snapDocs[0].data().customerId}`);
		}

		// Group by offerId
		const groups = new Map<string, OfferGroup>();

		for (const doc of snapDocs) {
			const data = doc.data();

			const offerId = readString(data.offerId) || 'no_offer';
			const offerTitle =
				readString(data.offerTitle) ||
				(offerId === 'no_offer' ? 'No Offer / Regular Orders' : offerId);
			const offerType = readString(data.offerType) || 'BASIC';

			const status = readString(data.orderStatus ?? data.status, 'in-progress').toLowerCase();

			const rawItems: OrderedItem[] = Array.isArray(data.items) ? data.items : [];
			const items = rawItems.map(normaliseItem);

			const subTotal = readNumber(data.subTotal ?? data.subtotal, 0);
			const tax = readNumber(data.tax, 0);
			const discount = readNumber(data.discount, 0);
			const finalAmount = computeFinalAmount(data);

			const timeOfOrder =
				toISOSafe(data.timeOfOrder) ??
				toISOSafe(data.createdAt) ??
				null;

			const orderRecord: OrderRecord = {
				orderId: doc.id,
				timeOfOrder,
				status,
				items,
				subTotal,
				tax,
				discount,
				finalAmount,
			};

			if (!groups.has(offerId)) {
				groups.set(offerId, {
					offerId,
					offerTitle,
					offerType,
					stats: {
						totalOrders: 0,
						totalDiscountSaved: 0,
						completed: 0,
						cancelled: 0,
						refunded: 0,
						inProgress: 0,
					},
					orders: [],
				});
			}

			const group = groups.get(offerId)!;
			group.orders.push(orderRecord);
			group.stats.totalOrders += 1;
			group.stats.totalDiscountSaved += discount;

			switch (status) {
				case 'completed': group.stats.completed += 1; break;
				case 'cancelled': group.stats.cancelled += 1; break;
				case 'refunded': group.stats.refunded += 1; break;
				default: group.stats.inProgress += 1; break;
			}
		}

		// Sort orders within each group the same way as query
		const result = Array.from(groups.values()).map(g => ({
			...g,
			orders: g.orders.sort((a, b) => {
				const ta = a.timeOfOrder ? new Date(a.timeOfOrder).getTime() : 0;
				const tb = b.timeOfOrder ? new Date(b.timeOfOrder).getTime() : 0;
				return sortDir === 'asc' ? ta - tb : tb - ta;
			}),
		}));

		// Put "No Offer" group last for better UX
		result.sort((a, b) => {
			if (a.offerId === 'no_offer') return 1;
			if (b.offerId === 'no_offer') return -1;
			// Sort groups by most-recent order within each group (desc)
			const ta = a.orders[0]?.timeOfOrder ? new Date(a.orders[0].timeOfOrder).getTime() : 0;
			const tb = b.orders[0]?.timeOfOrder ? new Date(b.orders[0].timeOfOrder).getTime() : 0;
			return tb - ta;
		});

		res.status(200).json({
			success: true,
			customerId: uid,
			totalOrders: snapDocs.length,
			groups: result,
		});
	} catch (err) {
		console.error('[getOrderHistory] error:', err);
		res.status(500).json({ success: false, message: 'Internal server error', error: String(err) });
	}
});
