// shared/utilities/billing/tax.ts

const TAX_RATE = 0.05;

/**
 * Returns the tax amount (floored) for a given taxable amount.
 * tax = floor(discountedPrice * TAX_RATE)
 */
export const applyTax = (amount: number): number => {
  const sanitizedAmount = Number.isFinite(amount) ? Math.max(amount, 0) : 0;
  return Math.round(sanitizedAmount * TAX_RATE);
};
