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
	status: string;
	createdBy: string | null;
	addedAt: Date | null;
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