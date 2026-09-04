import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { isOrderCancelled } from "../../shared/utilities/orders/orderStatus";

const db = admin.firestore();

const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const normalizeStatus = (value: unknown): string => {
  const normalized = readString(value).toUpperCase();
  if (["SUCCESS", "COMPLETED", "PAID"].includes(normalized)) return "SUCCESS";
  if (["FAILED", "FAILURE", "DECLINED"].includes(normalized)) return "FAILED";
  if (["BILL", "REQUEST_FOR_PAYMENT", "PENDING_BILL"].includes(normalized)) return "BILL";
  if (["PENDING", "PENDING_COUNTER", "REQUESTED"].includes(normalized)) return "PENDING_COUNTER";
  return normalized || "PENDING_COUNTER";
};
const normalizePaymentMode = (value: unknown): string => {
  const normalized = readString(value).toUpperCase();
  if (!normalized) return "";
  if (normalized === "OTHER") return "OTHERS";
  const allowed = ["CASH", "CARD", "UPI", "DINEOUT", "MAGICPIN", "ZOMATO", "DISTRIC", "OTHERS"];
  return allowed.includes(normalized) ? normalized : "";
};
const readNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

/**
 * Mark all non-cancelled items within an order's items array as 'completed'.
 * Items that are individually cancelled keep their status; all others are set to 'completed'.
 */
const markItemsCompleted = (items: unknown[]): unknown[] => {
  if (!Array.isArray(items)) return [];
  return items.map((rawItem) => {
    const item = (rawItem || {}) as Record<string, unknown>;
    const currentStatus = String(item.status || "").trim().toLowerCase();
    // Preserve cancelled items; mark everything else as completed
    if (currentStatus === "cancelled") return item;
    return { ...item, status: "completed" };
  });
};

const computePricingFromItems = (items: unknown[]): { subtotal: number; discount: number; tax: number; total: number } => {
  const normalizedItems = Array.isArray(items) ? items : [];
  const subtotal = normalizedItems.reduce<number>((sum, rawItem) => {
    const item = (rawItem || {}) as Record<string, unknown>;
    const qty = Math.max(1, Math.floor(readNumber(item.qty ?? item.quantity, 1)));
    const unitPrice = readNumber(item.finalUnitPrice ?? item.price, 0);
    const explicitTotal = readNumber(item.totalPrice, NaN);
    return sum + (Number.isFinite(explicitTotal) ? explicitTotal : qty * unitPrice);
  }, 0);

  const discount = normalizedItems.reduce<number>((sum, rawItem) => {
    const item = (rawItem || {}) as Record<string, unknown>;
    return sum + readNumber(item.discount ?? item.discountAmount, 0);
  }, 0);

  const taxFromItems = normalizedItems.reduce<number>((sum, rawItem) => {
    const item = (rawItem || {}) as Record<string, unknown>;
    return sum + readNumber(item.tax, 0);
  }, 0);

  const discountedFromItems = normalizedItems.reduce<number>((sum, rawItem) => {
    const item = (rawItem || {}) as Record<string, unknown>;
    const explicitDiscounted = readNumber(item.discountedPrice, NaN);
    if (Number.isFinite(explicitDiscounted)) return sum + explicitDiscounted;
    const itemTotal = readNumber(item.totalPrice, 0);
    const itemDiscount = readNumber(item.discount ?? item.discountAmount, 0);
    return sum + Math.max(itemTotal - itemDiscount, 0);
  }, 0);

  const discountedPrice = Math.max(discountedFromItems, 0);
  const tax = Math.max(taxFromItems, 0);
  const total = discountedPrice + tax;
  return { subtotal, discount, tax, total };
};

const resolveOrderTotals = (docData: Record<string, unknown>, isCancelled: boolean) => {
  let totalAmount = readNumber(
    docData.totalAmount ??
    (docData.pricing as Record<string, unknown> | undefined)?.discountedPrice ??
    docData.discountedPrice ??
    docData.itemTotal,
    NaN,
  );
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    const pricing = (docData.pricing || {}) as Record<string, unknown>;
    const sub = readNumber(docData.subTotal ?? pricing.subtotal ?? pricing.subTotal, 0);
    const disc = readNumber(docData.discount ?? pricing.discount, 0);
    totalAmount = sub - disc;
  }
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    const items = Array.isArray(docData.items) ? docData.items : [];
    let sub = 0;
    let disc = 0;
    for (const item of items) {
      const row = (item || {}) as Record<string, unknown>;
      const qty = Math.max(1, Math.floor(readNumber(row.qty ?? row.quantity, 1)));
      const unitPrice = readNumber(row.finalUnitPrice ?? row.price ?? row.unitPrice, 0);
      const explicitTotal = readNumber(row.totalPrice, NaN);
      sub += Number.isFinite(explicitTotal) ? explicitTotal : qty * unitPrice;
      disc += readNumber(row.discount ?? row.discountAmount, 0);
    }
    totalAmount = sub - disc;
  }
  const finalTotalAmount = Math.max(totalAmount, 0);
  const orderTax = isCancelled ? 0 : Math.round(finalTotalAmount * 0.05);
  const orderTotal = isCancelled ? 0 : finalTotalAmount + orderTax;
  return { finalTotalAmount, orderTax, orderTotal };
};

const buildArchivedOrderPayload = (
  docData: Record<string, unknown>,
  completedItems: unknown[],
  isCancelled: boolean,
  archiveTimestamp: FirebaseFirestore.FieldValue,
  settlement: {
    settlementStatus: string;
    paymentStatus: string;
    paymentMode?: string;
    source: string;
  },
) => {
  const { finalTotalAmount, orderTax, orderTotal } = resolveOrderTotals(docData, isCancelled);
  const pricing = (docData.pricing || {}) as Record<string, unknown>;

  return {
    ...docData,
    items: completedItems,
    status: isCancelled ? "cancelled" : "completed",
    orderLifecycleStatus: isCancelled ? "CANCELLED" : "COMPLETED",
    settlementStatus: settlement.settlementStatus,
    paymentStatus: settlement.paymentStatus,
    paymentMode: settlement.paymentMode || docData.paymentMode || null,
    payAt: "COUNTER",
    totalAmount: orderTotal,
    closedAt: archiveTimestamp,
    archivedAt: archiveTimestamp,
    source: settlement.source,
    tax: orderTax,
    pricing: {
      ...pricing,
      tax: orderTax,
      total: orderTotal,
      subtotal: pricing.subtotal ?? pricing.subTotal ?? docData.subTotal ?? 0,
      discount: pricing.discount ?? docData.discount ?? 0,
      discountedPrice: pricing.discountedPrice ?? docData.discountedPrice ?? finalTotalAmount,
    },
  };
};

export const closeSession = functions.https.onRequest(
  async (req: Request, res: Response): Promise<void> => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.status(200).send(""); return;
    }

    try {
      if (req.method !== "POST") {
        res.status(405).json({ success: false, message: "Method not allowed" }); return;
      }

      const {
        sessionId,
        tableId,
        status,
        paymentMode,
        customerName,
        customerPhone,
      } = req.body as {
        sessionId?: string;
        tableId?: string;
        status?: string;
        paymentMode?: string;
        customerName?: string;
        customerPhone?: string;
      };
      if (!sessionId && !tableId) {
        res.status(400).json({ success: false, message: "sessionId or tableId is required" }); return;
      }

      const resolvedSessionId = readString(sessionId);
      const resolvedTableId = readString(tableId);
      const resolvedStatus = normalizeStatus(status);
      const resolvedPaymentMode = normalizePaymentMode(paymentMode);
      const isPaymentSuccessful = resolvedStatus === "SUCCESS";
      if (isPaymentSuccessful && !resolvedPaymentMode) {
        res.status(400).json({ success: false, message: "paymentMode is required when marking payment as settled" });
        return;
      }

      const outletId = readString((req.body as any).outletId);
      let sessionSnap = null;
      let sessionRef = null;

      if (!outletId) {
        res.status(400).json({
          success: false,
          message: "outletId is required",
        });
        return;
      }

      if (resolvedSessionId) {
        sessionSnap = await db
          .collection("outlets")
          .doc(outletId)
          .collection("sessions")
          .doc(resolvedSessionId)
          .get();

        sessionRef = sessionSnap.ref;
      }


      const sessionData = sessionSnap?.data() || {};
      const resolvedSessionTableId = readString(sessionData?.tableId);
      const tableRef = db.collection("outlets").doc(outletId).collection("tables").doc(resolvedTableId || resolvedSessionTableId);

      const orderSnap = resolvedSessionId ?
        await db.collection("outlets").doc(outletId).collection("orders").where("sessionId", "==", resolvedSessionId).get() :
        await db.collection("outlets").doc(outletId).collection("orders").where("tableId", "==", resolvedTableId).limit(50).get();

      const candidateOrderDocs = orderSnap.docs;
      const allItems: any[] = [];

      for (const doc of candidateOrderDocs) {
        const data = doc.data();
        const docItems = Array.isArray(data.items) ? data.items : [];
        allItems.push(...docItems);
      }

      const pricing = computePricingFromItems(allItems);

      await db.runTransaction(async (tx) => {
        const archiveTimestamp = FieldValue.serverTimestamp();

        if (resolvedStatus === "BILL") {
          if (sessionRef) {
            tx.update(sessionRef, {
              status: "BILL",
              updatedAt: archiveTimestamp,
            });
          }

          if (resolvedTableId || resolvedSessionTableId) {
            tx.update(tableRef, {
              status: "BILL",
              occupied: true,
              updatedAt: archiveTimestamp,
            });
          }

          return { status: "BILL", sessionStatus: "BILL" };
        }

        if (!isPaymentSuccessful) {
          const settlement = {
            settlementStatus: "DUE",
            paymentStatus: "DUE",
            source: "admin.closeSession.due",
          };

          for (const doc of candidateOrderDocs) {
            const docData = doc.data();
            const isCancelled = isOrderCancelled(docData);
            const completedItems = markItemsCompleted(Array.isArray(docData.items) ? docData.items : []);
            const orderSettlement = isCancelled ?
              { settlementStatus: "CANCELLED", paymentStatus: "CANCELLED", source: settlement.source } :
              settlement;

            tx.set(
              db.collection("outlets").doc(outletId).collection("ordersHistory").doc(doc.id),
              {
                ...buildArchivedOrderPayload(
                  docData,
                  completedItems,
                  isCancelled,
                  archiveTimestamp,
                  orderSettlement,
                ),
                ...(isCancelled ? {} : {
                  customerName,
                  customerPhone,
                }),
              },
              { merge: true },
            );
            tx.delete(doc.ref);
          }

          if (sessionRef) {
            tx.update(sessionRef, {
              status: "CLOSED",
              closedAt: archiveTimestamp,
              updatedAt: archiveTimestamp,
              totalAmount: pricing.total,
            });
          }

          if (resolvedTableId || resolvedSessionTableId) {
            tx.update(tableRef, {
              status: "IDLE",
              occupied: false,
              activeSessionId: null,
              billAmount: 0,
              owner: null,
              participants: FieldValue.delete(),
              updatedAt: archiveTimestamp,
            });
          }

          return { status: resolvedStatus, sessionStatus: "CLOSED" };
        }

        const paidSettlement = {
          settlementStatus: "PAID",
          paymentStatus: "SUCCESS",
          paymentMode: resolvedPaymentMode,
          source: "admin.closeSession",
        };

        for (const doc of candidateOrderDocs) {
          const docData = doc.data();
          const isCancelled = isOrderCancelled(docData);
          const completedItems = markItemsCompleted(Array.isArray(docData.items) ? docData.items : []);
          const orderSettlement = isCancelled ?
            { settlementStatus: "CANCELLED", paymentStatus: "CANCELLED", source: paidSettlement.source } :
            paidSettlement;

          tx.set(
            db.collection("outlets").doc(outletId).collection("ordersHistory").doc(doc.id),
            buildArchivedOrderPayload(docData, completedItems, isCancelled, archiveTimestamp, orderSettlement),
            { merge: true },
          );
          tx.delete(doc.ref);
        }

        if (sessionRef) {
          tx.update(sessionRef, { status: "CLOSED", closedAt: archiveTimestamp, updatedAt: archiveTimestamp, totalAmount: pricing.total });
        }
        tx.update(tableRef, {
          occupied: false,
          activeSessionId: null,
          status: "IDLE",
          billAmount: 0,
          owner: null,
          participants: FieldValue.delete(),
          updatedAt: archiveTimestamp,
        });

        return { status: "SUCCESS" };
      });

      if (!isPaymentSuccessful) {
        res.status(200).json({ success: true, message: "Session closed. Payment marked as due." });
        return;
      }

      res.status(200).json({ success: true, message: "Session closed successfully" });
      return;
    } catch (error) {
      console.error("closeSession error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
      return;
    }
  }
);
