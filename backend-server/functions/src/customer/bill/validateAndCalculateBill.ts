import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Request, Response } from 'express';
import { calculateSubtotal } from '../../shared/utilities/billing/pricing';
import { applyOffer } from '../../shared/utilities/offers/applyOffer';
import { applyTax } from '../../shared/utilities/billing/tax';
import { handleCustomerPreflight } from '../../shared/utilities/security/cors';

const db = admin.firestore();

const readString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const readNumber = (value: unknown, fallback = 0): number => {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : fallback;
};

const sanitizeCartItems = (rawItems: unknown[]): any[] => Array.isArray(rawItems)
	? rawItems.map((item) => {
		const data = (item || {}) as Record<string, unknown>;
		const qty = Math.max(1, Math.floor(readNumber(data.qty ?? data.quantity, 1)));
		const unitPrice = readNumber(data.finalUnitPrice ?? data.price, 0);
		const explicitTotal = readNumber(data.totalPrice, NaN);
		const normalizedItem: any = {
			productId: String(data.productId || data.id || ''),
			id: String(data.id || data.productId || ''),
			name: String(data.name || data.title || data.productName || ''),
			qty,
			quantity: qty,
			status: readString(data.status) || 'in-progress',
			price: unitPrice,
			finalUnitPrice: unitPrice,
			totalPrice: Number.isFinite(explicitTotal) ? explicitTotal : unitPrice * qty,
			addOns: Array.isArray(data.addOns) ? data.addOns : (Array.isArray(data.addons) ? data.addons : []),
			variation: readString(data.variation) || null,
			notes: readString(data.notes),
			offerId: readString(data.offerId) || null,
		};

		if (Array.isArray(data.items)) {
			normalizedItem.items = data.items.map((sub: any) => ({
				...sub,
				addOns: Array.isArray(sub.addOns) ? sub.addOns : (Array.isArray(sub.addons) ? sub.addons : []),
			}));
		}

		return normalizedItem;
	})
	: [];

export const validateAndCalculateBill = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	if (handleCustomerPreflight(req, res)) return;
	if (req.method !== 'POST') {
		res.status(405).json({ success: false, message: 'Method not allowed' });
		return;
	}

	try {
		const {
			cartItems,
			outletId,
			sessionId,
			tableId,
			autoAppliedOfferId,
		} = req.body as {
			cartItems?: unknown[];
			outletId?: string;
			sessionId?: string;
			tableId?: string;
			autoAppliedOfferId?: string;
		};

		console.info('[customerBillingValidateAndCalculateBill] request', {
			method: req.method,
			outletId: outletId || null,
			sessionId: sessionId || null,
			tableId: tableId || null,
			cartCount: Array.isArray(cartItems) ? cartItems.length : 0,
			autoAppliedOfferId: autoAppliedOfferId || null,
		});

		const items = sanitizeCartItems(Array.isArray(cartItems) ? cartItems : []);
		if (items.length === 0) {
			res.status(400).json({ success: false, message: 'cartItems is required' });
			return;
		}

		const subtotal = calculateSubtotal(items);
		let discount = 0;
		let appliedOffers: Array<{ offerId: string; title: string; type: string; amount: number }> = [];
		let discountSources: Array<{ offerId: string; title: string; type: string; amount: number }> = [];

		if (autoAppliedOfferId) {
			const offerSnap = await db.collection('offers').doc(String(autoAppliedOfferId)).get();
			if (offerSnap.exists) {
				const offerResult = applyOffer(
					{ outletId: String(outletId || ''), items, subtotal },
					{ id: offerSnap.id, ...(offerSnap.data() || {}) }
				);
				discount = offerResult.discount;
				appliedOffers = offerResult.appliedOffers;
				discountSources = offerResult.appliedOffers;
			}
		}

		const taxableAmount = Math.max(subtotal - discount, 0);
		const tax = applyTax(taxableAmount);
		const total = taxableAmount + tax;

		console.info('[customerBillingValidateAndCalculateBill] response', {
			sessionId: sessionId || null,
			tableId: tableId || null,
			subtotal,
			discount,
			tax,
			total,
			discountSources,
		});

		res.status(200).json({
			success: true,
			pricing: { subtotal, discount, tax, total },
			appliedOffers,
			discountSources,
			items,
			noteToCustomer: 'Your calculated bill is ready.',
		});
	} catch (error) {
		console.error('validateAndCalculateBill error:', error);
		res.status(500).json({ success: false, message: 'Internal server error', error: String(error) });
	}
});