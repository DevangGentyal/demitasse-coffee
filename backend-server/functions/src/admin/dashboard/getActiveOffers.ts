import * as admin from "firebase-admin";

const db = admin.firestore();

export const getActiveOffers = async (outletId: string): Promise<number> => {
	// Fetch all offers to support global offers (where outletId is empty/null/missing) and outlet-specific offers
	const snap = await db.collection("offers").get();
	const now = new Date();
	let activeOffersCount = 0;

	snap.docs.forEach((doc) => {
		const offer = doc.data();

		// 1. outletId filter: skip if offer has outletId and it does not match the selected outletId
		if (offer.outletId && offer.outletId !== outletId) return;

		// 2. isActive == true
		if (offer.isActive !== true) return;

		let start: Date | null = null;
		let end: Date | null = null;

		if (offer.startDate) {
			const d = typeof offer.startDate.toDate === "function" ? offer.startDate.toDate() : new Date(offer.startDate);
			if (d instanceof Date && !isNaN(d.getTime())) {
				start = d;
			}
		}
		if (offer.endDate) {
			const d = typeof offer.endDate.toDate === "function" ? offer.endDate.toDate() : new Date(offer.endDate);
			if (d instanceof Date && !isNaN(d.getTime())) {
				end = d;
			}
		}

		// 3. Date check: only restrict if dates are actually set
		if (start && now < start) return;
		if (end && now > end) return;

		activeOffersCount++;
	});

	return activeOffersCount;
};
