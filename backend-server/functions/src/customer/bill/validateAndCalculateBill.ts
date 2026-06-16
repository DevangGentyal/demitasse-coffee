import * as functions from 'firebase-functions';
import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { applyOffer } from '../../shared/utilities/offers/applyOffer';
import { applyTax } from '../../shared/utilities/billing/tax';
import { handleCustomerPreflight } from '../../shared/utilities/security/cors';
import { getOfferDocs, getProductDocs } from '../../shared/utilities/firestoreCatalog';
import {
	NormalisedOrderItem,
	applyOfferPricingByGroup,
	buildPricingSummaryFromItems,
} from '../../shared/utilities/offers/orderPricing';

const readNumber = (value: unknown, fallback = 0): number => {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : fallback;
};

const readString = (value: unknown): string => String(value ?? '').trim();

/**
 * Detects a NEW_USER offer wrapper item — these have offerType=NEW_USER but no
 * real products (items array is empty). They represent a cart-level % discount
 * and should NOT be normalised as regular order items. Instead we capture their
 * offerId so the NEW_USER discount is applied to the rest of the cart.
 */
const isSyntheticNewUserItem = (item: Record<string, unknown>): boolean => {
	const offerType = String(item.offerType || '').trim().toUpperCase();
	const productId = String(item.productId || item.id || '').trim();
	return (
		offerType === 'NEW_USER' &&
		(!productId || productId.startsWith('new_user_') || productId.startsWith('discount_')) &&
		(!Array.isArray(item.items) || (item.items as unknown[]).length === 0)
	);
};

interface NormalizeResult {
	items: NormalisedOrderItem[];
	capturedNewUserOfferIds: string[];
}

const normalizeItemsForValidation = (
	rawItems: unknown[],
	inheritedOffer?: { offerId?: string; offerType?: string; offerTitle?: string },
): NormalizeResult => {
	if (!Array.isArray(rawItems)) return { items: [], capturedNewUserOfferIds: [] };

	const normalized: NormalisedOrderItem[] = [];
	const capturedNewUserOfferIds: string[] = [];

	for (const rawItem of rawItems) {
		const item = (rawItem || {}) as Record<string, unknown>;
		const nestedItems = Array.isArray(item.items) ? item.items : [];

		// ✅ NEW_USER offer items have no products — capture their offerId and skip normalization
		if (isSyntheticNewUserItem(item)) {
			const offerId = readString(item.offerId);
			if (offerId) capturedNewUserOfferIds.push(offerId);
			continue;
		}

		const currentOfferId = readString(item.offerId || inheritedOffer?.offerId) || null;
		const currentOfferType = readString(item.offerType || inheritedOffer?.offerType) || null;
		const currentOfferTitle = readString(item.offerTitle || inheritedOffer?.offerTitle) || null;

		if (nestedItems.length > 0) {
			if (String(currentOfferType).toUpperCase() === 'COMBO' || Boolean(item.isCombo)) {
				const nestedResult = normalizeItemsForValidation(nestedItems, {
					offerId: currentOfferId || undefined,
					offerType: currentOfferType || undefined,
					offerTitle: currentOfferTitle || undefined,
				});
				capturedNewUserOfferIds.push(...nestedResult.capturedNewUserOfferIds);
				const nestedNormalized = nestedResult.items;
				const rawTotalPrice = readNumber(item.totalPrice ?? item.discountedPrice ?? item.price, Number.NaN);
				const fallbackTotalPrice = nestedNormalized.reduce((sum, nested) => sum + nested.totalPrice, 0);
				const comboPrice = readNumber(item.comboPrice ?? item.comboBasePrice ?? item.price, 0);
				const totalPrice = Number.isFinite(rawTotalPrice) ? rawTotalPrice : fallbackTotalPrice;

				normalized.push({
					productId: readString(item.productId || item.id || `combo_${currentOfferId || 'group'}`),
					name: readString(item.name || item.title) || 'Offer Group',
					category: readString(item.category) || null,
					subcategory: readString(item.subcategory) || null,
					qty: Math.max(1, Math.floor(readNumber(item.qty ?? item.quantity, 1))),
					unitPrice: comboPrice,
					addOns: [],
					totalPrice,
					variation: item.variation ?? null,
					offerId: currentOfferId,
					offerType: (currentOfferType?.toUpperCase() as any) || 'COMBO',
					offerTitle: currentOfferTitle,
					isOfferItem: true,
					isCombo: true,
					isManualB1G1: false,
					isDiscount: false,
					isBirthday: false,
					isFree: Boolean(item.isFree),
					status: readString(item.status) || 'in-progress',
					createdBy: null,
					addedAt: null,
					items: nestedNormalized,
					comboBaseTotal: readNumber(item.comboBaseTotal, Math.max(0, totalPrice - comboPrice)),
					comboPrice: comboPrice || null,
					discount: readNumber(item.discount ?? item.discountAmount ?? 0, 0),
					discountedPrice: readNumber(item.discountedPrice ?? totalPrice, totalPrice),
					tax: 0,
				});
			} else {
				const nestedResult = normalizeItemsForValidation(nestedItems, {
					offerId: currentOfferId || undefined,
					offerType: currentOfferType || undefined,
					offerTitle: currentOfferTitle || undefined,
				});
				capturedNewUserOfferIds.push(...nestedResult.capturedNewUserOfferIds);
				normalized.push(...nestedResult.items);
			}
			continue;
		}

		const qty = Math.max(1, Math.floor(readNumber(item.qty ?? item.quantity, 1)));
		const unitPrice = readNumber(item.unitPrice ?? item.price ?? item.finalUnitPrice, 0);
		const addOnsRaw = Array.isArray(item.addOns)
			? item.addOns
			: Array.isArray(item.addons)
				? item.addons
				: [];
		const addOns = addOnsRaw.map((addon) => {
			const addOnRecord = (addon || {}) as Record<string, unknown>;
			return {
				name: readString(addOnRecord.name),
				price: readNumber(addOnRecord.price, 0),
			};
		});
		const addOnsTotal = addOns.reduce((sum, addon) => sum + addon.price, 0);
		const explicitTotalPrice = readNumber(item.totalPrice, Number.NaN);
		const totalPrice = Number.isFinite(explicitTotalPrice)
			? explicitTotalPrice
			: (unitPrice + addOnsTotal) * qty;

		normalized.push({
			productId: readString(item.productId || item.id),
			name: readString(item.name || item.title) || 'Item',
			category: readString(item.category) || null,
			subcategory: readString(item.subcategory) || null,
			qty,
			unitPrice,
			addOns,
			totalPrice,
			variation: item.variation ?? null,
			offerId: currentOfferId,
			offerType: (currentOfferType?.toUpperCase() as any) || null,
			offerTitle: currentOfferTitle,
			isOfferItem: Boolean(currentOfferId || currentOfferType || item.isCombo || item.isManualB1G1 || item.isDiscount || item.isBirthday),
			isCombo: Boolean(item.isCombo || currentOfferType?.toUpperCase() === 'COMBO'),
			isManualB1G1: Boolean(item.isManualB1G1 || currentOfferType?.toUpperCase() === 'B1G1'),
			isDiscount: Boolean(item.isDiscount || currentOfferType?.toUpperCase() === 'DISCOUNT' || currentOfferType?.toUpperCase() === 'NEW_USER'),
			isBirthday: Boolean(item.isBirthday || currentOfferType?.toUpperCase() === 'BIRTHDAY'),
			isFree: Boolean(item.isFree),
			status: readString(item.status) || 'in-progress',
			createdBy: null,
			addedAt: null,
			discount: 0,
			discountedPrice: totalPrice,
			tax: 0,
		});
	}

	return {
		items: normalized.filter((item) => readString(item.productId)),
		capturedNewUserOfferIds,
	};
};

export const validateAndCalculateBill = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	if (handleCustomerPreflight(req, res)) return;
	if (req.method !== 'POST') {
		res.status(405).json({ success: false, message: 'Method not allowed' });
		return;
	}

	let uid: string | null = null;
	if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
		try {
			const idToken = req.headers.authorization.split('Bearer ')[1];
			const decoded = await admin.auth().verifyIdToken(idToken);
			uid = decoded.uid;
		} catch (error) {
			console.error('validateAndCalculateBill token verification failed:', error);
		}
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

		const normalizeResult = normalizeItemsForValidation(Array.isArray(cartItems) ? cartItems : []);
		const items = normalizeResult.items;
		const capturedNewUserOfferIds = normalizeResult.capturedNewUserOfferIds;

		if (items.length === 0) {
			res.status(400).json({ success: false, message: 'cartItems is required' });
			return;
		}

		// ── Enrich item categories from Firestore products collection ────────
		const getUniqueProductIds = (itemsList: NormalisedOrderItem[]): Set<string> => {
			const ids = new Set<string>();
			for (const item of itemsList) {
				const pid = String(item.productId || '').trim();
				if (pid && !pid.startsWith('discount_') && !pid.startsWith('combo_') && !pid.startsWith('b1g1_') && !pid.startsWith('birthday_')) {
					ids.add(pid);
				}
			}
			return ids;
		};

		const uniqueProductIds = Array.from(getUniqueProductIds(items));
		const productDataMap = await getProductDocs(uniqueProductIds, String(outletId || ''));

		const enrichItemsTree = (itemsList: NormalisedOrderItem[]) => {
			for (const item of itemsList) {
				const pid = String(item.productId || '').trim();
				const meta = productDataMap.get(pid);
				if (meta) {
					item.category = meta.category || null;
					item.subcategory = meta.subcategory || null;
					if (!item.name && meta.name) item.name = meta.name;
				} else {
					item.category = item.category || null;
					item.subcategory = item.subcategory || null;
				}
			}
		};

		enrichItemsTree(items);

		// ── Resolve all offer IDs (including captured NEW_USER offer IDs) ──
		const requestedOfferId = String(autoAppliedOfferId || '').trim();
		const uniqueOfferIds = new Set<string>();
		if (requestedOfferId) uniqueOfferIds.add(requestedOfferId);
		for (const item of items) {
			const offerId = String(item.offerId || '').trim();
			if (offerId) uniqueOfferIds.add(offerId);
		}
		// ✅ Also add NEW_USER offer IDs captured from synthetic wrapper items
		for (const offerId of capturedNewUserOfferIds) {
			if (offerId) uniqueOfferIds.add(offerId);
		}

		const offerDocsById = await getOfferDocs(uniqueOfferIds, String(outletId || ''));

		// ── Validate NEW_USER offer minOrderValue server-side ─────────────
		for (const newUserOfferId of capturedNewUserOfferIds) {
			const offerDoc = offerDocsById.get(newUserOfferId);
			if (!offerDoc) continue;
			const minOrderValue = Number(offerDoc.minOrderValue || 0);
			if (minOrderValue > 0) {
				const regularSubtotal = items
					.filter(i => !i.isFree && !i.isCombo && !i.isManualB1G1 && !i.isBirthday)
					.reduce((sum, i) => sum + i.totalPrice, 0);
				if (regularSubtotal < minOrderValue) {
					res.status(400).json({
						success: false,
						message: `Minimum order value ₹${minOrderValue} required for ${offerDoc.title || 'this offer'}.`,
					});
					return;
				}
			}
		}

		// ── Apply NEW_USER offerId to all regular items that don't already have an offerId ──
		// This allows applyOfferPricingByGroup to apply the discount correctly.
		for (const newUserOfferId of capturedNewUserOfferIds) {
			for (const item of items) {
				if (!item.offerId && !item.isFree && !item.isCombo && !item.isManualB1G1 && !item.isBirthday) {
					item.offerId = newUserOfferId;
					item.offerType = 'NEW_USER' as any;
					item.isDiscount = true;
				}
			}
		}

		const orderType = offerDocsById.size > 0 ? 'MIXED' : 'BASIC';
		let subtotal = Math.round(items.reduce((sum, item) => sum + readNumber(item.totalPrice, 0), 0));
		const offerResult = applyOffer(
			{ outletId: String(outletId || ''), items, subTotal: subtotal },
			requestedOfferId && offerDocsById.has(requestedOfferId) ? offerDocsById.get(requestedOfferId) as any : null
		);
		const itemsWithPricing = applyOfferPricingByGroup(items, offerDocsById as any, applyTax);
		const pricing = buildPricingSummaryFromItems(itemsWithPricing);
		subtotal = pricing.subTotal;
		const discount = pricing.discount;
		const discountedPrice = pricing.discountedPrice;
		const tax = pricing.tax;
		const total = pricing.grandTotal;

		console.info('[customerBillingValidateAndCalculateBill] response', {
			sessionId: sessionId || null,
			tableId: tableId || null,
			subtotal,
			discount,
			tax,
			total,
			orderType,
			capturedNewUserOfferIds,
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
			items: itemsWithPricing,
			noteToCustomer: 'Your calculated bill is ready.',
		});
	} catch (error) {
		console.error('validateAndCalculateBill error:', error);
		res.status(500).json({ success: false, message: 'Internal server error', error: String(error) });
	}
});
