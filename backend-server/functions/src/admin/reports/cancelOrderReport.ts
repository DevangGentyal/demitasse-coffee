import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { Request, Response } from "express";
import {
	setCors,
	verifyAdminToken,
	parseDateInput,
	readString,
	readNumber,
} from "./helpers";

const db = admin.firestore();

export const getCancelOrderReport = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	setCors(res);
	if (req.method === "OPTIONS") { res.status(204).send(""); return; }
	if (req.method !== "GET") { res.status(405).json({ success: false, message: "Method not allowed" }); return; }

	const decodedToken = await verifyAdminToken(req, res);
	if (!decodedToken) return;

	try {
		const outletId = readString(req.query.outletId);
		const startDate = readString(req.query.startDate);
		const endDate = readString(req.query.endDate);

		const startTimestamp = parseDateInput(startDate, "start");
		const endTimestamp = parseDateInput(endDate, "end");

		// Fetch all outlets for friendly name lookup
		const outletsSnap = await db.collection("outlets").get();
		const outlets = outletsSnap.docs.map((doc) => ({
			id: doc.id,
			name: readString(doc.data().name || doc.id),
		}));

		// Build cancellation query
		let query: admin.firestore.Query = db.collection("OrderCancel");
		if (startTimestamp) {
			query = query.where("cancelledAt", ">=", startTimestamp);
		}
		if (endTimestamp) {
			query = query.where("cancelledAt", "<=", endTimestamp);
		}

		const snap = await query.get();
		const cancellations = snap.docs.map((doc) => {
			const data = doc.data();
			let dateObj = new Date();
			if (data.cancelledAt) {
				const t = data.cancelledAt as admin.firestore.Timestamp;
				dateObj = t.toDate();
			}
			return {
				id: doc.id,
				outletId: readString(data.outletId || "unknown"),
				totalOrdersCost: readNumber(data.totalOrdersCost || data.totalCost, 0),
				dateKey: dateObj.toISOString().slice(0, 10), // YYYY-MM-DD
				displayDate: dateObj.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
				reason: readString(data.closeReason || data.reason || "No reason given"),
			};
		}).filter((c) => !outletId || c.outletId === outletId);

		// Unique dates in the cancellation dataset, sorted descending
		const uniqueDates = Array.from(new Set(cancellations.map((c) => c.dateKey))).sort((a, b) => b.localeCompare(a));

		// Identify which outlets are represented in the filters or dataset
		const filteredOutlets = outletId 
			? outlets.filter((o) => o.id === outletId)
			: outlets;

		// 1. Columns structure
		const columns = [
			{ header: "Date", key: "date" },
			...filteredOutlets.map((o) => ({ header: o.name, key: o.id })),
		];

		// 2. Cancellation Quantity Matrix Rows
		const qtyRows: Record<string, any>[] = uniqueDates.map((dKey) => {
			const displayDate = new Date(`${dKey}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
			const row: Record<string, any> = { date: displayDate, _dateKey: dKey };
			filteredOutlets.forEach((o) => {
				row[o.id] = 0;
			});
			return row;
		});

		// 3. Cancellation Amount Matrix Rows
		const amtRows: Record<string, any>[] = uniqueDates.map((dKey) => {
			const displayDate = new Date(`${dKey}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
			const row: Record<string, any> = { date: displayDate, _dateKey: dKey };
			filteredOutlets.forEach((o) => {
				row[o.id] = 0;
			});
			return row;
		});

		// Populate Matrix values
		cancellations.forEach((c) => {
			const qtyRow = qtyRows.find((r) => r._dateKey === c.dateKey);
			if (qtyRow && qtyRow[c.outletId] !== undefined) {
				qtyRow[c.outletId] += 1;
			}

			const amtRow = amtRows.find((r) => r._dateKey === c.dateKey);
			if (amtRow && amtRow[c.outletId] !== undefined) {
				amtRow[c.outletId] = Math.round((amtRow[c.outletId] + c.totalOrdersCost) * 100) / 100;
			}
		});

		// Clean date keys used for sorting
		qtyRows.forEach((r) => delete r._dateKey);
		amtRows.forEach((r) => delete r._dateKey);

		// Calculate total cancellation counts/sums for summaries
		let totalCanceledCount = cancellations.length;
		let totalCanceledValue = cancellations.reduce((sum, c) => sum + c.totalOrdersCost, 0);

		res.status(200).json({
			success: true,
			metadata: {
				generatedAt: new Date().toISOString(),
			},
			filters: {
				outletId,
				startDate,
				endDate,
			},
			summary: {
				totalCanceledCount,
				totalCanceledValue: Math.round(totalCanceledValue * 100) / 100,
			},
			columns,
			rows: cancellations.map((c) => {
				const outlet = outlets.find((o) => o.id === c.outletId);
				return {
					id: c.id,
					date: c.displayDate,
					outlet: outlet ? outlet.name : c.outletId,
					amount: c.totalOrdersCost,
					reason: c.reason,
				};
			}),
			charts: {
				qtyMatrix: qtyRows,
				amtMatrix: amtRows,
			},
		});
	} catch (error) {
		console.error("getCancelOrderReport error:", error);
		res.status(500).json({ success: false, message: "Internal server error", error: String(error) });
	}
});
