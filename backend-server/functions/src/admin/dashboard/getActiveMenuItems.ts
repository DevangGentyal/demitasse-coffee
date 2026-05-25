import * as admin from "firebase-admin";

const db = admin.firestore();

export const getActiveMenuItems = async (outletId: string): Promise<number> => {
	const snap = await db.collection("products").where("outletId", "==", outletId).get();
	let activeCount = 0;

	snap.docs.forEach((doc) => {
		const product = doc.data();
		const isAvailable = product.isAvailable !== false && product.available !== false;
		const isActive = product.isActive !== false && product.active !== false;
		const isVisible = product.visible !== false && product.hidden !== true;
		const isNotDeleted = product.deleted !== true && product.isDeleted !== true;

		if (isAvailable && isActive && isVisible && isNotDeleted) {
			activeCount++;
		}
	});

	return activeCount;
};
