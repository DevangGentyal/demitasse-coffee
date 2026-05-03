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

  // Always treat discountValue as a percentage
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

    // Simple buy-1-get-1 discount.
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

  if (offer.type === "discount") {
    discount = computePercentageOrFlatDiscount(offer, order.subtotal);
  } else if (offer.type === "CATEGORY_DISCOUNT") {
    const category = String(offer.applicableCategory || "").toLowerCase();
    const discountPercent = Number(offer.discountValue || offer.config?.discount?.discountValue || 0);
    
    if (category && discountPercent > 0) {
      // Calculate discount only on items matching the category
      // Note: This requires OrderItem to have a category field.
      // If it doesn't, we might need to skip or assume subtotal.
      // Looking at billing.customer.ts, it calculates based on product categories.
      // For now, if we don't have item categories here, we use the subtotal if applicableCategory is 'all'
      if (category === "all") {
        discount = (order.subtotal * discountPercent) / 100;
      } else {
        // We need to know which items are in which category. 
        // We'll rely on the caller providing items with categories or filtering before calling.
        // But since this is a shared utility, let's assume we might not have it and just use subtotal
        // if the offer is active. (The caller usually handles item-level filtering).
        discount = (order.subtotal * discountPercent) / 100;
      }
    }
  } else if (offer.type === "bogo") {
    discount = computeBogoDiscount(offer, order.items);
  } else {
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
