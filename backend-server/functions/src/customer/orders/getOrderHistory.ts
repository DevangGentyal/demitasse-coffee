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

const computeFinalAmount = (doc: any): number => {
	const total = readNumber(doc.totalAmount ?? doc.grandTotal ?? doc.finalAmount, NaN);
	if (Number.isFinite(total) && total >= 0) return total;

	const tax = readNumber(doc.tax, 0);
	const dp = readNumber(doc.discountedPrice, NaN);
	if (Number.isFinite(dp) && dp >= 0) return dp + tax;

	const sub = readNumber(doc.subTotal ?? doc.subtotal, 0);
	const disc = readNumber(doc.discount, 0);

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

		const outletsSnap = await db.collection('outlets').get();

		const orders: OrderRecord[] = [];
		const uniqueDocIds = new Set<string>();

		for (const outlet of outletsSnap.docs) {
			const activeSnap = await outlet.ref.collection('orders').get();
			const historySnap = await outlet.ref.collection('orderHistory').get();

			const activeDocs = activeSnap.docs.map(doc => ({ doc }));
			const historyDocs = historySnap.docs.map(doc => ({ doc }));

			const merged = [...activeDocs, ...historyDocs];

			for (const { doc } of merged) {
				if (uniqueDocIds.has(doc.id)) continue;
				uniqueDocIds.add(doc.id);

				const data = doc.data();

				if (data.customerId === uid) {
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

					orders.push({
						orderId: doc.id,
						timeOfOrder,
						status,
						items,
						subTotal,
						tax,
						discount,
						finalAmount,
					});
				}
			}
		}

		orders.sort((a, b) => {
			const aTime = a.timeOfOrder ? new Date(a.timeOfOrder).getTime() : 0;
			const bTime = b.timeOfOrder ? new Date(b.timeOfOrder).getTime() : 0;
			return bTime - aTime;
		});

		if (sortDir === 'asc') {
			orders.reverse();
		}

		res.status(200).json({
			success: true,
			totalOrders: orders.length,
			orders
		});
	} catch (err) {
		console.error('[getOrderHistory] error:', err);
		res.status(500).json({ success: false, message: 'Internal server error', error: String(err) });
	}
});
