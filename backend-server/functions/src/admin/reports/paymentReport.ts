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
  resolvePaymentType,
} from "./helpers";

const db = admin.firestore();

const standardizePaymentType = (type: string): string => {
  const lower = type.toLowerCase();
  if (lower.includes("cash")) return "Cash";
  if (lower.includes("card") || lower.includes("visa") || lower.includes("master") || lower.includes("credit") || lower.includes("debit")) return "Card";
  if (lower.includes("upi") || lower.includes("gpay") || lower.includes("phonepe") || lower.includes("paytm") || lower.includes("google") || lower.includes("bharat")) return "UPI";
  if (lower.includes("zomato")) return "Zomato Pay";
  if (lower.includes("swiggy")) return "Swiggy";
  if (lower === "na" || !lower) return "Other";
  return type.charAt(0).toUpperCase() + type.slice(1);
};

export const getPaymentReport = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
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

    // Grouping key: standardized payment type
    const paymentMap = new Map<string, {
			paymentType: string;
			ordersCount: number;
			grossAmount: number;
			refunds: number;
		}>();

    // Initialize default categories to guarantee they show up
    const defaultCategories = ["Cash", "Card", "UPI", "Zomato Pay", "Swiggy", "Other"];
    defaultCategories.forEach((cat) => {
      paymentMap.set(cat, {
        paymentType: cat,
        ordersCount: 0,
        grossAmount: 0,
        refunds: 0,
      });
    });

    for (const order of successOrders) {
      const rawType = resolvePaymentType(order);
      const paymentType = standardizePaymentType(rawType);

      const finalTotal = readNumber(order.pricing?.total || order.total || order.totalAmount, 0);
      const refund = readNumber(order.refundAmount || order.pricing?.refundAmount, 0);

      const existing = paymentMap.get(paymentType) || {
        paymentType,
        ordersCount: 0,
        grossAmount: 0,
        refunds: 0,
      };

      existing.ordersCount += 1;
      existing.grossAmount += finalTotal;
      existing.refunds += refund;

      paymentMap.set(paymentType, existing);
    }

    const rows = Array.from(paymentMap.values()).map((row) => ({
      paymentType: row.paymentType,
      ordersCount: row.ordersCount,
      grossAmount: Math.round(row.grossAmount * 100) / 100,
      refunds: Math.round(row.refunds * 100) / 100,
      netAmount: Math.round((row.grossAmount - row.refunds) * 100) / 100,
    })).sort((a, b) => b.netAmount - a.netAmount);

    let totalOrders = 0;
    let grossSales = 0;
    let totalRefunds = 0;
    let netRevenue = 0;

    rows.forEach((row) => {
      totalOrders += row.ordersCount;
      grossSales += row.grossAmount;
      totalRefunds += row.refunds;
      netRevenue += row.netAmount;
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
        totalOrders,
        grossSales: Math.round(grossSales * 100) / 100,
        refunds: Math.round(totalRefunds * 100) / 100,
        netSales: Math.round(netRevenue * 100) / 100,
      },
      columns: [
        {header: "Payment Type", key: "paymentType"},
        {header: "Orders Count", key: "ordersCount"},
        {header: "Gross Amount", key: "grossAmount"},
        {header: "Refunds", key: "refunds"},
        {header: "Net Amount", key: "netAmount"},
      ],
      rows,
    });
  } catch (error) {
    console.error("getPaymentReport error:", error);
    res.status(500).json({success: false, message: "Internal server error", error: String(error)});
  }
});
