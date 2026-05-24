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

export const getDailySalesReport = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	setCors(res);
	if (req.method === "OPTIONS") { res.status(204).send(""); return; }
	if (req.method !== "GET") { res.status(405).json({ success: false, message: "Method not allowed" }); return; }

	const decodedToken = await verifyAdminToken(req, res);
	if (!decodedToken) return;

	try {
		const outletId = readString(req.query.outletId);
		const startDate = readString(req.query.startDate);
		const endDate = readString(req.query.endDate);
		const statusFilter = readString(req.query.status || "all"); // all, success, canceled

		const startTimestamp = parseDateInput(startDate, "start");
		const endTimestamp = parseDateInput(endDate, "end");

		let query: admin.firestore.Query = db.collection("ordersHistory");
		if (startTimestamp) {
			query = query.where("archivedAt", ">=", startTimestamp);
		}
		if (endTimestamp) {
			query = query.where("archivedAt", "<=", endTimestamp);
		}

		const snap = await query.get();
		const orders = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as any));

		// Filter in memory for outletId and status since firestore does not support complex inequality or status query with range without compound index.
		const filteredOrders = orders.filter((order) => {
			if (outletId && order.outletId !== outletId) return false;
			const lifecycle = resolveLifecycleStatus(order);
			if (statusFilter === "success" && lifecycle !== "success") return false;
			if (statusFilter === "canceled" && lifecycle !== "canceled") return false;
			return true;
		});

		// Grouping Map key: YYYY-MM-DD__outletId
		const groupMap = new Map<string, {
			date: string;
			outletId: string;
			restaurantName: string;
			invoices: Set<string>;
			grossAmount: number;
			discount: number;
			netSales: number;
			deliveryCharge: number;
			containerCharge: number;
			serviceCharge: number;
			tax: number;
			waivedOff: number;
			roundOff: number;
			finalAmount: number;
		}>();

		const outletsCache = new Map<string, any>();

		for (const order of filteredOrders) {
			const oId = readString(order.outletId || "unknown");

			if (!outletsCache.has(oId) && oId !== "unknown") {
				const outletDoc = await fetchDocById("outlets", oId);
				outletsCache.set(oId, outletDoc);
			}

			const outletData = outletsCache.get(oId) || null;
			const restaurantName = resolveRestaurantName(outletData, order);

			// Date formatting
			let dateObj = new Date();
			if (order.archivedAt) {
				const t = order.archivedAt as admin.firestore.Timestamp;
				dateObj = t.toDate();
			} else if (order.createdAt) {
				const t = order.createdAt as admin.firestore.Timestamp;
				dateObj = t.toDate();
			}
			const dateKey = dateObj.toISOString().slice(0, 10); // YYYY-MM-DD
			const displayDate = dateObj.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

			const mapKey = `${dateKey}__${oId}`;

			const invoiceNo = readString(order.invoiceNumber || order.invoiceNo || order.billNo || order.id);

			const subtotal = readNumber(order.pricing?.subtotal || order.subtotal || order.totalAmount, 0);
			const discount = readNumber(order.pricing?.discount || order.discount, 0);
			const tax = readNumber(order.pricing?.tax || order.tax, 0);
			const finalTotal = readNumber(order.pricing?.total || order.total || order.totalAmount, 0);

			const deliveryCharge = readNumber(order.deliveryCharge || order.pricing?.deliveryCharge, 0);
			const containerCharge = readNumber(order.containerCharge || order.pricing?.containerCharge, 0);
			const serviceCharge = readNumber(order.serviceCharge || order.pricing?.serviceCharge, 0);
			const waivedOff = readNumber(order.waivedOff || order.pricing?.waivedOff, 0);
			const roundOff = readNumber(order.roundOff || order.pricing?.roundOff, 0);

			const existing = groupMap.get(mapKey) || {
				date: displayDate,
				outletId: oId,
				restaurantName,
				invoices: new Set<string>(),
				grossAmount: 0,
				discount: 0,
				netSales: 0,
				deliveryCharge: 0,
				containerCharge: 0,
				serviceCharge: 0,
				tax: 0,
				waivedOff: 0,
				roundOff: 0,
				finalAmount: 0,
			};

			if (invoiceNo) existing.invoices.add(invoiceNo);
			existing.grossAmount += subtotal;
			existing.discount += discount;
			existing.netSales += (subtotal - discount);
			existing.deliveryCharge += deliveryCharge;
			existing.containerCharge += containerCharge;
			existing.serviceCharge += serviceCharge;
			existing.tax += tax;
			existing.waivedOff += waivedOff;
			existing.roundOff += roundOff;
			existing.finalAmount += finalTotal;

			groupMap.set(mapKey, existing);
		}

		const rows = Array.from(groupMap.values()).map((row) => ({
			restaurant: row.restaurantName,
			date: row.date,
			invoiceNos: Array.from(row.invoices).join(", "),
			totalBills: row.invoices.size,
			grossAmount: Math.round(row.grossAmount * 100) / 100,
			discount: Math.round(row.discount * 100) / 100,
			netSales: Math.round(row.netSales * 100) / 100,
			deliveryCharge: Math.round(row.deliveryCharge * 100) / 100,
			containerCharge: Math.round(row.containerCharge * 100) / 100,
			serviceCharge: Math.round(row.serviceCharge * 100) / 100,
			tax: Math.round(row.tax * 100) / 100,
			waivedOff: Math.round(row.waivedOff * 100) / 100,
			roundOff: Math.round(row.roundOff * 100) / 100,
			finalAmount: Math.round(row.finalAmount * 100) / 100,
		})).sort((a, b) => b.date.localeCompare(a.date) || a.restaurant.localeCompare(b.restaurant));

		// Summary Calculation
		let totalBills = 0;
		let grossSales = 0;
		let totalDiscount = 0;
		let totalNetSales = 0;
		let totalTax = 0;
		let finalTotal = 0;

		rows.forEach((row) => {
			totalBills += row.totalBills;
			grossSales += row.grossAmount;
			totalDiscount += row.discount;
			totalNetSales += row.netSales;
			totalTax += row.tax;
			finalTotal += row.finalAmount;
		});

		const finalAmounts = rows.map((r) => r.finalAmount);
		const summary = {
			totalInvoices: totalBills,
			grossSales: Math.round(grossSales * 100) / 100,
			discount: Math.round(totalDiscount * 100) / 100,
			netSales: Math.round(totalNetSales * 100) / 100,
			tax: Math.round(totalTax * 100) / 100,
			finalTotal: Math.round(finalTotal * 100) / 100,
			minBill: finalAmounts.length ? Math.min(...finalAmounts) : 0,
			maxBill: finalAmounts.length ? Math.max(...finalAmounts) : 0,
			avgBill: finalAmounts.length ? Math.round((finalTotal / finalAmounts.length) * 100) / 100 : 0,
		};

		res.status(200).json({
			success: true,
			metadata: {
				generatedAt: new Date().toISOString(),
			},
			filters: {
				outletId,
				startDate,
				endDate,
				status: statusFilter,
			},
			summary,
			columns: [
				{ header: "Restaurant", key: "restaurant" },
				{ header: "Date", key: "date" },
				{ header: "Total Invoices", key: "totalBills" },
				{ header: "Gross Amount", key: "grossAmount" },
				{ header: "Discount", key: "discount" },
				{ header: "Net Sales", key: "netSales" },
				{ header: "Delivery", key: "deliveryCharge" },
				{ header: "Container", key: "containerCharge" },
				{ header: "Service", key: "serviceCharge" },
				{ header: "Tax", key: "tax" },
				{ header: "Waived Off", key: "waivedOff" },
				{ header: "Round Off", key: "roundOff" },
				{ header: "Final Amount", key: "finalAmount" },
			],
			rows,
		});
	} catch (error) {
		console.error("getDailySalesReport error:", error);
		res.status(500).json({ success: false, message: "Internal server error", error: String(error) });
	}
});
