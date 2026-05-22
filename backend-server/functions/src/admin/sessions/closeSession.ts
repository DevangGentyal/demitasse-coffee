import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const normalizePaymentStatus = (value: unknown): string => {
	const normalized = readString(value).toUpperCase();
	if (["SUCCESS", "COMPLETED", "PAID"].includes(normalized)) return "SUCCESS";
	if (["FAILED", "FAILURE", "DECLINED"].includes(normalized)) return "FAILED";
	if (["BILL", "REQUEST_FOR_PAYMENT", "PENDING_BILL"].includes(normalized)) return "BILL";
	if (["PENDING", "PENDING_COUNTER", "REQUESTED"].includes(normalized)) return "PENDING_COUNTER";
	return normalized || "PENDING_COUNTER";
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

	const discount = 0;
	const tax = subtotal * 0.05;
	const total = subtotal - discount + tax;
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

			const { sessionId, tableId, paymentStatus } = req.body as { sessionId?: string; tableId?: string; paymentStatus?: string };
			if (!sessionId && !tableId) { res.status(400).json({ success: false, message: "sessionId or tableId is required" }); return; }

			const resolvedSessionId = readString(sessionId);
			const resolvedTableId = readString(tableId);
			const resolvedPaymentStatus = normalizePaymentStatus(paymentStatus);
			const isPaymentSuccessful = resolvedPaymentStatus === "SUCCESS";
			const sessionRef = resolvedSessionId ? db.collection("sessions").doc(resolvedSessionId) : null;
			const sessionSnap = sessionRef ? await sessionRef.get() : null;

			const sessionData = sessionSnap?.data() || {};
			const resolvedSessionTableId = readString(sessionData?.tableId);
			const tableRef = db.collection("tables").doc(resolvedTableId || resolvedSessionTableId);
			const orderSnap = resolvedSessionId
				? await db.collection("orders").where("sessionId", "==", resolvedSessionId).get()
				: await db.collection("orders").where("tableId", "==", resolvedTableId).limit(50).get();
			const candidateOrderDocs = orderSnap.docs;
			const allItems: any[] = [];
			let outletId = readString(sessionData?.outletId);
			let primaryOrderDoc = candidateOrderDocs[0];

			for (const doc of candidateOrderDocs) {
				const data = doc.data();
				if (!outletId) outletId = String(data.outletId || "");
				const docItems = Array.isArray(data.items) ? data.items : [];
				allItems.push(...docItems);
				if (!primaryOrderDoc) primaryOrderDoc = doc;
			}

			const pricing = computePricingFromItems(allItems);
			const customerId = resolveCustomerId(sessionData as Record<string, unknown>, primaryOrderDoc?.data() || null);

			await db.runTransaction(async (tx) => {
				const archiveTimestamp = FieldValue.serverTimestamp();

				if (resolvedPaymentStatus === "BILL") {
					if (sessionRef) {
						tx.update(sessionRef, {
							status: "BILL",
							paymentStatus: "BILL",
							updatedAt: archiveTimestamp,
						});
					}

					if (resolvedTableId || resolvedSessionTableId) {
						tx.update(tableRef, {
							status: "BILL",
							paymentStatus: "BILL",
							isOccupied: true,
							updatedAt: archiveTimestamp,
						});
					}

					return { paymentStatus: "BILL", sessionStatus: "BILL" };
				}

				if (!isPaymentSuccessful) {
					const failedPaymentRef = db.collection("failedPayments").doc();
					tx.set(failedPaymentRef, {
						paymentId: failedPaymentRef.id,
						orderId: primaryOrderDoc?.id || null,
						outletId,
						tableId: resolvedTableId || resolvedSessionTableId || null,
						sessionId: resolvedSessionId || null,
						userId: customerId || null,
						pricing,
						items: allItems,
						paymentStatus: "FAILED",
						settlementStatus: "FAILED",
						payAt: "COUNTER",
						generatedAt: FieldValue.serverTimestamp(),
						updatedAt: FieldValue.serverTimestamp(),
					});

					for (const doc of candidateOrderDocs) {
						tx.set(db.collection("ordersHistory").doc(doc.id), { ...doc.data(), closedAt: archiveTimestamp, archivedAt: archiveTimestamp, source: "admin.closeSession.failed" }, { merge: true });
						tx.delete(doc.ref);
					}

					if (sessionRef) {
						tx.update(sessionRef, {
							status: "CLOSED",
							paymentStatus: resolvedPaymentStatus,
							closedAt: archiveTimestamp,
							updatedAt: archiveTimestamp,
							totalAmount: pricing.total,
						});
					}

					if (resolvedTableId || resolvedSessionTableId) {
						tx.update(tableRef, {
							status: "IDLE",
							isOccupied: false,
							activeSessionId: null,
							paymentStatus: resolvedPaymentStatus,
							updatedAt: archiveTimestamp,
						});
					}

					return { paymentStatus: resolvedPaymentStatus, sessionStatus: "CLOSED" };
				}

				const successPaymentRef = db.collection("successPayments").doc();
				tx.set(successPaymentRef, {
					paymentId: successPaymentRef.id,
					orderId: primaryOrderDoc?.id || null,
					outletId,
					tableId: resolvedTableId || null,
					sessionId: resolvedSessionId || null,
					userId: customerId || null,
					pricing,
					items: allItems,
					paymentStatus: "SUCCESS",
					settlementStatus: "PAID",
					payAt: "COUNTER",
					generatedAt: FieldValue.serverTimestamp(),
					updatedAt: FieldValue.serverTimestamp(),
				});

				for (const doc of candidateOrderDocs) {
					tx.set(db.collection("ordersHistory").doc(doc.id), { ...doc.data(), closedAt: archiveTimestamp, archivedAt: archiveTimestamp, source: "admin.closeSession" }, { merge: true });
					tx.delete(doc.ref);
				}

				if (sessionRef) {
					tx.update(sessionRef, { status: "CLOSED", paymentStatus: "SUCCESS", closedAt: archiveTimestamp, updatedAt: archiveTimestamp, totalAmount: pricing.total });
				}
				tx.update(tableRef, { isOccupied: false, activeSessionId: null, status: "IDLE", paymentStatus: "SUCCESS", updatedAt: archiveTimestamp });

				return { paymentId: successPaymentRef.id };
			});

			if (!isPaymentSuccessful) {
				res.status(200).json({ success: true, message: `Session moved to BILL with payment status ${resolvedPaymentStatus.toLowerCase()}.` });
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
