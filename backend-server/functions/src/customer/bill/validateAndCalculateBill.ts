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

const normalizeItemsForValidation = (
	rawItems: unknown[],
	inheritedOffer?: { offerId?: string; offerType?: string; offerTitle?: string },
): NormalisedOrderItem[] => {
	if (!Array.isArray(rawItems)) return [];

	const normalized: NormalisedOrderItem[] = [];

	for (const rawItem of rawItems) {
		const item = (rawItem || {}) as Record<string, unknown>;
		const nestedItems = Array.isArray(item.items) ? item.items : [];

		const currentOfferId = readString(item.offerId || inheritedOffer?.offerId) || null;
		const currentOfferType = readString(item.offerType || inheritedOffer?.offerType) || null;
		const currentOfferTitle = readString(item.offerTitle || inheritedOffer?.offerTitle) || null;

		if (nestedItems.length > 0) {
			if (String(currentOfferType).toUpperCase() === 'COMBO' || Boolean(item.isCombo)) {
				const nestedNormalized = normalizeItemsForValidation(nestedItems, {
					offerId: currentOfferId || undefined,
					offerType: currentOfferType || undefined,
					offerTitle: currentOfferTitle || undefined,
				});
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
				normalized.push(
					...normalizeItemsForValidation(nestedItems, {
						offerId: currentOfferId || undefined,
						offerType: currentOfferType || undefined,
						offerTitle: currentOfferTitle || undefined,
					}),
				);
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
			isDiscount: Boolean(item.isDiscount || currentOfferType?.toUpperCase() === 'DISCOUNT' || currentOfferType?.toUpperCase() === 'REGISTRATION'),
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

	return normalized.filter((item) => readString(item.productId));
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

		const items = normalizeItemsForValidation(Array.isArray(cartItems) ? cartItems : []);
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

		const requestedOfferId = String(autoAppliedOfferId || '').trim();
		const uniqueOfferIds = new Set<string>();
		if (requestedOfferId) uniqueOfferIds.add(requestedOfferId);
		for (const item of items) {
			const offerId = String(item.offerId || '').trim();
			if (offerId) uniqueOfferIds.add(offerId);
		}
		const offerDocsById = await getOfferDocs(uniqueOfferIds, String(outletId || ''));
		if (uid) {
			const { validateRegistrationEligibility } = await import('../../shared/utilities/firestoreCatalog.js');
			await validateRegistrationEligibility(uid, offerDocsById);
		}

		// ── Tag normal items with the auto-applied registration offer ID ─────────
		// applyOfferPricingByGroup groups items by their offerId. Normal cart items
		// have no offerId, so they would get zero discount. We tag them here so the
		// registration offer discount is correctly applied to their prices before tax.
		if (requestedOfferId && offerDocsById.has(requestedOfferId)) {
			for (const item of items) {
				const isSpecial = item.isFree || item.isCombo || item.isManualB1G1 || item.isBirthday;
				const hasOwnOffer = item.offerId && item.offerId !== requestedOfferId;
				if (!isSpecial && !hasOwnOffer) {
					item.offerId = requestedOfferId;
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
