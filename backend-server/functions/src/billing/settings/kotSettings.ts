import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const db = admin.firestore();

export interface KotBillingSettings {
	defaultPrinterRole?: string;
	autoReprint?: boolean;
	reprintDelay?: number;
	splitItemsPerTicket?: boolean;
	itemsPerTicket?: number;
	[key: string]: any;
}

export const billingKotSettingsSave = onCall(
	{ enforceAppCheck: false, cors: true },
	async (request) => {
		const { outletId, settings } = request.data;

		if (!request.auth || !request.auth.uid) {
			throw new HttpsError("unauthenticated", "User must be authenticated");
		}

		if (!outletId) {
			throw new HttpsError("invalid-argument", "Outlet ID is required");
		}

		if (!settings || typeof settings !== "object") {
			throw new HttpsError(
				"invalid-argument",
				"Settings object is required"
			);
		}

		try {
			const docRef = db
				.collection("outlets")
				.doc(outletId)
				.collection("kotBillingSettings")
				.doc("defaultSettings");

			const updateData: any = {
				...settings,
				outletId,
				updatedAt: admin.firestore.FieldValue.serverTimestamp(),
			};

			await docRef.set(updateData, { merge: true });

			return {
				success: true,
				message: "KOT billing settings saved",
				data: updateData,
			};
		} catch (error: any) {
			console.error("[billingKotSettingsSave] Error:", error);
			throw new HttpsError("internal", "Failed to save KOT settings");
		}
	}
);
