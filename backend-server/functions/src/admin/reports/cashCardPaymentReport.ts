import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { Request, Response } from "express";
import {
	setCors,
	verifyAdminToken,
	readString,
	toDateSafe,
} from "./helpers";

const db = admin.firestore();

// ─── Date helpers ─────────────────────────────────────────────────────────────

const parseDateInputLocal = (value?: string, edge: "start" | "end" = "start"): Date | null => {
	if (!value) return null;
	const isoStr = edge === "start" ? `${value}T00:00:00.000+05:30` : `${value}T23:59:59.999+05:30`;
	const parsed = new Date(isoStr);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed;
};

// ─── Identical to itemInvoiceDetails.ts ───────────────────────────────────────

const resolveLifecycleStatus = (order: FirebaseFirestore.DocumentData): "success" | "canceled" => {
	const candidates = [order.status, order.orderStatus, order.orderLifecycleStatus];
	for (const candidate of candidates) {
		const status = readString(candidate).toLowerCase();
		if (!status) continue;
		if (status.includes("cancel")) return "canceled";
		if (
			status.includes("success") ||
			status.includes("complete") ||
			status.includes("close") ||
			status.includes("final") ||
			status.includes("paid")
		) return "success";
	}
	return "success";
};

const resolveOrderTimestamp = (order: FirebaseFirestore.DocumentData): Date | null =>
	toDateSafe(order.archivedAt) ||
	toDateSafe(order.finalizedAt) ||
	toDateSafe(order.closedAt) ||
	toDateSafe(order.updatedAt) ||
	toDateSafe(order.createdAt) ||
	toDateSafe(order.timeOfOrder);

const safeNumber = (value: unknown): number => {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
};

const distributeAmount = (target: number, base: number, total: number): number => {
	if (!Number.isFinite(target) || !Number.isFinite(base) || !Number.isFinite(total) || base <= 0 || total <= 0) return 0;
	return Math.round((target * base / total) * 100) / 100;
};

// ─── Calculate order final paid amount using IDENTICAL logic to itemInvoiceDetails.ts
// This is the only way to guarantee both reports produce the same totals.
// itemInvoiceDetails.ts sums lineFinalPaid per invoice line (proportional discount + tax).
// We do the exact same here so both reports agree on every order.

const calcOrderFinalPaidAmount = (order: FirebaseFirestore.DocumentData): number => {
	const items: any[] = Array.isArray(order.items) ? order.items : [];
	const orderDiscount = safeNumber(order.pricing?.discount || order.discount || order.discountAmount);
	const orderTax = safeNumber(order.pricing?.tax || order.tax || order.taxAmount);

	// 1. Group items into invoice lines (normal vs combo) — identical to itemInvoiceDetails.ts
	interface InvoiceLine { items: any[]; grossSales: number }
	const invoiceLines: InvoiceLine[] = [];
	const comboGroups = new Map<string, any[]>();

	items.forEach((item) => {
		const isCombo =
			item.isOfferItem === true || String(item.isOfferItem).toLowerCase() === "true" ||
			item.isCombo === true || String(item.isCombo).toLowerCase() === "true" ||
			!!item.offerId;
		if (isCombo) {
			const oId = String(item.offerId || "unknown_offer");
			if (!comboGroups.has(oId)) comboGroups.set(oId, []);
			comboGroups.get(oId)!.push(item);
		} else {
			invoiceLines.push({ items: [item], grossSales: 0 });
		}
	});
	comboGroups.forEach((children) => {
		invoiceLines.push({ items: children, grossSales: 0 });
	});

	// 2. Calculate gross sales per line — identical to itemInvoiceDetails.ts
	let orderBaseGrossSales = 0;
	invoiceLines.forEach((line) => {
		let lineGross = 0;
		line.items.forEach((item) => {
			const qty = safeNumber(item.qty ?? item.quantity) || 1;
			const unitPrice = safeNumber(item.price ?? item.finalUnitPrice ?? item.basePrice);
			let itemGross = 0;
			if (item.pricing?.subtotal !== undefined && item.pricing?.subtotal !== null && Number.isFinite(Number(item.pricing.subtotal))) {
				itemGross = safeNumber(item.pricing.subtotal);
			} else if (item.totalPrice !== undefined && item.totalPrice !== null && Number.isFinite(Number(item.totalPrice))) {
				itemGross = safeNumber(item.totalPrice);
			} else {
				const addOnTotal = Array.isArray(item.addOns) ? item.addOns.reduce((s: number, a: any) => s + safeNumber(a.price ?? a.amount), 0) : 0;
				itemGross = safeNumber((unitPrice + addOnTotal) * qty);
			}
			lineGross += itemGross;
		});
		line.grossSales = safeNumber(lineGross);
		orderBaseGrossSales += lineGross;
	});

	// 3. Distribute discount + tax proportionally and sum lineFinalPaid — identical to itemInvoiceDetails.ts
	let accumulatedDiscount = 0;
	let accumulatedTax = 0;
	let finalPaidSum = 0;

	invoiceLines.forEach((line, index) => {
		const isLast = index === invoiceLines.length - 1;
		let lineDiscount = 0;
		let lineTax = 0;

		if (orderDiscount > 0) {
			if (isLast) {
				lineDiscount = Math.round((orderDiscount - accumulatedDiscount) * 100) / 100;
			} else {
				lineDiscount = distributeAmount(orderDiscount, line.grossSales, orderBaseGrossSales);
				accumulatedDiscount += lineDiscount;
			}
		}
		if (orderTax > 0) {
			if (isLast) {
				lineTax = Math.round((orderTax - accumulatedTax) * 100) / 100;
			} else {
				lineTax = distributeAmount(orderTax, line.grossSales, orderBaseGrossSales);
				accumulatedTax += lineTax;
			}
		}

		const lineNetSales = Math.round((line.grossSales - lineDiscount) * 100) / 100;
		const lineFinalPaid = Math.round((lineNetSales + lineTax) * 100) / 100;
		finalPaidSum += lineFinalPaid;
	});

	return Math.round(finalPaidSum * 100) / 100;
};

// ─── Payment mode resolution ──────────────────────────────────────────────────
// Priority:
//   order.paymentMode || order.paymentType || order.paymentMethod
//   → successPayments lookup by paymentId  (paymentMode → payAt)
//   → successPayments lookup by orderId    (paymentMode → payAt)
//   → order.payAt
//   → "UNKNOWN"

interface PaymentRecord {
	paymentMode?: string;
	paymentType?: string;
	paymentMethod?: string;
	payAt?: string;
	orderId?: string;
}

const resolvePaymentMode = (
	order: FirebaseFirestore.DocumentData,
	orderId: string,
	byPaymentId: Map<string, PaymentRecord>,
	byOrderId: Map<string, PaymentRecord>,
): string => {
	// 1. Direct order fields
	const direct = readString(order.paymentMode || order.paymentType || order.paymentMethod).trim();
	if (direct) return direct.toUpperCase();

	// 2. Lookup by paymentId (doc ID in successPayments)
	if (order.paymentId) {
		const rec = byPaymentId.get(String(order.paymentId));
		if (rec) {
			const mode = readString(rec.paymentMode || rec.paymentType || rec.paymentMethod).trim();
			if (mode) return mode.toUpperCase();
			const payAt = readString(rec.payAt).trim();
			if (payAt) return payAt.toUpperCase();
		}
	}

	// 3. Lookup by orderId
	const recByOrder = byOrderId.get(orderId);
	if (recByOrder) {
		const mode = readString(recByOrder.paymentMode || recByOrder.paymentType || recByOrder.paymentMethod).trim();
		if (mode) return mode.toUpperCase();
		const payAt = readString(recByOrder.payAt).trim();
		if (payAt) return payAt.toUpperCase();
	}

	// 4. order.payAt
	const orderPayAt = readString(order.payAt).trim();
	if (orderPayAt) return orderPayAt.toUpperCase();

	return "UNKNOWN";
};

// ─── Cloud Function ───────────────────────────────────────────────────────────

export const getCashCardPaymentReport = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	setCors(res);
	if (req.method === "OPTIONS") { res.status(204).send(""); return; }
	if (req.method !== "GET") { res.status(405).json({ success: false, message: "Method not allowed" }); return; }

	const decodedToken = await verifyAdminToken(req, res);
	if (!decodedToken) return;

	try {
		const outletId = readString(req.query.outletId);
		const startDateInput = readString(req.query.startDate);
		const endDateInput = readString(req.query.endDate);

		const startDate = parseDateInputLocal(startDateInput, "start");
		const endDate = parseDateInputLocal(endDateInput, "end");

		// ── Outlet names cache ────────────────────────────────────────────────
		const outletsSnap = await db.collection("outlets").get();
		const outletsCache = new Map<string, string>();
		outletsSnap.docs.forEach((doc) => {
			const d = doc.data();
			if (d?.name) outletsCache.set(doc.id, readString(d.name));
		});

		// ── successPayments cache (indexed by paymentId AND orderId) ──────────
		const paymentsSnap = await db.collection("successPayments").get();
		const byPaymentId = new Map<string, PaymentRecord>();
		const byOrderId = new Map<string, PaymentRecord>();
		paymentsSnap.docs.forEach((doc) => {
			const pData = doc.data() as PaymentRecord;
			byPaymentId.set(doc.id, pData);
			if (pData.orderId) byOrderId.set(String(pData.orderId), pData);
		});

		// ── Fetch ordersHistory ───────────────────────────────────────────────
		let query: admin.firestore.Query = db.collection("ordersHistory");
		if (outletId) query = query.where("outletId", "==", outletId);
		const snap = await query.get();

		// ── Filter: exact same logic as itemInvoiceDetails.ts ─────────────────
		const filteredOrders = snap.docs
			.map((doc) => ({ id: doc.id, data: doc.data() || {} }))
			.filter(({ data }) => {
				if (resolveLifecycleStatus(data) === "canceled") return false;
				const ts = resolveOrderTimestamp(data);
				if (!ts) return true;
				if (startDate && ts < startDate) return false;
				if (endDate && ts > endDate) return false;
				return true;
			});

		// ── Aggregate ─────────────────────────────────────────────────────────
		const paymentMap = new Map<string, { paymentMode: string; transactionsCount: number; amountCollected: number }>();
		let totalTransactions = 0;
		let totalCollection = 0;

		const transactions: {
			orderId: string;
			date: string;
			timestamp: string;
			outletName: string;
			paymentMode: string;
			amountPaid: number;
		}[] = [];

		for (const { id, data: order } of filteredOrders) {
			const paymentMode = resolvePaymentMode(order, id, byPaymentId, byOrderId);

			// Use IDENTICAL calculation to itemInvoiceDetails.ts so totals match exactly
			const amountPaid = calcOrderFinalPaidAmount(order);

			const orderTimestamp = resolveOrderTimestamp(order) || new Date();

			// Validation log — orderId | paymentMode | amountPaid
			console.log(`[PaymentModeReport] orderId=${id} | paymentMode=${paymentMode} | amountPaid=${amountPaid}`);

			totalTransactions += 1;
			totalCollection += amountPaid;

			if (!paymentMap.has(paymentMode)) {
				paymentMap.set(paymentMode, { paymentMode, transactionsCount: 0, amountCollected: 0 });
			}
			const existing = paymentMap.get(paymentMode)!;
			existing.transactionsCount += 1;
			existing.amountCollected += amountPaid;

			const outletName =
				outletsCache.get(readString(order.outletId)) ||
				readString(order.outletName) ||
				"Unknown Outlet";

			transactions.push({
				orderId: id,
				date: orderTimestamp.toLocaleDateString("en-GB", {
					day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
				}),
				timestamp: orderTimestamp.toISOString(),
				outletName,
				paymentMode,
				amountPaid: Math.round(amountPaid * 100) / 100,
			});
		}

		// ── Sort & finalize ───────────────────────────────────────────────────
		transactions.sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.orderId.localeCompare(a.orderId));

		const paymentSummary = Array.from(paymentMap.values())
			.map((item) => ({
				paymentMode: item.paymentMode,
				transactionsCount: item.transactionsCount,
				amountCollected: Math.round(item.amountCollected * 100) / 100,
			}))
			.sort((a, b) => a.paymentMode.localeCompare(b.paymentMode));

		const totalPaymentSources = paymentSummary.length;
		const currentOutletName = outletId ? (outletsCache.get(outletId) || "Unknown Outlet") : "All Outlets";
		const roundedTotal = Math.round(totalCollection * 100) / 100;

		// Validation: sum(paymentSummary.amountCollected) must equal totalCollection
		const summarySum = Math.round(paymentSummary.reduce((acc, row) => acc + row.amountCollected, 0) * 100) / 100;
		console.log(`[PaymentModeReport] VALIDATION — totalTransactions=${totalTransactions} | totalCollection=${roundedTotal} | summarySum=${summarySum} | match=${summarySum === roundedTotal}`);

		res.status(200).json({
			success: true,
			filters: { outletId, startDate: startDateInput, endDate: endDateInput },
			outlet: { id: outletId, name: currentOutletName },
			summary: {
				totalTransactions,
				totalCollection: roundedTotal,
				totalPaymentSources,
			},
			paymentSummary,
			transactions,
		});
	} catch (error) {
		console.error("getCashCardPaymentReport error:", error);
		res.status(500).json({ success: false, message: "Internal server error", error: String(error) });
	}
});
