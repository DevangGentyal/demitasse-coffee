import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const db = admin.firestore();

export interface PrinterConfig {
	id?: string;
	printerName: string;
	role: string;
	assignedCategories: string[];
	enabled: boolean;
	createdAt?: any;
	updatedAt?: any;
}

export const billingPrinterConfigCreate = onCall(
	{ enforceAppCheck: false, cors: true },
	async (request) => {
		const { outletId, printerConfig } = request.data;

		if (!request.auth || !request.auth.uid) {
			throw new HttpsError("unauthenticated", "User must be authenticated");
		}

		if (!outletId) {
			throw new HttpsError("invalid-argument", "Outlet ID is required");
		}

		if (!printerConfig || !printerConfig.printerName || !printerConfig.role) {
			throw new HttpsError(
				"invalid-argument",
				"Printer name and role are required"
			);
		}

		try {
			const docRef = db
				.collection("outlets")
				.doc(outletId)
				.collection("printerSettings")
				.doc();

			const data: PrinterConfig = {
				...printerConfig,
				id: docRef.id,
				enabled: printerConfig.enabled ?? true,
				createdAt: admin.firestore.FieldValue.serverTimestamp(),
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			};

			await docRef.set(data);

			return {
				success: true,
				message: "Printer config created",
				data: {
					id: docRef.id,
					...data,
				},
			};
		} catch (error: any) {
			console.error("[billingPrinterConfigCreate] Error:", error);
			throw new HttpsError("internal", "Failed to create printer config");
		}
	}
);

export const billingPrinterConfigUpdate = onCall(
	{ enforceAppCheck: false, cors: true },
	async (request) => {
		const { printerId, updates, outletId: inputOutletId } = request.data;

		if (!request.auth || !request.auth.uid) {
			throw new HttpsError("unauthenticated", "User must be authenticated");
		}

		if (!printerId || !updates) {
			throw new HttpsError(
				"invalid-argument",
				"Printer ID and updates are required"
			);
		}

		try {
			let docRef = null;
			const outletId = inputOutletId || "";
			if (outletId) {
				docRef = db.collection("outlets").doc(outletId).collection("printerSettings").doc(printerId);
			} else {
				const querySnap = await db.collectionGroup("printerSettings").where("id", "==", printerId).limit(1).get();
				if (!querySnap.empty) {
					docRef = querySnap.docs[0].ref;
				}
			}

			if (!docRef) {
				throw new HttpsError("not-found", "Printer config not found");
			}

			const updateData = {
				...updates,
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			};

			await docRef.set(updateData, { merge: true });

			return {
				success: true,
				message: "Printer config updated",
				data: {
					id: printerId,
					...updateData,
				},
			};
		} catch (error: any) {
			console.error("[billingPrinterConfigUpdate] Error:", error);
			if (error instanceof HttpsError) throw error;
			throw new HttpsError("internal", "Failed to update printer config");
		}
	}
);

export const billingPrinterConfigDelete = onCall(
	{ enforceAppCheck: false, cors: true },
	async (request) => {
		const { printerId, outletId: inputOutletId } = request.data;

		if (!request.auth || !request.auth.uid) {
			throw new HttpsError("unauthenticated", "User must be authenticated");
		}

		if (!printerId) {
			throw new HttpsError("invalid-argument", "Printer ID is required");
		}

		try {
			let docRef = null;
			const outletId = inputOutletId || "";
			if (outletId) {
				docRef = db.collection("outlets").doc(outletId).collection("printerSettings").doc(printerId);
			} else {
				const querySnap = await db.collectionGroup("printerSettings").where("id", "==", printerId).limit(1).get();
				if (!querySnap.empty) {
					docRef = querySnap.docs[0].ref;
				}
			}

			if (!docRef) {
				throw new HttpsError("not-found", "Printer config not found");
			}

			await docRef.delete();

			return {
				success: true,
				message: "Printer config deleted",
			};
		} catch (error: any) {
			console.error("[billingPrinterConfigDelete] Error:", error);
			if (error instanceof HttpsError) throw error;
			throw new HttpsError("internal", "Failed to delete printer config");
		}
	}
);
