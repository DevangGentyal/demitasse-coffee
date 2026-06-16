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

		const outletsSnap = await db.collection("outletDetails").get();
		const allOrdersPromises = outletsSnap.docs.map(async (outletDoc) => {
			const ordersSnap = await db.collection("outlets").doc(outletDoc.id).collection("ordersHistory").get();
			return ordersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as any));
		});

		const ordersArrays = await Promise.all(allOrdersPromises);
		const orders = ordersArrays.flat();

		// Filter in memory for status and dates to respect fallbacks safely
		const filteredOrders = orders.filter((order) => {
			const lifecycle = resolveLifecycleStatus(order);
			if (statusFilter === "success" && lifecycle !== "success") return false;
			if (statusFilter === "canceled" && lifecycle !== "canceled") return false;

			let dateObj = new Date();
			if (order.archivedAt) {
				const t = order.archivedAt as admin.firestore.Timestamp;
				dateObj = t.toDate();
			} else if (order.createdAt) {
				const t = order.createdAt as admin.firestore.Timestamp;
				dateObj = t.toDate();
			}
			if (startTimestamp && dateObj < startTimestamp.toDate()) return false;
			if (endTimestamp && dateObj > endTimestamp.toDate()) return false;

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

		const invoiceTotalsMap = new Map<string, number>();
		const outletsCache = new Map<string, any>();
		outletsSnap.docs.forEach((doc) => {
			outletsCache.set(doc.id, doc.data());
		});

		for (const order of filteredOrders) {
			const oId = readString(order.outletId || "unknown");
			const outletData = outletsCache.get(oId) || null;
			const restaurantName = readString(outletData?.name) || resolveRestaurantName(outletData, order);

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

			// ── Gross Sales (subtotal before discount) ──────────────────────────
			// Path A (tableSessions/closeSession): pricing.subtotal (lowercase 't')
			// Path B (admin/closeSession → createOrder spread): top-level subTotal (camelCase 'T')
			const subtotal = readNumber(
				order.pricing?.subtotal ?? order.pricing?.subTotal ??
				order.subTotal ?? order.subtotal ?? order.itemTotal ?? 0,
				0
			);

			// ── Discount (offer-only) ────────────────────────────────────────────
			const discount = readNumber(
				order.pricing?.discount ?? order.discount ?? 0,
				0
			);

			// ── Tax ──────────────────────────────────────────────────────────────
			const tax = readNumber(
				order.pricing?.tax ?? order.tax ?? 0,
				0
			);

			// ── Final Amount (what customer pays) ────────────────────────────────
			// Path A: pricing.total
			// Path B: discountedPrice + tax  (discountedPrice = subTotal - discount)
			const discountedPrice = readNumber(order.pricing?.discountedPrice ?? order.discountedPrice, Math.max(subtotal - discount, 0));
			const calcTotal = discountedPrice + tax;
			const finalTotal = readNumber(
				order.pricing?.total ?? order.pricing?.grandTotal ??
				order.grandTotal ?? order.total ?? 0,
				0
			) || calcTotal;

			if (invoiceNo) {
				const current = invoiceTotalsMap.get(invoiceNo) || 0;
				invoiceTotalsMap.set(invoiceNo, current + finalTotal);
			}

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

		const invoiceTotals = Array.from(invoiceTotalsMap.values());
		const validInvoiceTotals = invoiceTotals.filter((t) => t > 0);
		const validInvoiceSum = validInvoiceTotals.reduce((sum, val) => sum + val, 0);

		const summary = {
			totalInvoices: totalBills,
			grossSales: Math.round(grossSales * 100) / 100,
			discount: Math.round(totalDiscount * 100) / 100,
			netSales: Math.round(totalNetSales * 100) / 100,
			tax: Math.round(totalTax * 100) / 100,
			finalTotal: Math.round(finalTotal * 100) / 100,
			minBill: validInvoiceTotals.length ? Math.min(...validInvoiceTotals) : 0,
			maxBill: validInvoiceTotals.length ? Math.max(...validInvoiceTotals) : 0,
			avgBill: validInvoiceTotals.length > 0 ? Math.round((validInvoiceSum / validInvoiceTotals.length) * 100) / 100 : 0,
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
