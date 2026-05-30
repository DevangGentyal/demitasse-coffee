// shared/utilities/offers/orderPricing.ts
//
// Canonical pricing model:
//
//   unitPrice   = base price of 1 item (no add-ons, qty = 1)  — sourced from products collection
//   addOnsTotal = sum of all add-on prices for this item line
//   totalPrice  = (unitPrice + addOnsTotal) * qty              — per order-item
//   subTotal    = sum of all items' totalPrice
//
//   discount    = depends on orderType (see applyOffer.ts)
//   discountedPrice = max(subTotal - discount, 0)
//   tax         = floor(discountedPrice * TAX_RATE)
//   grandTotal  = discountedPrice + tax
//
// The Firestore order document stores exactly these keys — nothing else for money.

export type OrderType = 'BASIC' | 'B1G1' | 'COMBO' | 'DISCOUNT';

// ---------------------------------------------------------------------------
// Item normalisation
// ---------------------------------------------------------------------------

export interface RawInputItem {
	productId?: string;
	id?: string;
	qty?: number;
	quantity?: number;
	unitPrice?: number;
	price?: number;
	originalPrice?: number;
	finalPrice?: number;
	discountAmount?: number;
	dealPrice?: number;
	addOns?: Array<{ name?: string; price?: number }>;
	addons?: Array<{ name?: string; price?: number }>;
	offerId?: string;
	variation?: unknown;
	name?: string;
	[key: string]: unknown;
}

export interface NormalisedOrderItem {
	productId: string;
	name: string;
	category: string | null;
	subcategory: string | null;
	qty: number;
	unitPrice: number;       // base price per 1 item, no add-ons
	addOns: Array<{ name: string; price: number }>;
	totalPrice: number;      // (unitPrice + addOnsTotal) * qty
	originalPrice?: number | null;
	finalPrice?: number | null;
	discountAmount?: number | null;
	dealPrice?: number | null;
	price?: number | null;
	variation: unknown | null;
	offerId: string | null;
	offerType?: OrderType | null;
	offerTitle?: string | null;
	isOfferItem?: boolean;
	isCombo?: boolean;
	isManualB1G1?: boolean;
	isDiscount?: boolean;
	isBirthday?: boolean;
	isFree?: boolean;        // item is free (e.g., one of a B1G1 pair)
	status: string;
	createdBy: string | null;
	addedAt: Date | null;
	// If this item is a wrapper (combo) it may contain nested items
	items?: NormalisedOrderItem[];
	// For combos: the sum of base prices (unitPrice * qty) of nested items
	comboBaseTotal?: number;
	// For combos: declared combo price (admin-set)
	comboPrice?: number | null;
	// ── Item-level pricing (per-item discount model) ──────────────────────
	discount: number;        // discount amount for THIS item only
	discountedPrice: number; // totalPrice - discount for THIS item
	tax: number;             // floor(discountedPrice * 5%) for THIS item
}

export interface BillDisplayItem {
	id: string;
	productId: string;
	name: string;
	qty: number;
	unitPrice: number;
	totalPrice: number;
	addOns: Array<{ name: string; price: number }>;
	variations: unknown[];
	customizations: unknown[];
	items: BillDisplayItem[];
	isCombo: boolean;
	isManualB1G1: boolean;
	isDiscount: boolean;
	isBirthday: boolean;
	isFree: boolean;
	offerTitle: string;
	category?: string | null;
	subcategory?: string | null;
}

const readNumber = (v: unknown, fallback = 0): number => {
	const n = Number(v);
	return Number.isFinite(n) ? n : fallback;
};

const readString = (v: unknown): string => String(v ?? '').trim();

const readOfferType = (value: unknown): OrderType | null => {
	switch (readString(value).toUpperCase()) {
		case 'B1G1':
		case 'COMBO':
		case 'DISCOUNT':
			return readString(value).toUpperCase() as OrderType;
		default:
			return null;
	}
};

const resolveOfferMeta = (raw: RawInputItem): {
	offerType: OrderType | null;
	offerTitle: string | null;
	isCombo: boolean;
	isManualB1G1: boolean;
	isDiscount: boolean;
	isBirthday: boolean;
} => {
	const offerType = readOfferType(raw.offerType) || (raw.isCombo ? 'COMBO' : raw.isManualB1G1 ? 'B1G1' : raw.isDiscount ? 'DISCOUNT' : null);
	return {
		offerType,
		offerTitle: readString(raw.offerTitle) || null,
		isCombo: Boolean(raw.isCombo || offerType === 'COMBO'),
		isManualB1G1: Boolean(raw.isManualB1G1 || offerType === 'B1G1'),
		isDiscount: Boolean(raw.isDiscount || offerType === 'DISCOUNT'),
		isBirthday: Boolean(raw.isBirthday),
	};
};

const isSyntheticOfferWrapperId = (value: unknown): boolean => {
	const id = readString(value).toLowerCase();
	return id.startsWith('discount_') || id.startsWith('combo_') || id.startsWith('b1g1_') || id.startsWith('birthday_');
};

/**
 * Normalise raw items coming from the client into the canonical shape.
 * `resolveProductPrice` is called for each productId so the price is
 * always authoritative (from the products collection), never trusted from
 * the client payload.
 */
export const normalizeOrderItemsForPricing = async (
	rawItems: unknown[],
	resolveProductPrice?: (productId: string) => Promise<number | null>,
): Promise<NormalisedOrderItem[]> => {
	const results: NormalisedOrderItem[] = [];

	for (const rawItem of rawItems) {
		const raw = (rawItem || {}) as RawInputItem;
		const nestedItems = Array.isArray((raw as { items?: unknown[] }).items) ? (raw as { items?: unknown[] }).items || [] : [];
		const hasOfferWrapperShape = nestedItems.length > 0 && (
			Boolean(raw.offerId) ||
			Boolean(raw.offerType) ||
			Boolean(raw.isCombo) ||
			Boolean(raw.isManualB1G1) ||
			Boolean(raw.isDiscount) ||
			Boolean(raw.isBirthday) ||
			isSyntheticOfferWrapperId(raw.id)
		);
		const offerMeta = resolveOfferMeta(raw);
		const productId = readString(raw.productId || (hasOfferWrapperShape ? '' : raw.id));
		if (nestedItems.length > 0 && (hasOfferWrapperShape || !productId)) {
			const nestedResults = await normalizeOrderItemsForPricing(nestedItems, resolveProductPrice);
			const inheritedOfferId = readString(raw.offerId) || null;

			// If this wrapper is explicitly a combo, preserve it as a single combo wrapper
			if (offerMeta.isCombo) {
				const comboPrice = readNumber((raw as any).comboPrice ?? (raw as any).config?.combo?.comboPrice ?? 0);
				const wrapperTotalPrice = readNumber((raw as any).discountedPrice ?? raw.totalPrice ?? raw.price, NaN);
				const fallbackTotalPrice = nestedResults.reduce((s, it) => s + (it.totalPrice || 0), 0);
				const normalizedTotalPrice = Number.isFinite(wrapperTotalPrice) ? wrapperTotalPrice : fallbackTotalPrice;
				const comboBaseTotal = readNumber((raw as any).comboBaseTotal, NaN);
				const resolvedComboBaseTotal = Number.isFinite(comboBaseTotal) ? comboBaseTotal : Math.max(0, normalizedTotalPrice - comboPrice);

				results.push({
					productId: readString(raw.productId) || readString(raw.id) || `combo_${inheritedOfferId || 'anon'}`,
					name: readString(raw.name) || readString(raw.offerTitle) || 'Combo Offer',
					category: null,
					subcategory: null,
					qty: Math.max(Math.floor(readNumber(raw.qty ?? raw.quantity, 1)), 1),
					unitPrice: comboPrice,
					addOns: [],
					totalPrice: normalizedTotalPrice,
					originalPrice: readNumber(raw.originalPrice ?? raw.price, NaN),
					finalPrice: readNumber(raw.finalPrice ?? raw.dealPrice ?? normalizedTotalPrice, NaN),
					discountAmount: readNumber(raw.discountAmount ?? (Number.isFinite(resolvedComboBaseTotal) ? resolvedComboBaseTotal : 0), NaN),
					dealPrice: readNumber(raw.dealPrice ?? raw.finalPrice, NaN),
					price: readNumber(raw.price, NaN),
					variation: raw.variation ?? null,
					offerId: inheritedOfferId,
					offerType: offerMeta.offerType,
					offerTitle: offerMeta.offerTitle,
					isOfferItem: true,
					isCombo: true,
					isManualB1G1: false,
					isDiscount: false,
					isBirthday: false,
					status: readString(raw.status) || 'in-progress',
					createdBy: readString(raw.createdBy) || null,
					addedAt: null,
					// Combo metadata
					items: nestedResults,
					comboBaseTotal: resolvedComboBaseTotal,
					comboPrice: comboPrice || null,
					// Initialize pricing fields — applyOfferToItems will populate real values
					discount: readNumber(raw.discount ?? raw.discountAmount ?? Math.max(0, resolvedComboBaseTotal - comboPrice), 0),
					discountedPrice: normalizedTotalPrice,
					tax: 0,
				});
				continue;
			}

			// Default: flatten nested items but inherit wrapper metadata
			for (const nested of nestedResults) {
				results.push({
					...nested,
					offerId: nested.offerId || inheritedOfferId,
					offerType: nested.offerType || offerMeta.offerType,
					offerTitle: nested.offerTitle || offerMeta.offerTitle,
					isOfferItem: nested.isOfferItem || offerMeta.isCombo || offerMeta.isManualB1G1 || offerMeta.isDiscount || offerMeta.isBirthday || Boolean(inheritedOfferId),
					isCombo: nested.isCombo || offerMeta.isCombo,
					isManualB1G1: nested.isManualB1G1 || offerMeta.isManualB1G1,
					isDiscount: nested.isDiscount || offerMeta.isDiscount,
					isBirthday: nested.isBirthday || offerMeta.isBirthday,
					// ── Preserve item-level pricing from nested ───────────────
					discount: nested.discount ?? 0,
					discountedPrice: nested.discountedPrice ?? nested.totalPrice,
					tax: nested.tax ?? 0,
				});
			}
			continue;
		}
		if (!productId) {
			throw new Error('INVALID_ITEM_PAYLOAD');
		}
		const qty = Math.max(Math.floor(readNumber(raw.qty ?? raw.quantity, 1)), 1);

		const resolvedPrice = resolveProductPrice ? await resolveProductPrice(productId) : null;
		if (resolvedPrice === null) {
			throw new Error(`PRODUCT_NOT_FOUND:${productId}`);
		}
		const unitPrice = resolvedPrice;

		const rawAddOns: Array<{ name?: string; price?: number }> =
			Array.isArray(raw.addOns) ? raw.addOns : Array.isArray(raw.addons) ? raw.addons : [];

		const addOns = rawAddOns.map((a) => ({
			name: readString(a.name),
			price: readNumber(a.price, 0),
		}));

		const addOnsTotal = addOns.reduce((s, a) => s + a.price, 0);
		const totalPrice = (unitPrice + addOnsTotal) * qty;

		results.push({
			productId,
			name: readString(raw.name) || 'Unknown Product',
			category: null,       // enriched by caller after product fetch
			subcategory: null,
			qty,
			unitPrice,
			addOns,
			totalPrice,
			originalPrice: readNumber(raw.originalPrice ?? raw.price, NaN),
			finalPrice: readNumber(raw.finalPrice ?? raw.dealPrice, NaN),
			discountAmount: readNumber(raw.discountAmount, NaN),
			dealPrice: readNumber(raw.dealPrice ?? raw.finalPrice, NaN),
			price: readNumber(raw.price, NaN),
			variation: raw.variation ?? null,
			offerId: readString(raw.offerId) || null,
			offerType: offerMeta.offerType,
			offerTitle: offerMeta.offerTitle,
			isOfferItem: offerMeta.isCombo || offerMeta.isManualB1G1 || offerMeta.isDiscount || offerMeta.isBirthday || Boolean(readString(raw.offerId)),
			isCombo: offerMeta.isCombo,
			isManualB1G1: offerMeta.isManualB1G1,
			isDiscount: offerMeta.isDiscount,
			isBirthday: offerMeta.isBirthday,
			status: readString(raw.status) || 'in-progress',
			createdBy: readString(raw.createdBy) || null,
			addedAt: null,
			// ── Initialize item-level pricing to zero ───────────────────────
			discount: 0,
			discountedPrice: totalPrice,  // will be updated when offer is applied
			tax: 0,
		});
	}

	return results;
};

const readQty = (item: Record<string, unknown>): number => {
	const qty = readNumber(item.qty ?? item.quantity, 1);
	return Math.max(Math.floor(qty), 1);
};

const readMoney = (value: unknown): number | null => {
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
};

export const normalizeBillItemsForDisplay = (rawItems: unknown[]): BillDisplayItem[] => {
	if (!Array.isArray(rawItems) || rawItems.length === 0) return [];

	return rawItems.map((rawItem, index) => {
		const raw = (rawItem || {}) as Record<string, unknown>;
		const nestedItems = Array.isArray(raw.items) ? normalizeBillItemsForDisplay(raw.items) : [];
		const qty = readQty(raw);
		const storedTotal = readMoney(raw.totalPrice ?? raw.totalAmount ?? raw.itemTotal);
		const storedUnit = readMoney(raw.unitPrice ?? raw.finalUnitPrice ?? raw.price);
		const totalPrice = storedTotal !== null
			? Math.max(storedTotal, 0)
			: nestedItems.length > 0
				? nestedItems.reduce((sum, item) => sum + item.totalPrice, 0)
				: Math.max((storedUnit ?? 0) * qty, 0);
		const unitPrice = storedUnit !== null
			? Math.max(storedUnit, 0)
			: qty > 0
				? Math.max(totalPrice / qty, 0)
				: 0;
		const addOns = Array.isArray(raw.addOns)
			? raw.addOns
			: Array.isArray(raw.addons)
				? raw.addons
				: [];
		const items = Array.isArray(raw.items) ? normalizeBillItemsForDisplay(raw.items) : [];

		return {
			id: readString(raw.id) || readString(raw.productId) || readString(raw.name) || `item-${index}`,
			productId: readString(raw.productId) || readString(raw.id),
			name: readString(raw.name) || readString(raw.title) || 'Item',
			qty,
			unitPrice,
			totalPrice,
			addOns: addOns.map((a: { name?: string; price?: number }) => ({ name: readString(a?.name), price: readNumber(a?.price, 0) })),
			variations: Array.isArray(raw.variations) ? raw.variations : [],
			customizations: Array.isArray(raw.customizations) ? raw.customizations : [],
			items,
			isCombo: Boolean(raw.isCombo),
			isManualB1G1: Boolean(raw.isManualB1G1),
			isDiscount: Boolean(raw.isDiscount),
			isBirthday: Boolean(raw.isBirthday),
			isFree: Boolean(raw.isFree),
			offerTitle: readString(raw.offerTitle),
			category: raw.category ? String(raw.category).trim() : null,
			subcategory: raw.subcategory ? String(raw.subcategory).trim() : null,
		};
	});
};

// ---------------------------------------------------------------------------
// Order type inference
// ---------------------------------------------------------------------------

/**
 * Determines the billing mode for the whole order.
 * Priority: if any item carries an offerId that signals a special type,
 * that type wins.  Otherwise BASIC.
 *
 * The offer document's `type` field is the source of truth — this function
 * only inspects the items' offerId pointers; the actual offer document is
 * fetched by the caller (applyOffer) to resolve discount amounts.
 *
 * For the purposes of *inferring* the type before fetching the offer doc,
 * we rely on the offer document being passed in from the caller.  If not
 * available, default to BASIC and let applyOffer override.
 */
export const inferOrderType = (offerType: string | null | undefined): OrderType => {
	switch (readString(offerType).toUpperCase()) {
		case 'B1G1': return 'B1G1';
		case 'COMBO': return 'COMBO';
		case 'DISCOUNT': return 'DISCOUNT';
		default: return 'BASIC';
	}
};

// ---------------------------------------------------------------------------
// Grand-total builder  (single source of truth used by both endpoints)
// ---------------------------------------------------------------------------

export interface PricingSummary {
	subTotal: number;      // sum of all items' totalPrice
	discount: number;      // amount deducted (0 for BASIC)
	discountedPrice: number; // max(subTotal - discount, 0)
	tax: number;           // floor(discountedPrice * 5%)
	grandTotal: number;    // discountedPrice + tax
}

export const buildPricingSummary = (
	subTotal: number,
	discount: number,
	applyTaxFn: (amount: number) => number,
): PricingSummary => {
	const discountedPrice = Math.max(subTotal - discount, 0);
	const tax = applyTaxFn(discountedPrice);
	const grandTotal = discountedPrice + tax;
	return { subTotal, discount, discountedPrice, tax, grandTotal };
};

// ---------------------------------------------------------------------------
// Per-item discount calculation (item-level pricing model)
// ---------------------------------------------------------------------------

export interface OfferDocForPricing {
	id?: string;
	offerType?: string;
	type?: string;
	title?: string;
	config?: {
		combo?: { comboPrice?: number };
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
	comboPrice?: number;
	discountPercent?: number;
	discountValue?: number;
	applicableProductIds?: string[];
	products?: Array<{ productId?: string; name?: string }>;
	applicableCategory?: string;
	category?: string;
}

/**
 * Calculates per-item discount, discountedPrice, and tax based on offer type.
 * Each item gets its own discount amount depending on:
 * - The offer type (BASIC, B1G1, COMBO, DISCOUNT, BIRTHDAY)
 * - Whether the item is eligible for that offer
 * - The item's price and quantity
 *
 * Returns a new array of items with discount, discountedPrice, and tax populated.
 *
 * Pricing formula for each item:
 *   discount = calculated based on offer type and eligibility
 *   discountedPrice = totalPrice - discount
 *   tax = floor(discountedPrice * 5%)
 *
 * Order-level totals are then calculated by summing item-level values:
 *   subTotal = sum of all items' totalPrice
 *   discount = sum of all items' discount
 *   discountedPrice = sum of all items' discountedPrice
 *   tax = sum of all items' tax
 *   grandTotal = discountedPrice + tax
 */
export const applyOfferToItems = (
	items: NormalisedOrderItem[],
	offerDoc: OfferDocForPricing | null,
	applyTaxFn: (amount: number) => number,
): NormalisedOrderItem[] => {
	if (!offerDoc) {
		// No offer — all items get zero discount
		return items.map((item) => ({
			...item,
			discount: 0,
			discountedPrice: item.totalPrice,
			tax: applyTaxFn(item.totalPrice),
		}));
	}

	const offerType = (offerDoc.offerType ?? offerDoc.type ?? 'BASIC').toUpperCase();
	const results: NormalisedOrderItem[] = [];

	switch (offerType) {
		case 'B1G1': {
			// Find exactly 2 items with the same offerId matching this offer
			const offerItems = items.filter((it) => it.offerId === offerDoc.id);
			if (offerItems.length === 2) {
				// Sort by unitPrice; cheapest gets discounted
				const sorted = [...offerItems].sort((a, b) => a.unitPrice - b.unitPrice);

				// Mark the cheapest of the two B1G1 items as discounted (free base price)
				const cheapest = sorted[0];
				for (const item of items) {
					let discount = 0;
					if (item === cheapest) {
						// Discount equals the item's unitPrice (do NOT discount add-ons)
						discount = item.unitPrice;
					}
					const discountedPrice = Math.max(item.totalPrice - discount, 0);
					const tax = applyTaxFn(discountedPrice);

					results.push({ ...item, discount, discountedPrice, tax });
				}
			} else {
				// Not enough items for B1G1 — treat as BASIC (no discount)
				return items.map((item) => ({
					...item,
					discount: 0,
					discountedPrice: item.totalPrice,
					tax: applyTaxFn(item.totalPrice),
				}));
			}
			break;
		}

		case 'COMBO': {
			// Combo: treat the offer items as a single group object (do NOT assign
			// specific discount amounts to individual items). We prefer preserving
			// an explicit combo wrapper if present; otherwise synthesize one.
			const offerItems = items.filter((it) => {
				if (it.offerId === offerDoc.id) return true;
				if (Array.isArray(offerDoc.products) && offerDoc.products.length > 0) {
					return offerDoc.products.some((p: any) => String(p?.productId || '').trim() === String(it.productId).trim());
				}
				return false;
			});

			if (offerItems.length === 0) {
				// No items match combo — treat as BASIC
				return items.map((item) => ({
					...item,
					discount: 0,
					discountedPrice: item.totalPrice,
					tax: applyTaxFn(item.totalPrice),
				}));
			}

			// Detect if a combo wrapper item exists (created during normalization)
			const wrapper = offerItems.find((it) => it.isCombo && Array.isArray((it as any).items) && (it as any).items.length > 0) as NormalisedOrderItem | undefined;

			const comboPriceFromOffer = readNumber(offerDoc.config?.combo?.comboPrice ?? offerDoc.comboPrice, 0);

			if (wrapper) {
				const nested = (wrapper as any).items as NormalisedOrderItem[];
				const comboBaseTotal = wrapper.comboBaseTotal ?? nested.reduce((s, it) => s + (it.unitPrice * it.qty), 0);
				// nestedAddOnsTotal is available on the wrapper already (totalPrice includes addons)
				const comboPrice = wrapper.comboPrice ?? comboPriceFromOffer;
				const totalComboDiscount = Math.max(comboBaseTotal - (comboPrice || 0), 0);

				for (const item of items) {
					if (item === wrapper) {
						const discount = totalComboDiscount;
						const discountedPrice = Math.max(item.totalPrice - discount, 0); // should equal comboPrice + addons
						const tax = applyTaxFn(discountedPrice);
						results.push({ ...item, discount, discountedPrice, tax });
					} else if (item.offerId === offerDoc.id) {
						// Other individual components (if any) are left without per-item discounts
						results.push({ ...item, discount: 0, discountedPrice: item.totalPrice, tax: applyTaxFn(item.totalPrice) });
					} else {
						results.push({ ...item, discount: 0, discountedPrice: item.totalPrice, tax: applyTaxFn(item.totalPrice) });
					}
				}
			} else {
				// No wrapper exists — synthesize a single combo group and remove individual combo items
				const comboBaseTotal = offerItems.reduce((s, it) => s + (it.unitPrice * it.qty), 0);
				const nestedAddOnsTotal = offerItems.reduce((s, it) => s + (it.totalPrice - (it.unitPrice * it.qty)), 0);
				const comboPrice = comboPriceFromOffer;
				const totalComboDiscount = Math.max(comboBaseTotal - (comboPrice || 0), 0);

				// Push non-offer items unchanged
				for (const item of items) {
					if (!offerItems.includes(item)) {
						results.push({ ...item, discount: 0, discountedPrice: item.totalPrice, tax: applyTaxFn(item.totalPrice) });
					}
				}

				// Create synthetic wrapper representing the combo group
				const wrapperTotalPrice = comboBaseTotal + nestedAddOnsTotal;
				const wrapperDiscountedPrice = Math.max(wrapperTotalPrice - totalComboDiscount, 0); // comboPrice + addons
				results.push({
					productId: `combo_${offerDoc.id}`,
					name: readString(offerDoc.title ?? 'Combo Offer'),
					category: null,
					subcategory: null,
					qty: 1,
					unitPrice: comboPrice,
					addOns: [],
					totalPrice: wrapperTotalPrice,
					originalPrice: null,
					finalPrice: null,
					discountAmount: null,
					dealPrice: null,
					price: null,
					variation: null,
					offerId: offerDoc.id || null,
					offerType: 'COMBO',
					offerTitle: readString(offerDoc.title ?? 'Combo Offer'),
					isOfferItem: true,
					isCombo: true,
					isManualB1G1: false,
					isDiscount: false,
					isBirthday: false,
					status: 'in-progress',
					createdBy: null,
					addedAt: null,
					// combo metadata
					comboBaseTotal,
					comboPrice: comboPrice || null,
					items: offerItems,
					// pricing
					discount: totalComboDiscount,
					discountedPrice: wrapperDiscountedPrice,
					tax: applyTaxFn(wrapperDiscountedPrice),
				});
			}
			break;
		}

		case 'DISCOUNT': {
			// Discount offer: eligible items get percentage discount
			const discountConfig = offerDoc.config?.discount || {};
			const discountMode = String(discountConfig.mode || discountConfig.type || '').toUpperCase();
			const discountPercent = readNumber(
				discountConfig.discountValue ?? offerDoc.config?.discountValue ?? offerDoc.discountPercent ?? offerDoc.discountValue,
				0
			);

			// Collect allowed product IDs and category names
			const allowedIds: string[] = [];
			if (Array.isArray(discountConfig.productIds)) {
				allowedIds.push(...discountConfig.productIds.map((id: any) => String(id || '').trim()));
			} else if (Array.isArray(offerDoc.applicableProductIds)) {
				allowedIds.push(...offerDoc.applicableProductIds.map((id: any) => String(id || '').trim()));
			}
			if (Array.isArray(offerDoc.products)) {
				offerDoc.products.forEach((p: any) => {
					if (p && p.productId) {
						allowedIds.push(String(p.productId).trim());
					}
				});
			}
			const allowedNames = Array.isArray(offerDoc.products)
				? offerDoc.products.map((p: any) => String(p?.name || '').trim().toLowerCase()).filter(Boolean)
				: [];
			const categoryName = String(discountConfig.categoryName || discountConfig.category || offerDoc.applicableCategory || offerDoc.category || '').trim().toLowerCase();

			for (const item of items) {
				let discount = 0;

				// Check if item is eligible
				const isSpecial = item.isFree || item.isCombo || item.isManualB1G1 || item.isBirthday;
				const hasConflictingOffer = item.offerId && item.offerId !== offerDoc.id;

				if (!isSpecial && !hasConflictingOffer) {
					let isEligible = false;

					if (discountMode === 'CATEGORY' && categoryName) {
						const itemCat = String(item.category || '').trim().toLowerCase();
						const itemSubCat = String(item.subcategory || '').trim().toLowerCase();
						if (itemCat === categoryName || itemSubCat === categoryName) {
							isEligible = true;
						} else if (Array.isArray(offerDoc.products) && offerDoc.products.length > 0) {
							isEligible = offerDoc.products.some((p: any) => String(p?.productId || '').trim() === String(item.productId).trim());
						}
					} else if (discountMode === 'PRODUCT' && (allowedIds.length > 0 || allowedNames.length > 0)) {
						const itemId = String(item.productId).trim();
						const itemName = String(item.name).trim().toLowerCase();
						isEligible = allowedIds.includes(itemId) || allowedNames.includes(itemName);
					} else if (allowedIds.length > 0 || allowedNames.length > 0) {
						// Fallback: product-based discount
						const itemId = String(item.productId).trim();
						const itemName = String(item.name).trim().toLowerCase();
						isEligible = allowedIds.includes(itemId) || allowedNames.includes(itemName);
					} else if (categoryName && categoryName !== 'all') {
						// Fallback: category-based discount
						const itemCat = String(item.category || '').trim().toLowerCase();
						const itemSubCat = String(item.subcategory || '').trim().toLowerCase();
						isEligible = itemCat === categoryName || itemSubCat === categoryName;
					} else {
						// No restrictions — all items eligible
						isEligible = true;
					}

					if (isEligible) {
						const itemBaseTotal = item.unitPrice * item.qty;
						discount = Math.floor((itemBaseTotal * discountPercent) / 100);
					}
				}

				const discountedPrice = Math.max(item.totalPrice - discount, 0);
				const tax = applyTaxFn(discountedPrice);

				results.push({
					...item,
					discount,
					discountedPrice,
					tax,
				});
			}
			break;
		}

		case 'BIRTHDAY': {
			// Birthday: only the birthday item itself (marked isBirthday) gets to be free
			// The discount equals its full totalPrice
			for (const item of items) {
				let discount = 0;
				if (item.isBirthday && item.offerId === offerDoc.id) {
					discount = item.totalPrice; // Make it free
				}
				const discountedPrice = Math.max(item.totalPrice - discount, 0);
				const tax = applyTaxFn(discountedPrice);

				results.push({
					...item,
					discount,
					discountedPrice,
					tax,
				});
			}
			break;
		}

		default: {
			// BASIC or unknown offer type — no discount
			return items.map((item) => ({
				...item,
				discount: 0,
				discountedPrice: item.totalPrice,
				tax: applyTaxFn(item.totalPrice),
			}));
		}
	}

	return results;
};

/**
 * Applies pricing to items by grouping them on their own offerId and
 * resolving the matching offer document for each group.
 *
 * This is the canonical path for mixed carts/orders that contain more than
 * one special offer type (for example a COMBO row plus a DISCOUNT row).
 */
export const applyOfferPricingByGroup = (
	items: NormalisedOrderItem[],
	offerDocsById: Map<string, OfferDocForPricing>,
	applyTaxFn: (amount: number) => number,
): NormalisedOrderItem[] => {
	const groupedItems = new Map<string, NormalisedOrderItem[]>();

	for (const item of items) {
		const groupKey = readString(item.offerId) || '__basic__';
		if (!groupedItems.has(groupKey)) groupedItems.set(groupKey, []);
		groupedItems.get(groupKey)!.push(item);
	}

	const results: NormalisedOrderItem[] = [];
	for (const [groupKey, groupItems] of groupedItems.entries()) {
		const offerDoc = groupKey === '__basic__' ? null : (offerDocsById.get(groupKey) || null);
		if (offerDoc) {
			results.push(...applyOfferToItems(groupItems, offerDoc, applyTaxFn));
			continue;
		}
		results.push(...groupItems.map((item) => ({
			...item,
			discount: 0,
			discountedPrice: item.totalPrice,
			tax: applyTaxFn(item.totalPrice),
		})));
	}

	return results;
};

/**
 * Calculates order-level totals by summing item-level pricing.
 * This is the new canonical way to build PricingSummary when using item-level discounts.
 *
 * Formula:
 *   subTotal = sum of all items' totalPrice
 *   discount = sum of all items' discount
 *   discountedPrice = sum of all items' discountedPrice (= subTotal - discount)
 *   tax = sum of all items' tax
 *   grandTotal = discountedPrice + tax
 */
export const buildPricingSummaryFromItems = (items: NormalisedOrderItem[]): PricingSummary => {
	let subTotal = 0;
	let discount = 0;
	let discountedPrice = 0;
	let tax = 0;

	for (const item of items) {
		subTotal += item.totalPrice;
		discount += item.discount;
		discountedPrice += item.discountedPrice;
		tax += item.tax;
	}

	// Ensure no negative values
	subTotal = Math.max(0, subTotal);
	discount = Math.max(0, discount);
	discountedPrice = Math.max(0, discountedPrice);
	tax = Math.max(0, tax);

	const grandTotal = discountedPrice + tax;

	return { subTotal, discount, discountedPrice, tax, grandTotal };
};

export const decorateOrderItemsWithOfferMeta = (
	items: NormalisedOrderItem[],
	offerMeta: {
		offerId: string | null;
		offerType: OrderType | null;
		offerTitle: string | null;
	},
): NormalisedOrderItem[] => {
	const hasOffer = Boolean(offerMeta.offerId || offerMeta.offerType);
	return items.map((item) => ({
		...item,
		offerId: item.offerId || offerMeta.offerId,
		offerType: item.offerType || offerMeta.offerType,
		offerTitle: item.offerTitle || offerMeta.offerTitle,
		isOfferItem: item.isOfferItem || hasOffer,
		isCombo: item.isCombo || offerMeta.offerType === 'COMBO',
		isManualB1G1: item.isManualB1G1 || offerMeta.offerType === 'B1G1',
		isDiscount: item.isDiscount || offerMeta.offerType === 'DISCOUNT',
		isBirthday: item.isBirthday,
	}));
};