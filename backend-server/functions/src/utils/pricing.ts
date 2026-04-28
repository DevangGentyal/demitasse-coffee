export interface OrderItemWithTotal {
  totalPrice: number;
}

export const calculateSubtotal = (items: OrderItemWithTotal[]): number => {
  if (!Array.isArray(items) || items.length === 0) {
    return 0;
  }

  return items.reduce((sum, item) => {
    const price = Number(item?.totalPrice ?? 0);
    return sum + (Number.isFinite(price) ? Math.max(price, 0) : 0);
  }, 0);
};

export const calculateTotal = (items: OrderItemWithTotal[]): number => {
  return calculateSubtotal(items);
};
