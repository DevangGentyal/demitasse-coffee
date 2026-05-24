// shared/utilities/offers/applyOffer.ts
//
// Discount rules per orderType:
//
//   BASIC    → discount = 0
//   B1G1     → discount = unitPrice of the cheapest of the two B1G1 items
//              (add-ons are NOT discounted, only the base item price)
//   COMBO    → discount = subTotal - offer.comboPrice
//              (offer.comboPrice is the fixed bundle price stored on the offer doc)
//   DISCOUNT → discount = floor(subTotal * offer.discountPercent / 100)

export type OrderType = 'BASIC' | 'B1G1' | 'COMBO' | 'DISCOUNT';

export interface OfferDocument {
	id: string;
	offerType?: string;
	type?: string;
	title?: string;
	config?: {
		combo?: {
			comboPrice?: number;
		};
		discount?: {
			discountValue?: number;
			mode?: string;
			type?: string;
			productIds?: string[];
			categoryName?: string | null;
			category?: string | null;
		};
		discountValue?: number;
	};
	/** For COMBO: the fixed bundle price */
	comboPrice?: number;
	/** For DISCOUNT: percentage off, e.g. 10 means 10% */
	discountPercent?: number;
	discountValue?: number;
	applicableProductIds?: string[];
	products?: Array<{ productId?: string; name?: string }>;
	applicableCategory?: string;
	category?: string;
}

export interface ApplyOfferInput {
	outletId?: string;
	subTotal: number;
	items: any[];
}

export interface ApplyOfferResult {
	orderType: OrderType;
	discount: number;
	appliedOffers: Array<{
		offerId: string;
		title: string;
		type: string;
		amount: number;
	}>;
}

const readNumber = (v: unknown, fallback = 0): number => {
	const n = Number(v);
	return Number.isFinite(n) ? n : fallback;
};

interface FlatItem {
	productId: string;
	name: string;
	category: string | null;
	subcategory: string | null;
	unitPrice: number;
	qty: number;
	totalPrice: number;
	isFree: boolean;
	isCombo: boolean;
	isManualB1G1: boolean;
	isDiscount: boolean;
	isBirthday: boolean;
	offerId: string | null;
}

const flattenItems = (items: any[], inheritedOfferId: string | null = null): FlatItem[] => {
	const result: FlatItem[] = [];
	for (const item of items) {
		if (!item) continue;
		const nested = Array.isArray(item.items) ? item.items : [];
		const currentOfferId = item.offerId || inheritedOfferId || null;
		if (nested.length > 0) {
			result.push(...flattenItems(nested, currentOfferId));
		} else {
			result.push({
				productId: String(item.productId || item.id || '').trim(),
				name: String(item.name || '').trim(),
				category: item.category ? String(item.category).trim() : null,
				subcategory: item.subcategory ? String(item.subcategory).trim() : null,
				unitPrice: Number(item.unitPrice ?? item.price ?? 0),
				qty: Number(item.qty ?? item.quantity ?? 1),
				totalPrice: Number(item.totalPrice ?? 0),
				isFree: Boolean(item.isFree),
				isCombo: Boolean(item.isCombo),
				isManualB1G1: Boolean(item.isManualB1G1),
				isDiscount: Boolean(item.isDiscount),
				isBirthday: Boolean(item.isBirthday),
				offerId: currentOfferId,
			});
		}
	}
	return result;
};

export const applyOffer = (
	input: ApplyOfferInput,
	offer: OfferDocument | null,
): ApplyOfferResult => {
	if (!offer) {
		return { orderType: 'BASIC', discount: 0, appliedOffers: [] };
	}

	const type = (offer.offerType ?? offer.type ?? 'BASIC').toUpperCase() as OrderType;
	const flatItems = flattenItems(input.items);

	switch (type) {
		case 'B1G1': {
			const offerItems = flatItems.filter((it) => it.offerId === offer.id);
			if (offerItems.length !== 2) {
				// Not enough items to apply B1G1 — treat as BASIC
				return { orderType: 'BASIC', discount: 0, appliedOffers: [] };
			}
			// Sort ascending by unitPrice, cheapest is the "free" one
			const sorted = [...offerItems].sort((a, b) => a.unitPrice - b.unitPrice);
			const discount = readNumber(sorted[0].unitPrice, 0);
			return { orderType: 'B1G1', discount, appliedOffers: [{ offerId: offer.id, title: offer.title || offer.id, type: 'B1G1', amount: discount }] };
		}

		case 'COMBO': {
			// Identify items that belong to this combo offer. Prefer explicit offerId on items,
			// fall back to matching products listed on the offer document.
			const offerItems = flatItems.filter((it) => {
				if (it.offerId === offer.id) return true;
				if (Array.isArray(offer.products) && offer.products.length > 0) {
					return offer.products.some((p: any) => String(p?.productId || '').trim() === String(it.productId).trim());
				}
				return false;
			});
			if (offerItems.length === 0) {
				// Nothing matches the combo — treat as BASIC
				return { orderType: 'BASIC', discount: 0, appliedOffers: [] };
			}
			const comboPrice = readNumber(offer.config?.combo?.comboPrice ?? offer.comboPrice, 0);
			// For combo discount we only consider base item prices (unitPrice * qty).
			const baseTotal = offerItems.reduce((s, it) => s + (Number(it.unitPrice || 0) * Number(it.qty || 0)), 0);
			const discount = Math.max(baseTotal - comboPrice, 0);
			return { orderType: 'COMBO', discount, appliedOffers: [{ offerId: offer.id, title: offer.title || offer.id, type: 'COMBO', amount: discount }] };
		}

		case 'DISCOUNT': {
			const discountConfig = offer.config?.discount || {};
			const discountMode = String(discountConfig.mode || discountConfig.type || '').toUpperCase();
			const percent = readNumber(discountConfig.discountValue ?? offer.config?.discountValue ?? offer.discountPercent ?? offer.discountValue, 0);

			// Collect allowed product IDs and names
			const allowedIds: string[] = [];
			if (Array.isArray(discountConfig.productIds)) {
				allowedIds.push(...discountConfig.productIds.map((id: any) => String(id || '').trim()));
			} else if (Array.isArray(offer.applicableProductIds)) {
				allowedIds.push(...offer.applicableProductIds.map((id: any) => String(id || '').trim()));
			}
			if (Array.isArray(offer.products)) {
				offer.products.forEach((p: any) => {
					if (p && p.productId) {
						allowedIds.push(String(p.productId).trim());
					}
				});
			}
			const allowedNames = Array.isArray(offer.products)
				? offer.products.map((p: any) => String(p?.name || '').trim().toLowerCase()).filter(Boolean)
				: [];

			// Collect allowed category name
			const categoryName = String(discountConfig.categoryName || discountConfig.category || offer.applicableCategory || offer.category || '').trim().toLowerCase();

			// Filter items that are normal and eligible
			const eligibleItems = flatItems.filter((item) => {
				// Must not be free or part of other non-discount offers.
				// Items tagged with this same discount offerId are eligible.
				if (item.isFree || item.isCombo || item.isManualB1G1 || item.isBirthday) {
					return false;
				}
				if (item.offerId && item.offerId !== offer.id) {
					return false;
				}

				if (discountMode === 'CATEGORY' && categoryName) {
					const itemCat = String(item.category || '').trim().toLowerCase();
					const itemSubCat = String(item.subcategory || '').trim().toLowerCase();
					// Match category or subcategory. If product list is provided on the offer,
					// also allow matching those productIds as a fallback.
					if (itemCat === categoryName || itemSubCat === categoryName) return true;
					if (Array.isArray(offer.products) && offer.products.length > 0) {
						return offer.products.some((p: any) => String(p?.productId || '').trim() === String(item.productId || '').trim());
					}
					return false;
				}

				if (discountMode === 'PRODUCT' && (allowedIds.length > 0 || allowedNames.length > 0)) {
					const itemId = String(item.productId).trim();
					const itemName = String(item.name).trim().toLowerCase();
					return allowedIds.includes(itemId) || allowedNames.includes(itemName);
				}

				// Fallback 1: if products list exists, treat as product discount
				if (allowedIds.length > 0 || allowedNames.length > 0) {
					const itemId = String(item.productId).trim();
					const itemName = String(item.name).trim().toLowerCase();
					return allowedIds.includes(itemId) || allowedNames.includes(itemName);
				}

				// Fallback 2: if category exists
				if (categoryName && categoryName !== 'all') {
					const itemCat = String(item.category || '').trim().toLowerCase();
					const itemSubCat = String(item.subcategory || '').trim().toLowerCase();
					return itemCat === categoryName || itemSubCat === categoryName;
				}

				return true;
			});

			const baseAmount = eligibleItems.reduce((sum, item) => sum + (item.unitPrice * item.qty), 0);
			const discount = Math.floor(baseAmount * percent / 100);

			return { orderType: 'DISCOUNT', discount, appliedOffers: [{ offerId: offer.id, title: offer.title || offer.id, type: 'DISCOUNT', amount: discount }] };
		}

		default:
			return { orderType: 'BASIC', discount: 0, appliedOffers: [] };
	}
};