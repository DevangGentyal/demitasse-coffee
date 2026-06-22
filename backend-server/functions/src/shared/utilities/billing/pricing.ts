// shared/utilities/billing/pricing.ts

export interface OrderItemWithTotal {
	/** (basePrice + addOnsTotal) * qty */
	totalPrice: number;
}

/**
 * subTotal = sum of every item's totalPrice
 * totalPrice on each item = (unitPrice + addOnsTotal) * qty
 */
export const calculateSubtotal = (items: OrderItemWithTotal[]): number => {
  if (!Array.isArray(items) || items.length === 0) return 0;
  return items.reduce((sum, item) => {
    const price = Number(item?.totalPrice ?? 0);
    return sum + (Number.isFinite(price) ? Math.max(price, 0) : 0);
  }, 0);
};
