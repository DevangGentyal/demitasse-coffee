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
	distributeAmount,
	fetchDocById,
} from "./helpers";

const db = admin.firestore();

export const getProductSalesReport = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
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

		let query: admin.firestore.Query = db.collection("ordersHistory");
		if (startTimestamp) {
			query = query.where("archivedAt", ">=", startTimestamp);
		}
		if (endTimestamp) {
			query = query.where("archivedAt", "<=", endTimestamp);
		}

		const snap = await query.get();
		const orders = snap.docs.map((doc) => doc.data() as any);

		// Fetch all products for category mapping
		const productsSnap = await db.collection("products").get();
		const productsCache = new Map<string, any>();
		productsSnap.docs.forEach((doc) => {
			productsCache.set(doc.id, doc.data());
		});

		const cleanCategory = (val: string): string => {
			const cleaned = val.trim();
			if (!cleaned || cleaned.toLowerCase() === "unknown" || cleaned.toLowerCase() === "uncategorized") {
				return "";
			}
			return cleaned;
		};

		// Filter successful orders only and filter by outletId in-memory
		const successOrders = orders.filter((order) => {
			if (outletId && order.outletId !== outletId) return false;
			return resolveLifecycleStatus(order) === "success";
		});

		// Grouping key: `${productName}__${outletId}`
		const groupMap = new Map<string, {
			productName: string;
			category: string;
			quantitySold: number;
			grossRevenue: number;
			discount: number;
			netRevenue: number;
			outletName: string;
			tax: number;
		}>();

		const outletsCache = new Map<string, any>();

		for (const order of successOrders) {
			const oId = readString(order.outletId || "unknown");

			if (!outletsCache.has(oId) && oId !== "unknown") {
				const outletDoc = await fetchDocById("outlets", oId);
				outletsCache.set(oId, outletDoc);
			}

			const outletData = outletsCache.get(oId) || null;
			const outletName = resolveRestaurantName(outletData, order);

			const items = Array.isArray(order.items) ? order.items : [];
			const orderSubtotal = readNumber(order.pricing?.subtotal, items.reduce((sum: number, item: any) => {
				const qty = readNumber(item.qty ?? item.quantity, 1) || 1;
				return sum + readNumber(item.totalPrice, readNumber(item.price, 0) * qty);
			}, 0));

			const orderDiscount = readNumber(order.pricing?.discount, 0);
			const orderTax = readNumber(order.pricing?.tax, 0);
			const orderBaseTotal = orderSubtotal > 0 ? orderSubtotal : items.reduce((sum: number, item: any) => {
				const qty = readNumber(item.qty ?? item.quantity, 1) || 1;
				return sum + readNumber(item.totalPrice, readNumber(item.price, 0) * qty);
			}, 0);

			items.forEach((item: any) => {
				const productName = readString(item.name || "Unnamed Product");
				
				const pId = readString(item.productId || item.id);
				const cached = pId ? productsCache.get(pId) : null;
				let category = cleanCategory(readString(cached?.category)) ||
					cleanCategory(readString(cached?.subcategory)) ||
					cleanCategory(readString(item.category)) ||
					cleanCategory(readString(item.groupName)) ||
					cleanCategory(readString(item.subcategory));

				if (!category) {
					category = "Uncategorized";
				}

				const qty = readNumber(item.qty ?? item.quantity, 1) || 1;
				const unitPrice = readNumber(item.price ?? item.finalUnitPrice ?? item.basePrice, 0);
				const lineSubTotal = readNumber(item.totalPrice, unitPrice * qty);

				const lineDiscount = orderDiscount > 0 ? distributeAmount(orderDiscount, lineSubTotal, orderBaseTotal) : 0;
				const lineTax = orderTax > 0 ? distributeAmount(orderTax, lineSubTotal, orderBaseTotal) : 0;

				const mapKey = `${productName}__${oId}`;
				const existing = groupMap.get(mapKey) || {
					productName,
					category,
					quantitySold: 0,
					grossRevenue: 0,
					discount: 0,
					netRevenue: 0,
					outletName,
					tax: 0,
				};

				existing.quantitySold += qty;
				existing.grossRevenue += lineSubTotal;
				existing.discount += lineDiscount;
				existing.netRevenue += (lineSubTotal - lineDiscount);
				existing.tax += lineTax;

				groupMap.set(mapKey, existing);
			});
		}

		const rows = Array.from(groupMap.values()).map((row) => ({
			productName: row.productName,
			category: row.category,
			quantitySold: row.quantitySold,
			grossRevenue: Math.round(row.grossRevenue * 100) / 100,
			discount: Math.round(row.discount * 100) / 100,
			netRevenue: Math.round(row.netRevenue * 100) / 100,
			outletName: row.outletName,
			tax: Math.round(row.tax * 100) / 100,
		})).sort((a, b) => b.quantitySold - a.quantitySold || a.productName.localeCompare(b.productName));

		let totalQty = 0;
		let totalGross = 0;
		let totalDiscount = 0;
		let totalNet = 0;
		let totalTax = 0;

		rows.forEach((row) => {
			totalQty += row.quantitySold;
			totalGross += row.grossRevenue;
			totalDiscount += row.discount;
			totalNet += row.netRevenue;
			totalTax += row.tax;
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
				totalItemsSold: totalQty,
				grossSales: Math.round(totalGross * 100) / 100,
				discount: Math.round(totalDiscount * 100) / 100,
				netSales: Math.round(totalNet * 100) / 100,
				tax: Math.round(totalTax * 100) / 100,
			},
			columns: [
				{ header: "Product Name", key: "productName" },
				{ header: "Category", key: "category" },
				{ header: "Quantity Sold", key: "quantitySold" },
				{ header: "Gross Revenue", key: "grossRevenue" },
				{ header: "Discount", key: "discount" },
				{ header: "Net Revenue", key: "netRevenue" },
				{ header: "Tax", key: "tax" },
				{ header: "Outlet", key: "outletName" },
			],
			rows,
		});
	} catch (error) {
		console.error("getProductSalesReport error:", error);
		res.status(500).json({ success: false, message: "Internal server error", error: String(error) });
	}
});
