import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const normalizeStatus = (value: unknown): string => {
	const normalized = readString(value).toUpperCase();
	if (["SUCCESS", "COMPLETED", "PAID"].includes(normalized)) return "SUCCESS";
	if (["FAILED", "FAILURE", "DECLINED"].includes(normalized)) return "FAILED";
	if (["BILL", "REQUEST_FOR_PAYMENT", "PENDING_BILL"].includes(normalized)) return "BILL";
	if (["PENDING", "PENDING_COUNTER", "REQUESTED"].includes(normalized)) return "PENDING_COUNTER";
	return normalized || "PENDING_COUNTER";
};
const normalizePaymentMode = (value: unknown): string => {
	const normalized = readString(value).toUpperCase();
	if (!normalized) return "";
	if (normalized === "OTHER") return "OTHERS";
	const allowed = ["CASH", "CARD", "UPI", "DINEOUT", "MAGICPIN", "ZOMATO", "DISTRIC", "OTHERS"];
	return allowed.includes(normalized) ? normalized : "";
};
const readNumber = (value: unknown, fallback = 0): number => {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : fallback;
};

const computePricingFromItems = (items: unknown[]): { subtotal: number; discount: number; tax: number; total: number } => {
	const normalizedItems = Array.isArray(items) ? items : [];
	const subtotal = normalizedItems.reduce<number>((sum, rawItem) => {
		const item = (rawItem || {}) as Record<string, unknown>;
		const qty = Math.max(1, Math.floor(readNumber(item.qty ?? item.quantity, 1)));
		const unitPrice = readNumber(item.finalUnitPrice ?? item.price, 0);
		const explicitTotal = readNumber(item.totalPrice, NaN);
		return sum + (Number.isFinite(explicitTotal) ? explicitTotal : qty * unitPrice);
	}, 0);

	const discount = normalizedItems.reduce<number>((sum, rawItem) => {
		const item = (rawItem || {}) as Record<string, unknown>;
		return sum + readNumber(item.discount ?? item.discountAmount, 0);
	}, 0);

	const taxFromItems = normalizedItems.reduce<number>((sum, rawItem) => {
		const item = (rawItem || {}) as Record<string, unknown>;
		return sum + readNumber(item.tax, 0);
	}, 0);

	const discountedFromItems = normalizedItems.reduce<number>((sum, rawItem) => {
		const item = (rawItem || {}) as Record<string, unknown>;
		const explicitDiscounted = readNumber(item.discountedPrice, NaN);
		if (Number.isFinite(explicitDiscounted)) return sum + explicitDiscounted;
		const itemTotal = readNumber(item.totalPrice, 0);
		const itemDiscount = readNumber(item.discount ?? item.discountAmount, 0);
		return sum + Math.max(itemTotal - itemDiscount, 0);
	}, 0);

	const discountedPrice = Math.max(discountedFromItems, 0);
	const tax = Math.max(taxFromItems, 0);
	const total = discountedPrice + tax;
	return { subtotal, discount, tax, total };
};

const resolveCustomerId = (sessionData: Record<string, unknown>, orderData: Record<string, unknown> | null): string => {
	const sessionOpenedBy = sessionData?.openedBy as Record<string, unknown> | undefined;
	return readString(
		sessionOpenedBy?.uid ||
		orderData?.userId ||
		orderData?.customerId ||
		orderData?.ownerId ||
		orderData?.guestId ||
		sessionData?.customerId ||
		sessionData?.userId ||
		""
	);
};

export const closeSession = functions.https.onRequest(
	async (req: Request, res: Response): Promise<void> => {
		res.set("Access-Control-Allow-Origin", "*");
		res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
		res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

		if (req.method === "OPTIONS") { res.status(200).send(""); return; }

		try {
			if (req.method !== "POST") { res.status(405).json({ success: false, message: "Method not allowed" }); return; }

			const { sessionId, tableId, status, paymentMode } = req.body as { sessionId?: string; tableId?: string; status?: string; paymentMode?: string };
			if (!sessionId && !tableId) { res.status(400).json({ success: false, message: "sessionId or tableId is required" }); return; }

			const resolvedSessionId = readString(sessionId);
			const resolvedTableId = readString(tableId);
			const resolvedStatus = normalizeStatus(status);
			const resolvedPaymentMode = normalizePaymentMode(paymentMode);
			const isPaymentSuccessful = resolvedStatus === "SUCCESS";
			const isPaymentStatus = resolvedStatus === "SUCCESS" || resolvedStatus === "FAILED";
			if (isPaymentStatus && !resolvedPaymentMode) {
				res.status(400).json({ success: false, message: "paymentMode is required when marking payment status" });
				return;
			}

			let outletId = readString((req.body as any).outletId);
			let sessionSnap = null;
			let sessionRef = null;

			if (resolvedSessionId) {
				const sessionQuery = await db.collectionGroup("sessions").where("sessionId", "==", resolvedSessionId).limit(1).get();
				if (!sessionQuery.empty) {
					sessionSnap = sessionQuery.docs[0];
					sessionRef = sessionSnap.ref;
					if (!outletId) outletId = readString(sessionSnap.data()?.outletId);
				}
			}

			if (!outletId && resolvedTableId) {
				const tableQuery = await db.collectionGroup("tables").where("id", "==", resolvedTableId).limit(1).get();
				if (!tableQuery.empty) {
					outletId = readString(tableQuery.docs[0].data()?.outletId);
				}
			}

			if (!outletId) {
				res.status(400).json({ success: false, message: "outletId could not be resolved" });
				return;
			}

			const sessionData = sessionSnap?.data() || {};
			const resolvedSessionTableId = readString(sessionData?.tableId);
			const tableRef = db.collection("outlets").doc(outletId).collection("tables").doc(resolvedTableId || resolvedSessionTableId);
			
			const orderSnap = resolvedSessionId
				? await db.collection("outlets").doc(outletId).collection("orders").where("sessionId", "==", resolvedSessionId).get()
				: await db.collection("outlets").doc(outletId).collection("orders").where("tableId", "==", resolvedTableId).limit(50).get();
			
			const candidateOrderDocs = orderSnap.docs;
			const allItems: any[] = [];
			let primaryOrderDoc = candidateOrderDocs[0];

			for (const doc of candidateOrderDocs) {
				const data = doc.data();
				const docItems = Array.isArray(data.items) ? data.items : [];
				allItems.push(...docItems);
				if (!primaryOrderDoc) primaryOrderDoc = doc;
			}

			const pricing = computePricingFromItems(allItems);
			const customerId = resolveCustomerId(sessionData as Record<string, unknown>, primaryOrderDoc?.data() || null);

			await db.runTransaction(async (tx) => {
				const archiveTimestamp = FieldValue.serverTimestamp();

				if (resolvedStatus === "BILL") {
					if (sessionRef) {
						tx.update(sessionRef, {
							status: "BILL",
							updatedAt: archiveTimestamp,
						});
					}

					if (resolvedTableId || resolvedSessionTableId) {
						tx.update(tableRef, {
							status: "BILL",
							occupied: true,
							updatedAt: archiveTimestamp,
						});
					}

					return { status: "BILL", sessionStatus: "BILL" };
				}

				if (!isPaymentSuccessful) {
					const failedPaymentRef = db.collection("outlets").doc(outletId).collection("failedPayments").doc();
					tx.set(failedPaymentRef, {
						paymentId: failedPaymentRef.id,
						orderId: primaryOrderDoc?.id || null,
						outletId,
						tableId: resolvedTableId || resolvedSessionTableId || null,
						sessionId: resolvedSessionId || null,
						userId: customerId || null,
						pricing,
						items: allItems,
						status: "FAILED",
						settlementStatus: "FAILED",
						paymentMode: resolvedPaymentMode,
						payAt: "COUNTER",
						generatedAt: FieldValue.serverTimestamp(),
						updatedAt: FieldValue.serverTimestamp(),
					});

					for (const doc of candidateOrderDocs) {
						tx.set(db.collection("outlets").doc(outletId).collection("orderHistory").doc(doc.id), { ...doc.data(), closedAt: archiveTimestamp, archivedAt: archiveTimestamp, source: "admin.closeSession.failed" }, { merge: true });
						tx.delete(doc.ref);
					}

					if (sessionRef) {
						tx.update(sessionRef, {
							status: "CLOSED",
							closedAt: archiveTimestamp,
							updatedAt: archiveTimestamp,
							totalAmount: pricing.total,
						});
					}

					if (resolvedTableId || resolvedSessionTableId) {
						tx.update(tableRef, {
							status: "IDLE",
							occupied: false,
							activeSessionId: null,
							owner: null,
							participants: FieldValue.delete(),
							updatedAt: archiveTimestamp,
						});
					}

					return { status: resolvedStatus, sessionStatus: "CLOSED" };
				}

				const successPaymentRef = db.collection("outlets").doc(outletId).collection("successPayments").doc();
				tx.set(successPaymentRef, {
					paymentId: successPaymentRef.id,
					orderId: primaryOrderDoc?.id || null,
					outletId,
					tableId: resolvedTableId || null,
					sessionId: resolvedSessionId || null,
					userId: customerId || null,
					pricing,
					items: allItems,
					status: "SUCCESS",
					settlementStatus: "PAID",
					paymentMode: resolvedPaymentMode,
					payAt: "COUNTER",
					generatedAt: FieldValue.serverTimestamp(),
					updatedAt: FieldValue.serverTimestamp(),
				});

				for (const doc of candidateOrderDocs) {
					tx.set(db.collection("outlets").doc(outletId).collection("orderHistory").doc(doc.id), { ...doc.data(), closedAt: archiveTimestamp, archivedAt: archiveTimestamp, source: "admin.closeSession" }, { merge: true });
					tx.delete(doc.ref);
				}

				if (sessionRef) {
					tx.update(sessionRef, { status: "CLOSED", closedAt: archiveTimestamp, updatedAt: archiveTimestamp, totalAmount: pricing.total });
				}
				tx.update(tableRef, {
					occupied: false,
					activeSessionId: null,
					status: "IDLE",
					owner: null,
					participants: FieldValue.delete(),
					updatedAt: archiveTimestamp,
				});

				return { paymentId: successPaymentRef.id, status: "SUCCESS" };
			});

			if (!isPaymentSuccessful) {
				res.status(200).json({ success: true, message: `Session moved to BILL with status ${resolvedStatus.toLowerCase()}.` });
				return;
			}

			res.status(200).json({ success: true, message: "Session closed successfully" });
			return;
		} catch (error) {
			console.error("closeSession error:", error);
			res.status(500).json({ success: false, message: "Internal server error" });
			return;
		}
	}
);
