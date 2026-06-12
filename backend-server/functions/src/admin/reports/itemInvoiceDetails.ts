import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { Request, Response } from "express";
import { getOfferDocs, getProductDocs } from "../../shared/utilities/firestoreCatalog";
import { resolveOrderStatus } from "../../shared/utilities/orders/orderStatus";

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
	grossSales: number;
	discountAmount: number;
	taxAmount: number;
	netSales: number;
	finalPaidAmount: number;
	offerItems: string;
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
	category: string;
	totalItems: number;
	invoiceCount: number;
	grossSales: number;
	discount: number;
	netSales: number;
	tax: number;
	finalPaidAmount: number;
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
	summary: {
		totalInvoices: number;
		totalItems: number;
		grossSales: number;
		discount: number;
		netSales: number;
		tax: number;
		finalPaidAmount: number;
		finalTotal: number;
	};
	groupSummaries: GroupSummary[];
	rows: ReportRow[];
}

const setCors = (res: Response): void => {
	res.set("Access-Control-Allow-Origin", "*");
	res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
	res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
};
const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
// const readNumber = (value: unknown, fallback = 0): number => { const numeric = Number(value); return Number.isFinite(numeric) ? numeric : fallback; };
const toDateSafe = (value: unknown): Date | null => { if (!value) return null; if (value instanceof Date) return value; if (typeof (value as { toDate?: () => Date })?.toDate === "function") { try { return (value as { toDate: () => Date }).toDate(); } catch { return null; } } const parsed = new Date(String(value)); return Number.isNaN(parsed.getTime()) ? null : parsed; };
const parseDateInput = (value?: string, edge: "start" | "end" = "start"): Date | null => {
	if (!value) return null;
	const isoStr = edge === "start" ? `${value}T00:00:00.000+05:30` : `${value}T23:59:59.999+05:30`;
	const parsed = new Date(isoStr);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed;
};
const resolveLifecycleStatus = (order: FirebaseFirestore.DocumentData): ReportStatusFilter => { const status = resolveOrderStatus(order); if (status.includes("CANCEL")) return "canceled"; if (status.includes("SUCCESS") || status.includes("COMPLETE") || status.includes("CLOSE") || status.includes("FINAL") || status.includes("PAID")) return "success"; return "success"; };
const resolveOrderTimestamp = (order: FirebaseFirestore.DocumentData): Date | null => toDateSafe(order.archivedAt) || toDateSafe(order.finalizedAt) || toDateSafe(order.closedAt) || toDateSafe(order.updatedAt) || toDateSafe(order.createdAt) || toDateSafe(order.timeOfOrder);
const resolveOutletName = (outlet: FirebaseFirestore.DocumentData | null, outletId: string): string => readString(outlet?.name) || outletId || "All Outlets";
const resolveRestaurantName = (outlet: FirebaseFirestore.DocumentData | null, order: FirebaseFirestore.DocumentData): string => readString(order.restaurant) || readString(outlet?.name) || readString(order.outletName) || readString(order.outletId) || "Demitasse";
const resolveTableNo = (order: FirebaseFirestore.DocumentData): string => readString(order.tableId) || readString(order.tableNo) || readString(order.tableName) || "";
const resolveArea = (order: FirebaseFirestore.DocumentData): string => { const directArea = readString(order.area || order.section || order.floorArea); if (directArea) return directArea; const tableNo = resolveTableNo(order).toUpperCase(); if (tableNo.startsWith("OD")) return "Outdoor"; if (tableNo) return "Indoor"; return ""; };
// const resolvePaymentType = (order: FirebaseFirestore.DocumentData, payment: FirebaseFirestore.DocumentData | null): string => readString(payment?.paymentType) || readString(payment?.paymentMethod) || readString(payment?.paymentMode) || readString(payment?.mode) || readString(payment?.payAt) || readString(order.paymentType) || readString(order.paymentMethod) || readString(order.paymentMode) || readString(order.payAt) || readString(order.settlementStatus) || "NA";
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
const distributeAmount = (target: number, base: number, total: number): number => { if (!Number.isFinite(target) || !Number.isFinite(base) || !Number.isFinite(total) || base <= 0 || total <= 0) return 0; return Math.round((target * base / total) * 100) / 100; };
const fetchDocById = async (collectionName: string, id: string): Promise<FirebaseFirestore.DocumentData | null> => { const resolvedId = readString(id); if (!resolvedId) return null; const snapshot = await db.collection(collectionName).doc(resolvedId).get(); return snapshot.exists ? snapshot.data() || null : null; };

const safeNumber = (value: any): number => {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : 0;
};

const resolveItemPaymentType = (order: FirebaseFirestore.DocumentData, orderId: string, paymentsCache: Map<string, string>): string => {
	const directMode = readString(order.paymentMode || order.paymentType || order.paymentMethod || order.payAt);
	if (directMode) return directMode.toUpperCase();
	const cachedMode = paymentsCache.get(orderId);
	if (cachedMode) return cachedMode;
	return "UNKNOWN";
};

const getItemInvoiceDetailsReportData = async (filters: ReportFilters): Promise<ReportResponse> => {
	const outletId = readString(filters.outletId);
	const startDate = parseDateInput(filters.startDate, "start");
	const endDate = parseDateInput(filters.endDate, "end");

	// Fetch all successPayments for paymentMode lookup fallback
	const paymentsSnap = await db.collection("successPayments").get();
	const paymentsCache = new Map<string, string>();
	paymentsSnap.docs.forEach((doc) => {
		const pData = doc.data();
		if (pData && pData.orderId && pData.paymentMode) {
			paymentsCache.set(String(pData.orderId), readString(pData.paymentMode).toUpperCase());
		}
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
	const productIds = new Set<string>();
	const offerIds = new Set<string>();
	for (const { data } of filteredOrders) {
		for (const item of Array.isArray(data.items) ? data.items : []) {
			const productId = readString(item.productId || item.id);
			const offerId = readString(item.offerId);
			if (productId) productIds.add(productId);
			if (offerId) offerIds.add(offerId);
		}
	}
	const productDocs = await getProductDocs(productIds);
	const productsCache = new Map<string, any>();
	productDocs.forEach((doc) => {
		productsCache.set(doc.id, doc.data);
	});
	const offerDocs = await getOfferDocs(offerIds);
	const offersCache = new Map<string, any>();
	offerDocs.forEach((doc, id) => {
		offersCache.set(id, doc);
	});
	const rows: ReportRow[] = [];
	let totalInvoices = 0;
	let totalItems = 0;
	let grossSales = 0;
	let discount = 0;
	let tax = 0;
	let finalTotal = 0; // netSales total
	let finalPaidAmount = 0; // finalPaidAmount total

	const resolveInvoiceNo = (order: FirebaseFirestore.DocumentData, fallbackIndex: number): string => readString(order.invoiceNo) || readString(order.billNo) || readString(order.invoiceNumber) || readString(order.orderNo) || readString(order.referenceNo) || readString(order.invoiceId) || readString(order.billId) || readString(order.id) || String(fallbackIndex);

	filteredOrders.forEach(({ id, data }, orderIndex) => {
		const orderTimestamp = resolveOrderTimestamp(data) || new Date();
		const items = Array.isArray(data.items) ? data.items : [];
		const orderDiscount = safeNumber(data.pricing?.discount || data.discount || data.discountAmount);
		const orderTax = safeNumber(data.pricing?.tax || data.tax || data.taxAmount);
		const rowInvoiceNo = resolveInvoiceNo(data, orderIndex + 1);
		const restaurant = resolveRestaurantName(currentOutlet, data);
		const paymentType = resolveItemPaymentType(data, id, paymentsCache);
		const orderType = readString(data.orderType) || readString(data.deliveryType) || readString(data.placedBy) || "Dine In";
		const tableNo = resolveTableNo(data);
		const area = resolveArea(data);
		const serverName = resolveServerName(data);
		const covers = safeNumber(data.covers || data.noOfCovers || data.guestCount);
		const name = resolveCustomerField(data, "customerName");
		const phone = resolveCustomerField(data, "customerPhone");
		const address = resolveCustomerField(data, "address");
		const gst = resolveCustomerField(data, "gst");
		const assignTo = readString(data.assignTo) || readString(data.assignedTo) || readString(data.ownerId) || "";
		const statusGroup = resolveLifecycleStatus(data);
		const displayStatus = statusGroup === "canceled" ? "Canceled" : "Success";

		totalInvoices += 1;
		// 1. Organize items into logical invoice lines
		interface OrderInvoiceLine {
			type: 'normal' | 'combo';
			offerId?: string;
			items: any[];
			grossSales: number;
		}

		const invoiceLines: OrderInvoiceLine[] = [];
		const comboGroups = new Map<string, any[]>();

		items.forEach((item) => {
			const isCombo = item.isOfferItem === true || String(item.isOfferItem).toLowerCase() === 'true' ||
				item.isCombo === true || String(item.isCombo).toLowerCase() === 'true' ||
				!!item.offerId;
			if (isCombo) {
				// We append order ID to ensure combos from different orders don't merge, though this scope is per-order anyway
				const oId = String(item.offerId || "unknown_offer");
				if (!comboGroups.has(oId)) {
					comboGroups.set(oId, []);
				}
				comboGroups.get(oId)!.push(item);
			} else {
				invoiceLines.push({ type: 'normal', items: [item], grossSales: 0 });
			}
		});

		comboGroups.forEach((childItems, offerId) => {
			invoiceLines.push({ type: 'combo', offerId, items: childItems, grossSales: 0 });
		});

		// 2. Calculate Gross Sales for each line
		let orderBaseGrossSales = 0;
		invoiceLines.forEach(line => {
			let lineGross = 0;
			line.items.forEach(item => {
				const qty = safeNumber(item.qty ?? item.quantity) || 1;
				const unitPrice = safeNumber(item.price ?? item.finalUnitPrice ?? item.basePrice);
				
				let itemGross = 0;
				if (item.pricing?.subtotal !== undefined && item.pricing?.subtotal !== null && Number.isFinite(Number(item.pricing.subtotal))) {
					itemGross = safeNumber(item.pricing.subtotal);
				} else if (item.totalPrice !== undefined && item.totalPrice !== null && Number.isFinite(Number(item.totalPrice))) {
					itemGross = safeNumber(item.totalPrice);
				} else {
					const addOnTotal = Array.isArray(item.addOns) ? item.addOns.reduce((sum: number, a: any) => sum + safeNumber(a.price ?? a.amount), 0) : 0;
					itemGross = safeNumber((unitPrice + addOnTotal) * qty);
				}
				lineGross += itemGross;
			});
			line.grossSales = safeNumber(lineGross);
			orderBaseGrossSales += lineGross;
		});

		// 3. Distribute proportional discount and tax with delta correction
		let accumulatedDiscount = 0;
		let accumulatedTax = 0;

		invoiceLines.forEach((line, index) => {
			const isLast = index === invoiceLines.length - 1;
			let lineDiscount = 0;
			let lineTax = 0;

			// Proportional Discount
			if (orderDiscount > 0) {
				if (isLast) {
					lineDiscount = Math.round((orderDiscount - accumulatedDiscount) * 100) / 100;
				} else {
					lineDiscount = distributeAmount(orderDiscount, line.grossSales, orderBaseGrossSales);
					accumulatedDiscount += lineDiscount;
				}
			}

			// Proportional Tax
			if (orderTax > 0) {
				if (isLast) {
					lineTax = Math.round((orderTax - accumulatedTax) * 100) / 100;
				} else {
					lineTax = distributeAmount(orderTax, line.grossSales, orderBaseGrossSales);
					accumulatedTax += lineTax;
				}
			}

			// Calculations mapping exactly to formulas
			const lineNetSales = Math.round((line.grossSales - lineDiscount) * 100) / 100;
			const lineFinalPaid = Math.round((lineNetSales + lineTax) * 100) / 100;

			// Add to running totals for summary
			const lineQty = line.type === 'normal' ? (safeNumber(line.items[0].qty ?? line.items[0].quantity) || 1) : 1;
			totalItems += lineQty;
			grossSales += line.grossSales;
			discount += lineDiscount;
			tax += lineTax;
			finalTotal += lineNetSales;
			finalPaidAmount += lineFinalPaid;

			// Format itemName depending on type
			let itemName = "";
			let lineCategory = "Uncategorized";
			let lineGroup = "Uncategorized";
			let combinedHsn = "";
			let combinedSapCode = "";
			let variation = "";
			let unitPrice = line.grossSales; // Default for combo

			if (line.type === 'normal') {
				const item = line.items[0];
				itemName = readString(item.name) || "Unnamed Item";
				const nestedItems = Array.isArray(item.items) ? item.items : [];
				if (nestedItems.length > 0) {
					const subItemsList = nestedItems.map((subItem: any) => `* ${readString(subItem.name || subItem.title)}`).join("\n");
					itemName = `${itemName}\n${subItemsList}`;
				}
				lineCategory = resolveItemCategory(item, productsCache);
				lineGroup = resolveItemGroup(item, productsCache);
				combinedHsn = readString(item.hsn) || readString(data.hsn) || "";
				combinedSapCode = readString(item.sapCode) || readString(data.sapCode) || "";
				variation = resolveVariation(item);
				unitPrice = safeNumber(item.price ?? item.finalUnitPrice ?? item.basePrice);
			} else {
				// Combo formatting
				const offerDoc = line.offerId ? offersCache.get(line.offerId) : null;
				let offerTitle = offerDoc ? readString(offerDoc.title || offerDoc.name) : "";
				if (!offerTitle) {
					for (const child of line.items) {
						if (child.offerTitle) {
							offerTitle = readString(child.offerTitle);
							break;
						}
					}
				}
				if (!offerTitle) offerTitle = `Combo Offer (${line.offerId})`;

				const childNames = line.items.map((child) => {
					const addOnsList = Array.isArray(child.addOns) ? child.addOns : [];
					const addOnStr = addOnsList.map((a: any) => readString(a.name || a.title)).filter(Boolean).join(", ");
					const nameStr = readString(child.name || child.title || "Unnamed Item");
					return `• ${nameStr}${addOnStr ? ` (+ ${addOnStr})` : ""}`;
				}).join("\n");
				
				itemName = `${offerTitle}\n${childNames}`;
				lineCategory = "COMBO";
				lineGroup = "COMBO";
				combinedHsn = line.items.map(child => readString(child.hsn)).filter(Boolean).join(", ") || readString(data.hsn) || "";
				combinedSapCode = line.items.map(child => readString(child.sapCode)).filter(Boolean).join(", ") || readString(data.sapCode) || "";
				unitPrice = lineNetSales;
			}

			rows.push({
				restaurant,
				date: orderTimestamp.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }),
				timestamp: orderTimestamp.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" }),
				invoiceNo: rowInvoiceNo,
				paymentType,
				orderType,
				itemName,
				price: unitPrice,
				qty: lineQty,
				subTotal: line.grossSales,
				discount: lineDiscount,
				tax: lineTax,
				finalTotal: lineFinalPaid,
				grossSales: Math.round(line.grossSales * 100) / 100,
				discountAmount: Math.round(lineDiscount * 100) / 100,
				taxAmount: Math.round(lineTax * 100) / 100,
				netSales: lineNetSales,
				finalPaidAmount: lineFinalPaid,
				offerItems: "",
				status: displayStatus,
				tableNo,
				area,
				serverName,
				covers,
				variation,
				category: lineCategory,
				groupName: lineGroup,
				hsn: combinedHsn,
				sapCode: combinedSapCode,
				phone,
				name,
				address,
				gst,
				assignTo,
				orderId: id
			});
		});
	});

	const groupMap = new Map<string, {
		category: string;
		totalItems: number;
		grossSales: number;
		discount: number;
		netSales: number;
		tax: number;
		finalPaidAmount: number;
	}>();
	const invoiceGroupMap = new Map<string, Set<string>>();
	for (const row of rows) {
		const key = row.category || "Uncategorized";
		const existing = groupMap.get(key) || { category: key, totalItems: 0, grossSales: 0, discount: 0, netSales: 0, tax: 0, finalPaidAmount: 0 };
		existing.totalItems += safeNumber(row.qty);
		existing.grossSales += safeNumber(row.grossSales);
		existing.discount += safeNumber(row.discountAmount);
		existing.netSales += safeNumber(row.netSales);
		existing.tax += safeNumber(row.taxAmount);
		existing.finalPaidAmount += safeNumber(row.finalPaidAmount);
		groupMap.set(key, existing);
		
		if (!invoiceGroupMap.has(key)) invoiceGroupMap.set(key, new Set());
		invoiceGroupMap.get(key)?.add(row.invoiceNo);
	}

	const groupSummaries = Array.from(groupMap.values()).map((group) => {
		return {
			category: group.category,
			totalItems: group.totalItems,
			invoiceCount: invoiceGroupMap.get(group.category)?.size || 0,
			grossSales: Math.round(group.grossSales * 100) / 100,
			discount: Math.round(group.discount * 100) / 100,
			netSales: Math.round(group.netSales * 100) / 100,
			tax: Math.round(group.tax * 100) / 100,
			finalPaidAmount: Math.round(group.finalPaidAmount * 100) / 100,
			finalTotal: Math.round(group.netSales * 100) / 100 // compatibility
		};
	}).sort((a, b) => b.totalItems - a.totalItems || a.category.localeCompare(b.category));
	rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp) || a.invoiceNo.localeCompare(b.invoiceNo) || a.itemName.localeCompare(b.itemName));

	return {
		success: true,
		filters: { outletId, startDate: filters.startDate || "", endDate: filters.endDate || "", orderStatus: "success" },
		outlet: { id: outletId || "", name: resolveOutletName(currentOutlet, outletId) },
		summary: {
			totalInvoices,
			totalItems,
			grossSales: Math.round(grossSales * 100) / 100,
			discount: Math.round(discount * 100) / 100,
			tax: Math.round(tax * 100) / 100,
			netSales: Math.round(finalTotal * 100) / 100,
			finalTotal: Math.round(finalTotal * 100) / 100,
			finalPaidAmount: Math.round(finalPaidAmount * 100) / 100
		},
		groupSummaries,
		rows
	};
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
