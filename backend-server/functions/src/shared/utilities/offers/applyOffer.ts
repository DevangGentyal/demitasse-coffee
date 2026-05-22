import { Timestamp } from "firebase-admin/firestore";

interface DiscountOffer {
	discountValue?: number;
}

interface BogoOffer {
	applicableItems?: string[];
	rewardItems?: string[];
}

interface GenericOffer extends DiscountOffer, BogoOffer {
	id: string;
	title?: string;
	type?: string;
	isActive?: boolean;
	startDate?: Timestamp | Date | string | null;
	endDate?: Timestamp | Date | string | null;
	minOrderValue?: number;
	outletId?: string;
	applicableCategory?: string;
	config?: {
		discount?: {
			discountValue?: number;
			discountType?: string;
		};
	};
}

interface OrderItem {
	productId: string;
	qty: number;
	finalUnitPrice?: number;
	totalPrice: number;
}

export interface OfferApplicationResult {
	discount: number;
	appliedOffers: Array<{
		offerId: string;
		title: string;
		type: string;
		amount: number;
	}>;
}

const toDate = (value: Timestamp | Date | string | null | undefined): Date | null => {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return value;
	}

	if (value instanceof Timestamp) {
		return value.toDate();
	}

	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const clampDiscount = (discount: number, subtotal: number): number => {
	const sanitizedDiscount = Number.isFinite(discount) ? discount : 0;
	return Math.max(0, Math.min(sanitizedDiscount, Math.max(subtotal, 0)));
};

const computePercentageOrFlatDiscount = (offer: GenericOffer, subtotal: number): number => {
	const rawValue = Number(offer.discountValue ?? 0);
	if (!Number.isFinite(rawValue) || rawValue <= 0) {
		return 0;
	}

	return (subtotal * rawValue) / 100;
};

const computeBogoDiscount = (offer: GenericOffer, items: OrderItem[]): number => {
	const applicableItems = Array.isArray(offer.applicableItems) ? offer.applicableItems : [];
	if (applicableItems.length === 0 || items.length === 0) {
		return 0;
	}

	let discount = 0;
	for (const orderItem of items) {
		if (!applicableItems.includes(orderItem.productId)) {
			continue;
		}

		const qty = Number(orderItem.qty ?? 0);
		const finalUnitPrice = Number(orderItem.finalUnitPrice ?? 0);
		if (!Number.isFinite(qty) || qty < 2 || !Number.isFinite(finalUnitPrice) || finalUnitPrice <= 0) {
			continue;
		}

		discount += Math.floor(qty / 2) * finalUnitPrice;
	}

	return discount;
};

export const applyOffer = (
	order: {
		outletId?: string;
		items: OrderItem[];
		subtotal: number;
	},
	offer: GenericOffer | null
): OfferApplicationResult => {
	if (!offer) {
		return { discount: 0, appliedOffers: [] };
	}

	if (!offer.isActive) {
		return { discount: 0, appliedOffers: [] };
	}

	if (offer.outletId && order.outletId && offer.outletId !== order.outletId) {
		return { discount: 0, appliedOffers: [] };
	}

	const now = new Date();
	const startDate = toDate(offer.startDate);
	const endDate = toDate(offer.endDate);

	if (startDate && now < startDate) {
		return { discount: 0, appliedOffers: [] };
	}

	if (endDate && now > endDate) {
		return { discount: 0, appliedOffers: [] };
	}

	const minOrderValue = Number(offer.minOrderValue ?? 0);
	if (Number.isFinite(minOrderValue) && minOrderValue > 0 && order.subtotal < minOrderValue) {
		return { discount: 0, appliedOffers: [] };
	}

	let discount = 0;
	const normalizedType = String(offer.type || "").toUpperCase();

	if (normalizedType === "DISCOUNT") {
		discount = computePercentageOrFlatDiscount(offer, order.subtotal);
	} else if (normalizedType === "CATEGORY_DISCOUNT") {
		const category = String(offer.applicableCategory || "").toLowerCase();
		const discountPercent = Number(offer.discountValue || offer.config?.discount?.discountValue || 0);

		if (category && discountPercent > 0) {
			discount = (order.subtotal * discountPercent) / 100;
		}
	} else if (normalizedType === "BOGO" || normalizedType === "B1G1") {
		discount = computeBogoDiscount(offer, order.items);
	} else {
		console.log(`[OFFER_APPLY] ⚠️ Unknown offer type: ${offer.type}`);
		return { discount: 0, appliedOffers: [] };
	}

	const finalDiscount = clampDiscount(discount, order.subtotal);
	if (finalDiscount <= 0) {
		return { discount: 0, appliedOffers: [] };
	}

	return {
		discount: finalDiscount,
		appliedOffers: [
			{
				offerId: offer.id,
				title: offer.title || "Offer",
				type: offer.type || "discount",
				amount: finalDiscount,
			},
		],
	};
};
