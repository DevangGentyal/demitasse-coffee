import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { Request, Response } from "express";
import {
	setCors,
	verifyAdminToken,
	parseDateInput,
	readString,
	readNumber,
	resolveLifecycleStatus,
	resolveRestaurantName,
	fetchDocById,
} from "./helpers";

const db = admin.firestore();

export const getCustomerReport = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
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

		let query: admin.firestore.Query;
		if (outletId) {
			query = db.collection("outlets").doc(outletId).collection("ordersHistory");
		} else {
			query = db.collectionGroup("ordersHistory");
		}
		if (startTimestamp) {
			query = query.where("archivedAt", ">=", startTimestamp);
		}
		if (endTimestamp) {
			query = query.where("archivedAt", "<=", endTimestamp);
		}

		const snap = await query.get();
		const orders = snap.docs.map((doc) => doc.data() as any);

		// Filter successful orders only and filter by outletId in-memory
		const successOrders = orders.filter((order) => {
			if (outletId && order.outletId !== outletId) return false;
			return resolveLifecycleStatus(order) === "success";
		});

		// Grouping key: customerPhone or customerId
		const customerMap = new Map<string, {
			name: string;
			phone: string;
			totalOrders: number;
			totalSpend: number;
			lastVisit: Date;
			outletsMap: Map<string, number>;
		}>();

		const outletsCache = new Map<string, any>();

		for (const order of successOrders) {
			const rawPhone = readString(order.customerPhone || order.customer?.customerPhone || order.customer?.phone || "");
			const rawId = readString(order.customerId || order.customer?.customerId || order.userId || order.ownerId || "");
			const name = readString(order.customerName || order.customer?.customerName || order.customer?.name || "Walk-in Customer");

			// Determine group key
			const key = rawPhone || rawId;
			if (!key) continue; // skip anonymous transactions without any identifiers

			const oId = readString(order.outletId || "unknown");
			if (!outletsCache.has(oId) && oId !== "unknown") {
				const outletDoc = await fetchDocById("outlets", oId);
				outletsCache.set(oId, outletDoc);
			}
			const outletData = outletsCache.get(oId) || null;
			const outletName = resolveRestaurantName(outletData, order);

			// Date parsing
			let dateObj = new Date();
			if (order.archivedAt) {
				const t = order.archivedAt as admin.firestore.Timestamp;
				dateObj = t.toDate();
			} else if (order.createdAt) {
				const t = order.createdAt as admin.firestore.Timestamp;
				dateObj = t.toDate();
			}

			const finalTotal = readNumber(order.pricing?.total || order.total || order.totalAmount, 0);

			const existing = customerMap.get(key) || {
				name: name !== "Walk-in Customer" ? name : "",
				phone: rawPhone,
				totalOrders: 0,
				totalSpend: 0,
				lastVisit: new Date(0),
				outletsMap: new Map<string, number>(),
			};

			if (name && name !== "Walk-in Customer" && !existing.name) {
				existing.name = name;
			}
			existing.totalOrders += 1;
			existing.totalSpend += finalTotal;
			if (dateObj > existing.lastVisit) {
				existing.lastVisit = dateObj;
			}

			const count = existing.outletsMap.get(outletName) || 0;
			existing.outletsMap.set(outletName, count + 1);

			customerMap.set(key, existing);
		}

		const rows = Array.from(customerMap.entries()).map(([key, data]) => {
			let favOutlet = "NA";
			let maxCount = 0;
			data.outletsMap.forEach((count, oName) => {
				if (count > maxCount) {
					maxCount = count;
					favOutlet = oName;
				}
			});

			return {
				customerName: data.name || "Guest Customer",
				phone: data.phone || "NA",
				totalOrders: data.totalOrders,
				totalSpend: Math.round(data.totalSpend * 100) / 100,
				avgOrderValue: Math.round((data.totalSpend / data.totalOrders) * 100) / 100,
				lastVisit: data.lastVisit.getTime() > 0
					? data.lastVisit.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
					: "NA",
				favOutlet,
			};
		}).sort((a, b) => b.totalSpend - a.totalSpend);

		let totalSpendAll = 0;
		let totalOrdersCount = 0;

		rows.forEach((row) => {
			totalSpendAll += row.totalSpend;
			totalOrdersCount += row.totalOrders;
		});

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
				totalCustomers: rows.length,
				totalOrders: totalOrdersCount,
				totalSpend: Math.round(totalSpendAll * 100) / 100,
				avgOrderValue: rows.length ? Math.round((totalSpendAll / totalOrdersCount) * 100) / 100 : 0,
			},
			columns: [
				{ header: "Customer Name", key: "customerName" },
				{ header: "Phone Number", key: "phone" },
				{ header: "Total Orders", key: "totalOrders" },
				{ header: "Total Spend", key: "totalSpend" },
				{ header: "Avg Order Value", key: "avgOrderValue" },
				{ header: "Last Visit", key: "lastVisit" },
				{ header: "Favourite Outlet", key: "favOutlet" },
			],
			rows,
		});
	} catch (error) {
		console.error("getCustomerReport error:", error);
		res.status(500).json({ success: false, message: "Internal server error", error: String(error) });
	}
});
