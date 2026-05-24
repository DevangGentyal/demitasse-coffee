import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Request, Response } from 'express';
import { calculateSubtotal } from '../../shared/utilities/billing/pricing';
import { applyOffer } from '../../shared/utilities/offers/applyOffer';
import { applyTax } from '../../shared/utilities/billing/tax';
import { handleCustomerPreflight } from '../../shared/utilities/security/cors';
import { normalizeBillItemsForDisplay } from '../../shared/utilities/offers/orderPricing';

const db = admin.firestore();

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

		const items = normalizeBillItemsForDisplay(Array.isArray(cartItems) ? cartItems : []);
		if (items.length === 0) {
			res.status(400).json({ success: false, message: 'cartItems is required' });
			return;
		}

		// ── Enrich item categories from Firestore products collection ────────
		const getUniqueProductIds = (itemsList: any[]): Set<string> => {
			const ids = new Set<string>();
			for (const item of itemsList) {
				const pid = String(item.productId || item.id || '').trim();
				if (pid && !pid.startsWith('discount_') && !pid.startsWith('combo_') && !pid.startsWith('b1g1_') && !pid.startsWith('birthday_')) {
					ids.add(pid);
				}
				if (Array.isArray(item.items)) {
					getUniqueProductIds(item.items).forEach(id => ids.add(id));
				}
			}
			return ids;
		};

		const uniqueProductIds = Array.from(getUniqueProductIds(items));
		const productDataMap = new Map<string, { category: string; subcategory: string; name?: string }>();

		if (uniqueProductIds.length > 0) {
			await Promise.all(uniqueProductIds.map(async (pid) => {
				try {
					const snap = await db.collection('products').doc(pid).get();
					if (snap.exists) {
						const data = snap.data() || {};
						productDataMap.set(pid, {
							category: String(data.category || '').trim(),
							subcategory: String(data.subcategory || '').trim(),
							name: String(data.name || '').trim(),
						});
					}
				} catch (err) {
					console.warn(`Failed to fetch product metadata for ${pid}`, err);
				}
			}));
		}

		const enrichItemsTree = (itemsList: any[]) => {
			for (const item of itemsList) {
				const pid = String(item.productId || item.id || '').trim();
				const meta = productDataMap.get(pid);
				if (meta) {
					item.category = meta.category || null;
					item.subcategory = meta.subcategory || null;
					if (!item.name) item.name = meta.name;
				} else {
					item.category = item.category || null;
					item.subcategory = item.subcategory || null;
				}
				if (Array.isArray(item.items)) {
					enrichItemsTree(item.items);
				}
			}
		};

		enrichItemsTree(items);

		let offerDoc: FirebaseFirestore.DocumentData | null = null;
		const requestedOfferId = String(autoAppliedOfferId || '').trim();
		if (requestedOfferId) {
			const offerSnap = await db.collection('offers').doc(requestedOfferId).get();
			offerDoc = offerSnap.exists ? { id: offerSnap.id, ...(offerSnap.data() || {}) } : null;
		}
		const orderType = offerDoc?.offerType || offerDoc?.type ? String(offerDoc.offerType || offerDoc.type).toUpperCase() : 'BASIC';
		let subtotal = calculateSubtotal(items as any);
		// Ensure subtotal is integer rupees
		subtotal = Math.round(subtotal);
		const offerResult = applyOffer(
			{ outletId: String(outletId || ''), items: items as any, subTotal: subtotal },
			offerDoc as any
		);
		const discount = offerResult.discount;
		const discountedPrice = Math.max(subtotal - discount, 0);
		const tax = applyTax(discountedPrice);
		const total = discountedPrice + tax;

		console.info('[customerBillingValidateAndCalculateBill] response', {
			sessionId: sessionId || null,
			tableId: tableId || null,
			subtotal,
			discount,
			tax,
			total,
			orderType,
		});

		res.status(200).json({
			success: true,
			orderType,
			subTotal: subtotal,
			discount,
			discountedPrice,
			tax,
			grandTotal: total,
			pricing: { subtotal, discount, discountedPrice, tax, total },
			appliedOffers: offerResult.appliedOffers,
			discountSources: offerResult.appliedOffers,
			items,
			noteToCustomer: 'Your calculated bill is ready.',
		});
	} catch (error) {
		console.error('validateAndCalculateBill error:', error);
		res.status(500).json({ success: false, message: 'Internal server error', error: String(error) });
	}
});