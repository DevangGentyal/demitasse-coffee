import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const db = admin.firestore();
const { FieldValue } = admin.firestore;

export const billingUpdateTableState = onCall(
	{ enforceAppCheck: false, cors: true },
	async (request) => {
		const { tableId, updates, outletId: inputOutletId } = request.data;

		if (!request.auth || !request.auth.uid) {
			throw new HttpsError("unauthenticated", "User must be authenticated");
		}

		if (!tableId || !updates) {
			throw new HttpsError(
				"invalid-argument",
				"Table ID and updates are required"
			);
		}

		try {
			let tableRef = null;
			const outletId = inputOutletId || "";
			if (outletId) {
				tableRef = db.collection("outlets").doc(outletId).collection("tables").doc(tableId);
			} else {
				const querySnap = await db.collectionGroup("tables").where("id", "==", tableId).limit(1).get();
				if (!querySnap.empty) {
					tableRef = querySnap.docs[0].ref;
				}
			}

			if (!tableRef) {
				throw new HttpsError("not-found", "Table not found");
			}

			// Handle deletion of specific fields (like needsPaymentCollection)
			const updateData: any = {};
			Object.entries(updates).forEach(([key, value]) => {
				if (value === null) {
					// Use FieldValue.delete() to remove field
					updateData[key] = FieldValue.delete();
				} else {
					updateData[key] = value;
				}
			});

			updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

			await tableRef.set(updateData, { merge: true });

			return {
				success: true,
				message: "Table state updated",
				data: {
					tableId,
					...updateData,
				},
			};
		} catch (error: any) {
			console.error("[billingUpdateTableState] Error:", error);
			throw new HttpsError("internal", "Failed to update table state");
		}
	}
);
