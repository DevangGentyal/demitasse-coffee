import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { Request, Response } from "express";

const db = admin.firestore();

type ReportStatusFilter = "success" | "canceled" | "all";

interface ReportFilters {
	outletId?: string;
	startDate?: string;
	endDate?: string;
}

interface ReportRow {
	restaurant: string;
	date: string;
	timestamp: string;
	invoiceNo: string;
	paymentType: string;
	orderType: string;
	itemName: string;
	price: number;
	qty: number;
	subTotal: number;
	discount: number;
	tax: number;
	finalTotal: number;
	status: string;
	tableNo: string;
	area: string;
	serverName: string;
	covers: number;
	variation: string;
	category: string;
	groupName: string;
	hsn: string;
	sapCode: string;
	phone: string;
	name: string;
	address: string;
	gst: string;
	assignTo: string;
	orderId: string;
}

interface GroupSummary {
	groupName: string;
	totalItems: number;
	totalInvoices: number;
	grossSales: number;
	discount: number;
	tax: number;
	finalTotal: number;
}

interface ReportResponse {
	success: boolean;
	filters: {
		outletId: string;
		startDate: string;
		endDate: string;
		orderStatus: ReportStatusFilter;
	};
	outlet: { id: string; name: string } | null;
	summary: { totalInvoices: number; totalItems: number; grossSales: number; discount: number; tax: number; finalTotal: number };
	groupSummaries: GroupSummary[];
	rows: ReportRow[];
}

const setCors = (res: Response): void => {
	res.set("Access-Control-Allow-Origin", "*");
	res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
	res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
};
const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const readNumber = (value: unknown, fallback = 0): number => { const numeric = Number(value); return Number.isFinite(numeric) ? numeric : fallback; };
const toDateSafe = (value: unknown): Date | null => { if (!value) return null; if (value instanceof Date) return value; if (typeof (value as { toDate?: () => Date })?.toDate === "function") { try { return (value as { toDate: () => Date }).toDate(); } catch { return null; } } const parsed = new Date(String(value)); return Number.isNaN(parsed.getTime()) ? null : parsed; };
const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
const endOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
const parseDateInput = (value?: string, edge: "start" | "end" = "start"): Date | null => { if (!value) return null; const parsed = new Date(`${value}T00:00:00`); if (Number.isNaN(parsed.getTime())) return null; return edge === "start" ? startOfDay(parsed) : endOfDay(parsed); };
const resolveLifecycleStatus = (order: FirebaseFirestore.DocumentData): ReportStatusFilter => { const candidates = [order.status, order.orderStatus, order.orderLifecycleStatus, order.paymentStatus]; for (const candidate of candidates) { const status = readString(candidate).toLowerCase(); if (!status) continue; if (status.includes("cancel")) return "canceled"; if (status.includes("success") || status.includes("complete") || status.includes("close") || status.includes("final") || status.includes("paid")) return "success"; } return "success"; };
const resolveOrderTimestamp = (order: FirebaseFirestore.DocumentData): Date | null => toDateSafe(order.archivedAt) || toDateSafe(order.finalizedAt) || toDateSafe(order.closedAt) || toDateSafe(order.updatedAt) || toDateSafe(order.createdAt) || toDateSafe(order.timeOfOrder);
const resolveOutletName = (outlet: FirebaseFirestore.DocumentData | null, outletId: string): string => readString(outlet?.name) || outletId || "All Outlets";
const resolveRestaurantName = (outlet: FirebaseFirestore.DocumentData | null, order: FirebaseFirestore.DocumentData): string => readString(order.restaurant) || readString(outlet?.name) || readString(order.outletName) || readString(order.outletId) || "Demitasse";
const resolveTableNo = (order: FirebaseFirestore.DocumentData): string => readString(order.tableId) || readString(order.tableNo) || readString(order.tableName) || "";
const resolveArea = (order: FirebaseFirestore.DocumentData): string => { const directArea = readString(order.area || order.section || order.floorArea); if (directArea) return directArea; const tableNo = resolveTableNo(order).toUpperCase(); if (tableNo.startsWith("OD")) return "Outdoor"; if (tableNo) return "Indoor"; return ""; };
const resolvePaymentType = (order: FirebaseFirestore.DocumentData, payment: FirebaseFirestore.DocumentData | null): string => readString(payment?.paymentType) || readString(payment?.paymentMethod) || readString(payment?.paymentMode) || readString(payment?.mode) || readString(payment?.payAt) || readString(order.paymentType) || readString(order.paymentMethod) || readString(order.paymentMode) || readString(order.payAt) || readString(order.settlementStatus) || "NA";
const resolveServerName = (order: FirebaseFirestore.DocumentData): string => readString(order.serverName) || readString(order.server) || readString(order.assignedTo) || readString(order.placedBy) || "biller";
const resolveCustomerField = (order: FirebaseFirestore.DocumentData, key: string): string => { const customer = order.customer || {}; return readString(order[key]) || readString(customer[key]) || "NA"; };
const cleanCategory = (val: string): string => {
	const cleaned = val.trim();
	if (!cleaned || cleaned.toLowerCase() === "unknown" || cleaned.toLowerCase() === "uncategorized") {
		return "";
	}
	return cleaned;
};

const resolveItemGroup = (item: FirebaseFirestore.DocumentData, productsCache: Map<string, any>): string => {
	const pId = readString(item.productId || item.id);
	const cached = pId ? productsCache.get(pId) : null;
	const candidates = [
		cached?.groupName,
		cached?.category,
		item.groupName,
		item.category,
		item.subcategory
	];
	for (const cand of candidates) {
		const cleaned = cleanCategory(readString(cand));
		if (cleaned) return cleaned;
	}
	return "Uncategorized";
};

const resolveItemCategory = (item: FirebaseFirestore.DocumentData, productsCache: Map<string, any>): string => {
	const pId = readString(item.productId || item.id);
	const cached = pId ? productsCache.get(pId) : null;
	const candidates = [
		cached?.category,
		cached?.subcategory,
		item.category,
		item.subcategory
	];
	for (const cand of candidates) {
		const cleaned = cleanCategory(readString(cand));
		if (cleaned) return cleaned;
	}
	return resolveItemGroup(item, productsCache);
};

const resolveVariation = (item: FirebaseFirestore.DocumentData): string => { const directVariation = readString(item.variation); if (directVariation) return directVariation; if (Array.isArray(item.variations) && item.variations.length > 0) { const first = item.variations[0] || {}; return readString(first.name) || readString(first.option) || readString(first.type) || readString(first.value); } return ""; };
const resolveInvoiceNo = (order: FirebaseFirestore.DocumentData, fallbackIndex: number): string => readString(order.invoiceNo) || readString(order.billNo) || readString(order.invoiceNumber) || readString(order.orderNo) || readString(order.referenceNo) || readString(order.invoiceId) || readString(order.billId) || readString(order.id) || String(fallbackIndex);
const distributeAmount = (target: number, base: number, total: number): number => { if (!Number.isFinite(target) || !Number.isFinite(base) || !Number.isFinite(total) || base <= 0 || total <= 0) return 0; return Math.round((target * base / total) * 100) / 100; };
const fetchDocById = async (collectionName: string, id: string): Promise<FirebaseFirestore.DocumentData | null> => { const resolvedId = readString(id); if (!resolvedId) return null; const snapshot = await db.collection(collectionName).doc(resolvedId).get(); return snapshot.exists ? snapshot.data() || null : null; };

const getItemInvoiceDetailsReportData = async (filters: ReportFilters): Promise<ReportResponse> => {
	const outletId = readString(filters.outletId);
	const startDate = parseDateInput(filters.startDate, "start");
	const endDate = parseDateInput(filters.endDate, "end");

	// Fetch all products for category mapping
	const productsSnap = await db.collection("products").get();
	const productsCache = new Map<string, any>();
	productsSnap.docs.forEach((doc) => {
		productsCache.set(doc.id, doc.data());
	});

	let ordersQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = db.collection("ordersHistory");
	if (outletId) ordersQuery = ordersQuery.where("outletId", "==", outletId);

	const ordersSnap = await ordersQuery.get();
	const orderDocs = ordersSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} }));
	const filteredOrders = orderDocs.filter(({ data }) => {
		const statusGroup = resolveLifecycleStatus(data);
		if (statusGroup === "canceled") return false;
		const timestamp = resolveOrderTimestamp(data);
		if (!timestamp) return true;
		if (startDate && timestamp < startDate) return false;
		if (endDate && timestamp > endDate) return false;
		return true;
	});

	const currentOutlet = outletId ? await fetchDocById("outlets", outletId) : null;
	const rows: ReportRow[] = [];
	let totalInvoices = 0;
	let totalItems = 0;
	let grossSales = 0;
	let discount = 0;
	let tax = 0;
	let finalTotal = 0;

	filteredOrders.forEach(({ id, data }, orderIndex) => {
		const orderTimestamp = resolveOrderTimestamp(data) || new Date();
		const items = Array.isArray(data.items) ? data.items : [];
		const orderSubtotal = readNumber(data.pricing?.subtotal, items.reduce((sum, item) => { const qty = readNumber(item.qty ?? item.quantity, 1) || 1; const linePrice = readNumber(item.totalPrice, readNumber(item.price, 0) * qty); return sum + linePrice; }, 0));
		const orderDiscount = readNumber(data.pricing?.discount, 0);
		const orderTax = readNumber(data.pricing?.tax, 0);
		const rowInvoiceNo = resolveInvoiceNo(data, orderIndex + 1);
		const restaurant = resolveRestaurantName(currentOutlet, data);
		const paymentType = resolvePaymentType(data, null);
		const orderType = readString(data.orderType) || readString(data.deliveryType) || readString(data.placedBy) || "Dine In";
		const tableNo = resolveTableNo(data);
		const area = resolveArea(data);
		const serverName = resolveServerName(data);
		const covers = readNumber(data.covers || data.noOfCovers || data.guestCount, 0);
		const name = resolveCustomerField(data, "customerName");
		const phone = resolveCustomerField(data, "customerPhone");
		const address = resolveCustomerField(data, "address");
		const gst = resolveCustomerField(data, "gst");
		const assignTo = readString(data.assignTo) || readString(data.assignedTo) || readString(data.ownerId) || "";
		const statusGroup = resolveLifecycleStatus(data);
		const displayStatus = statusGroup === "canceled" ? "Canceled" : "Success";

		totalInvoices += 1;
		const orderBaseTotal = orderSubtotal > 0 ? orderSubtotal : items.reduce((sum, item) => { const qty = readNumber(item.qty ?? item.quantity, 1) || 1; const linePrice = readNumber(item.totalPrice, readNumber(item.price, 0) * qty); return sum + linePrice; }, 0);

		items.forEach((item, itemIndex) => {
			const qty = readNumber(item.qty ?? item.quantity, 1) || 1;
			const unitPrice = readNumber(item.price ?? item.finalUnitPrice ?? item.basePrice, 0);
			const lineSubTotal = readNumber(item.totalPrice, unitPrice * qty);
			const lineDiscount = orderDiscount > 0 ? distributeAmount(orderDiscount, lineSubTotal, orderBaseTotal) : 0;
			const lineTax = orderTax > 0 ? distributeAmount(orderTax, lineSubTotal, orderBaseTotal) : 0;
			const lineFinalTotal = Math.max(lineSubTotal - lineDiscount + lineTax, 0);
			const itemGroup = resolveItemGroup(item, productsCache);
			const itemCategory = resolveItemCategory(item, productsCache);

			totalItems += qty; grossSales += lineSubTotal; discount += lineDiscount; tax += lineTax; finalTotal += lineFinalTotal;
			rows.push({ restaurant, date: orderTimestamp.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }), timestamp: orderTimestamp.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }), invoiceNo: rowInvoiceNo, paymentType, orderType, itemName: readString(item.name) || `Item ${itemIndex + 1}`, price: unitPrice, qty, subTotal: lineSubTotal, discount: lineDiscount, tax: lineTax, finalTotal: lineFinalTotal, status: displayStatus, tableNo, area, serverName, covers, variation: resolveVariation(item), category: itemCategory, groupName: itemGroup, hsn: readString(item.hsn) || readString(data.hsn) || "", sapCode: readString(item.sapCode) || readString(data.sapCode) || "", phone, name, address, gst, assignTo, orderId: id });
		});
	});

	const groupMap = new Map<string, GroupSummary>();
	const invoiceGroupMap = new Map<string, Set<string>>();
	for (const row of rows) {
		const key = row.groupName || "Uncategorized";
		const existing = groupMap.get(key) || { groupName: key, totalItems: 0, totalInvoices: 0, grossSales: 0, discount: 0, tax: 0, finalTotal: 0 };
		existing.totalItems += row.qty; existing.grossSales += row.subTotal; existing.discount += row.discount; existing.tax += row.tax; existing.finalTotal += row.finalTotal; groupMap.set(key, existing);
		if (!invoiceGroupMap.has(key)) invoiceGroupMap.set(key, new Set());
		invoiceGroupMap.get(key)?.add(row.invoiceNo);
	}

	const groupSummaries = Array.from(groupMap.values()).map((group) => ({ ...group, totalInvoices: invoiceGroupMap.get(group.groupName)?.size || 0 })).sort((a, b) => b.totalItems - a.totalItems || a.groupName.localeCompare(b.groupName));
	rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp) || a.invoiceNo.localeCompare(b.invoiceNo) || a.itemName.localeCompare(b.itemName));

	return { success: true, filters: { outletId, startDate: filters.startDate || "", endDate: filters.endDate || "", orderStatus: "success" }, outlet: { id: outletId || "", name: resolveOutletName(currentOutlet, outletId) }, summary: { totalInvoices, totalItems, grossSales: Math.round(grossSales * 100) / 100, discount: Math.round(discount * 100) / 100, tax: Math.round(tax * 100) / 100, finalTotal: Math.round(finalTotal * 100) / 100 }, groupSummaries, rows };
};

export const getItemInvoiceDetailsReport = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	setCors(res);
	if (req.method === "OPTIONS") { res.status(204).send(""); return; }
	if (req.method !== "GET") { res.status(405).json({ success: false, message: "Method not allowed" }); return; }

	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith("Bearer ")) { res.status(401).json({ success: false, message: "Unauthorized: Missing token" }); return; }
	const token = authHeader.split("Bearer ")[1];
	try { await admin.auth().verifyIdToken(token); } catch { res.status(401).json({ success: false, message: "Unauthorized: Invalid token" }); return; }

	try {
		const filters: ReportFilters = { outletId: readString(req.query.outletId), startDate: readString(req.query.startDate), endDate: readString(req.query.endDate) };
		const report = await getItemInvoiceDetailsReportData(filters);
		res.status(200).json(report);
	} catch (error) {
		console.error("getItemInvoiceDetailsReport error:", error);
		res.status(500).json({ success: false, message: "Internal server error" });
	}
});
