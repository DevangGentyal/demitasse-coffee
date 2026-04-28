import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { calculateSubtotal } from "../utils/pricing";
import { applyTax } from "../utils/tax";
import { applyOffer } from "../utils/offers";

const db = admin.firestore();

interface OrderItem {
  productId: string;
  qty: number;
  totalPrice: number;
  finalUnitPrice?: number;
  createdBy?: string;
  name?: string;
  price?: number;
  quantity?: number;
}

const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const setCors = (res: Response): void => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

const readNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const sanitizeOrderItems = (rawItems: unknown[]): OrderItem[] => {
  if (!Array.isArray(rawItems)) return [];

  return rawItems.map((item) => {
    const data = (item || {}) as Record<string, unknown>;
    const qty = Math.max(1, Math.floor(readNumber(data.qty ?? data.quantity, 1)));
    const unitPrice = readNumber(data.finalUnitPrice ?? data.price, 0);
    const explicitTotal = readNumber(data.totalPrice, NaN);
    const createdBy = readString(data.createdBy);

    const normalizedItem: OrderItem = {
      productId: String(data.productId || data.id || ""),
      name: String(data.name || ""),
      qty,
      quantity: qty,
      finalUnitPrice: unitPrice,
      price: unitPrice,
      totalPrice: Number.isFinite(explicitTotal) ? explicitTotal : unitPrice * qty,
    };

    if (createdBy) {
      normalizedItem.createdBy = createdBy;
    }

    return normalizedItem;
  });
};

const resolveLatestOrderDoc = async (
  tx: FirebaseFirestore.Transaction,
  filters: { sessionId?: string; tableId?: string; ownerId?: string }
): Promise<FirebaseFirestore.QueryDocumentSnapshot | null> => {
  const { sessionId, tableId, ownerId } = filters;

  if (sessionId) {
    const sessionQuery = db.collection("orders").where("sessionId", "==", sessionId).limit(1);
    const sessionSnap = await tx.get(sessionQuery);
    if (!sessionSnap.empty) {
      return sessionSnap.docs[0];
    }
  }

  if (!tableId) {
    return null;
  }

  const tableQuery = db.collection("orders").where("tableId", "==", tableId).limit(20);
  const tableSnap = await tx.get(tableQuery);
  if (tableSnap.empty) return null;

  const candidates = tableSnap.docs.filter((doc) => {
    if (!ownerId) return true;
    const data = doc.data() || {};
    return readString(data.ownerId) === ownerId;
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aData = a.data() || {};
    const bData = b.data() || {};
    const aTime = readNumber((aData.updatedAt as { toMillis?: () => number })?.toMillis?.(), 0)
      || readNumber((aData.createdAt as { toMillis?: () => number })?.toMillis?.(), 0);
    const bTime = readNumber((bData.updatedAt as { toMillis?: () => number })?.toMillis?.(), 0)
      || readNumber((bData.createdAt as { toMillis?: () => number })?.toMillis?.(), 0);
    return bTime - aTime;
  });

  return candidates[0];
};

const generateBillHandler = async (req: Request, res: Response): Promise<void> => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(200).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ success: false, message: "Method not allowed" });
    return;
  }

  try {
    const { sessionId, tableId, ownerId } = req.body as {
      sessionId?: string;
      tableId?: string;
      ownerId?: string;
    };

    if (!sessionId && !tableId) {
      res.status(400).json({ success: false, message: "sessionId or tableId is required" });
      return;
    }

    const result = await db.runTransaction(async (tx) => {
      const orderDoc = await resolveLatestOrderDoc(tx, {
        sessionId: readString(sessionId) || undefined,
        tableId: readString(tableId) || undefined,
        ownerId: readString(ownerId) || undefined,
      });

      if (!orderDoc) {
        throw new Error("ORDER_NOT_FOUND");
      }

      const orderRef = orderDoc.ref;
      const orderData = orderDoc.data();

      const currentStatus = String(orderData.status || "").toUpperCase();
      const currentOrderStatus = String(orderData.orderStatus || "").toLowerCase();
      const alreadyFinalized =
        currentStatus === "FINALIZED" ||
        currentOrderStatus === "completed" ||
        currentOrderStatus === "delivered";

      const items = sanitizeOrderItems(Array.isArray(orderData.items) ? orderData.items : []);
      if (items.length === 0) {
        throw new Error("EMPTY_CART");
      }

      const subtotal = calculateSubtotal(items);
      const savedOfferId = orderData.offerId ? String(orderData.offerId) : null;

      let discount = 0;
      let appliedOffers: Array<{ offerId: string; title: string; type: string; amount: number }> = [];

      if (savedOfferId) {
        const offerRef = db.collection("offers").doc(savedOfferId);
        const offerSnap = await tx.get(offerRef);

        if (offerSnap.exists) {
          const offerResult = applyOffer(
            {
              outletId: String(orderData.outletId || ""),
              items,
              subtotal,
            },
            {
              id: offerSnap.id,
              ...(offerSnap.data() || {}),
            }
          );

          discount = offerResult.discount;
          appliedOffers = offerResult.appliedOffers;
        }
      }

      const taxableAmount = Math.max(subtotal - discount, 0);
      const tax = applyTax(taxableAmount);
      const total = taxableAmount + tax;

      let paymentRef: FirebaseFirestore.DocumentReference;
      if (readString(orderData.paymentId)) {
        paymentRef = db.collection("payments").doc(readString(orderData.paymentId));
      } else {
        const paymentQuery = db.collection("payments").where("orderId", "==", orderRef.id).limit(1);
        const paymentSnap = await tx.get(paymentQuery);
        paymentRef = paymentSnap.empty ? db.collection("payments").doc() : paymentSnap.docs[0].ref;
      }

      const paymentPayload = {
        paymentId: paymentRef.id,
        orderId: orderRef.id,
        outletId: orderData.outletId || null,
        tableId: orderData.tableId || null,
        sessionId: orderData.sessionId || null,
        ownerId: orderData.ownerId || ownerId || null,
        placedBy: orderData.placedBy || null,
        customer: {
          name: orderData.customerName || null,
          phone: orderData.customerPhone || null,
          userId: orderData.userId || orderData.ownerId || ownerId || null,
        },
        items,
        pricing: {
          subtotal,
          discount,
          tax,
          total,
        },
        appliedOffers,
        paymentStatus: "PENDING_COUNTER",
        settlementStatus: "UNPAID",
        payAt: "COUNTER",
        noteToCustomer: "Please pay at the counter. Your bill is ready.",
        generatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      tx.set(paymentRef, paymentPayload, { merge: true });

      tx.update(orderRef, {
        status: "FINALIZED",
        orderStatus: "completed",
        finalizedAt: FieldValue.serverTimestamp(),
        paymentId: paymentRef.id,
        appliedOffers,
        pricing: {
          subtotal,
          discount,
          tax,
          total,
        },
        updatedAt: FieldValue.serverTimestamp(),
      });

      const billLogRef = db.collection("billGenerationLogs").doc();
      tx.set(billLogRef, {
        orderId: orderRef.id,
        sessionId: orderData.sessionId || null,
        tableId: orderData.tableId || null,
        ownerId: orderData.ownerId || ownerId || null,
        paymentId: paymentRef.id,
        alreadyFinalized,
        source: "customer.generateBill",
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        orderId: orderRef.id,
        sessionId: orderData.sessionId || null,
        tableId: orderData.tableId || null,
        paymentId: paymentRef.id,
        items,
        pricing: {
          subtotal,
          discount,
          tax,
          total,
        },
        appliedOffers,
        alreadyFinalized,
        paymentStatus: "PENDING_COUNTER",
        noteToCustomer: "Please pay at the counter. Your bill is ready.",
      };
    });

    res.status(200).json({ success: true, ...result });
    return;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "ORDER_NOT_FOUND") {
        res.status(404).json({ success: false, message: "Order not found" });
        return;
      }

      if (error.message === "EMPTY_CART") {
        res.status(400).json({ success: false, message: "Cannot finalize empty order" });
        return;
      }
    }

    console.error("generateBill error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
    return;
  }
};

const closeSessionHandler = async (req: Request, res: Response): Promise<void> => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(200).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ success: false, message: "Method not allowed" });
    return;
  }

  try {
    const { sessionId, actorUserId } = req.body as { sessionId?: string; actorUserId?: string };

    if (!sessionId) {
      res.status(400).json({ success: false, message: "sessionId is required" });
      return;
    }

    const result = await db.runTransaction(async (tx) => {
      const sessionRef = db.collection("sessions").doc(sessionId);
      const sessionSnap = await tx.get(sessionRef);

      if (!sessionSnap.exists) {
        throw new Error("SESSION_NOT_FOUND");
      }

      const sessionData = sessionSnap.data() || {};
      const tableId = String(sessionData.tableId || "");

      const orderQuery = db.collection("orders").where("sessionId", "==", sessionId).limit(1);
      const orderQuerySnap = await tx.get(orderQuery);

      if (orderQuerySnap.empty) {
        throw new Error("ORDER_NOT_FOUND");
      }

      const orderDoc = orderQuerySnap.docs[0];
      const orderData = orderDoc.data();

      if (orderData.status !== "FINALIZED") {
        throw new Error("ORDER_NOT_FINALIZED");
      }

      const orderItems = Array.isArray(orderData.items)
        ? (orderData.items as OrderItem[])
        : [];
      const itemSummary = {
        lines: orderItems.length,
        totalQty: orderItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0),
      };

      const ownerId = readString(orderData.ownerId) || readString(sessionData.ownerId) || readString(orderData.userId) || null;
      const archivedByUserId = readString(actorUserId) || ownerId || null;

      const historyRef = db.collection("ordersHistory").doc(orderDoc.id);
      const archiveTimestamp = FieldValue.serverTimestamp();

      tx.set(historyRef, {
        orderId: orderDoc.id,
        outletId: orderData.outletId || null,
        tableId: tableId || null,
        sessionId,
        placedBy: orderData.placedBy || null,
        ownerId,
        items: Array.isArray(orderData.items) ? orderData.items : [],
        orderLifecycleStatus: "COMPLETED",
        pricing: orderData.pricing || null,
        appliedOffers: Array.isArray(orderData.appliedOffers) ? orderData.appliedOffers : [],
        itemSummary,
        customer: {
          id: ownerId,
          name: orderData.customerName || null,
          phone: orderData.customerPhone || null,
        },
        archivedByUserId,
        startedAt: sessionData.startedAt || null,
        finalizedAt: orderData.finalizedAt || null,
        closedAt: archiveTimestamp,
        archivedAt: archiveTimestamp,
        source: "customer.closeSession",
        createdAt: orderData.createdAt || null,
        updatedAt: archiveTimestamp,
      }, { merge: true });

      tx.delete(orderDoc.ref);

      tx.update(sessionRef, {
        status: "CLOSED",
        closedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (tableId) {
        const tableRef = db.collection("tables").doc(tableId);
        tx.set(tableRef, {
          isOccupied: false,
          activeSessionId: null,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      return {
        sessionId,
        orderId: orderDoc.id,
      };
    });

    res.status(200).json({
      success: true,
      message: "Session closed successfully",
      ...result,
    });
    return;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "SESSION_NOT_FOUND") {
        res.status(404).json({ success: false, message: "Session not found" });
        return;
      }

      if (error.message === "ORDER_NOT_FOUND") {
        res.status(404).json({ success: false, message: "Order not found for session" });
        return;
      }

      if (error.message === "ORDER_NOT_FINALIZED") {
        res.status(409).json({ success: false, message: "Order must be finalized before session close" });
        return;
      }
    }

    console.error("closeSession error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
    return;
  }
};

export const generateBill = functions.https.onRequest(generateBillHandler);
export const closeSession = functions.https.onRequest(closeSessionHandler);
