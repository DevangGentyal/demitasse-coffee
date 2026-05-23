const TAX_RATE = 0.05;

export const applyTax = (amount: number): number => {
	const sanitizedAmount = Number.isFinite(amount) ? Math.max(amount, 0) : 0;
	return Math.floor(sanitizedAmount * TAX_RATE);
};
