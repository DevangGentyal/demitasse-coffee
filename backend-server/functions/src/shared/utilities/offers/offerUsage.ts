export interface OfferUsage {
	offerId: string;
	count: number;
}

const readPositiveCount = (value: unknown, fallback = 0): number => {
	const numeric = Number(value);
	return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
};

export const getPerUserLimit = (offer: FirebaseFirestore.DocumentData | undefined): number | null => {
	const limit = readPositiveCount(offer?.userRules?.perUserLimit);
	return limit > 0 ? limit : null;
};

export const getAppliedOfferUsageCounts = (rawUsages: unknown): Map<string, number> => {
	const counts = new Map<string, number>();
	if (!Array.isArray(rawUsages)) return counts;

	for (const rawUsage of rawUsages) {
		const usage = (rawUsage || {}) as Record<string, unknown>;
		const offerId = String(usage.offerId || "").trim();
		const count = readPositiveCount(usage.count);
		if (!offerId || count <= 0) continue;
		counts.set(offerId, (counts.get(offerId) || 0) + count);
	}

	return counts;
};

export const collectRequestedOfferUsages = (
	items: unknown[],
	autoAppliedOfferId?: string | null
): OfferUsage[] => {
	const counts = new Map<string, number>();

	for (const rawItem of Array.isArray(items) ? items : []) {
		const item = (rawItem || {}) as Record<string, unknown>;
		const offerId = String(item.offerId || "").trim();
		if (!offerId) continue;
		counts.set(offerId, 1);
	}

	const autoOfferId = String(autoAppliedOfferId || "").trim();
	if (autoOfferId) {
		counts.set(autoOfferId, 1);
	}

	return Array.from(counts, ([offerId, count]) => ({ offerId, count }));
};

export const findUsageLimitViolation = (
	requestedUsages: OfferUsage[],
	existingCounts: Map<string, number>,
	offersById: Map<string, FirebaseFirestore.DocumentData | undefined>
): OfferUsage | null => {
	for (const usage of requestedUsages) {
		const limit = getPerUserLimit(offersById.get(usage.offerId));
		if (limit !== null && (existingCounts.get(usage.offerId) || 0) + usage.count > limit) {
			return usage;
		}
	}
	return null;
};

export const mergeAppliedOfferUsages = (
	rawUsages: unknown,
	requestedUsages: OfferUsage[]
): OfferUsage[] => {
	const counts = getAppliedOfferUsageCounts(rawUsages);
	for (const usage of requestedUsages) {
		counts.set(usage.offerId, (counts.get(usage.offerId) || 0) + usage.count);
	}
	return Array.from(counts, ([offerId, count]) => ({ offerId, count }));
};
