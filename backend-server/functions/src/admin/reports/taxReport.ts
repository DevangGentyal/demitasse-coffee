import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {Request, Response} from "express";
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

export const getTaxReport = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).send(""); return;
  }
  if (req.method !== "GET") {
    res.status(405).json({success: false, message: "Method not allowed"}); return;
  }

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

    // Grouping key: `${hsn}__${productName}__${taxPercent}__${outletId}`
    const groupMap = new Map<string, {
			hsn: string;
			productName: string;
			taxPercent: number;
			taxAmount: number;
			outletName: string;
			invoices: Set<string>;
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

      const orderTax = readNumber(order.pricing?.tax, 0);
      const orderBaseTotal = orderSubtotal > 0 ? orderSubtotal : items.reduce((sum: number, item: any) => {
        const qty = readNumber(item.qty ?? item.quantity, 1) || 1;
        return sum + readNumber(item.totalPrice, readNumber(item.price, 0) * qty);
      }, 0);

      const invoiceNo = readString(order.invoiceNumber || order.invoiceNo || order.billNo || order.id);

      items.forEach((item: any) => {
        const hsn = readString(item.hsn || "NA");
        const productName = readString(item.name || "Unnamed Product");
        const taxPercent = readNumber(item.taxPercent ?? item.taxRate, 5); // Default to 5% if not present

        const qty = readNumber(item.qty ?? item.quantity, 1) || 1;
        const unitPrice = readNumber(item.price ?? item.finalUnitPrice ?? item.basePrice, 0);
        const lineSubTotal = readNumber(item.totalPrice, unitPrice * qty);

        const lineTax = orderTax > 0 ? distributeAmount(orderTax, lineSubTotal, orderBaseTotal) : 0;

        const mapKey = `${hsn}__${productName}__${taxPercent}__${oId}`;
        const existing = groupMap.get(mapKey) || {
          hsn,
          productName,
          taxPercent,
          taxAmount: 0,
          outletName,
          invoices: new Set<string>(),
        };

        existing.taxAmount += lineTax;
        if (invoiceNo) existing.invoices.add(invoiceNo);

        groupMap.set(mapKey, existing);
      });
    }

    const rows = Array.from(groupMap.values()).map((row) => ({
      hsn: row.hsn,
      product: row.productName,
      taxPercent: row.taxPercent,
      taxAmount: Math.round(row.taxAmount * 100) / 100,
      outlet: row.outletName,
      invoiceCount: row.invoices.size,
    })).sort((a, b) => a.hsn.localeCompare(b.hsn) || b.taxAmount - a.taxAmount);

    let totalTax = 0;
    let totalInvoiceCount = 0;

    rows.forEach((row) => {
      totalTax += row.taxAmount;
      totalInvoiceCount += row.invoiceCount;
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
        totalTax: Math.round(totalTax * 100) / 100,
        totalInvoices: totalInvoiceCount,
      },
      columns: [
        {header: "HSN Code", key: "hsn"},
        {header: "Product", key: "product"},
        {header: "Tax Rate (%)", key: "taxPercent"},
        {header: "Tax Amount", key: "taxAmount"},
        {header: "Outlet", key: "outlet"},
        {header: "Invoices Count", key: "invoiceCount"},
      ],
      rows,
    });
  } catch (error) {
    console.error("getTaxReport error:", error);
    res.status(500).json({success: false, message: "Internal server error", error: String(error)});
  }
});
