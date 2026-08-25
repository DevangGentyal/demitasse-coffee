import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue, FieldPath } from "firebase-admin/firestore";

const db = admin.firestore();

const readString = (value: unknown): string => String(value ?? "").trim();

const isDueOrder = (data: FirebaseFirestore.DocumentData): boolean => {
  const settlementStatus = readString(data.settlementStatus).toUpperCase();
  const paymentStatus = readString(data.paymentStatus).toUpperCase();
  return settlementStatus === "DUE" || paymentStatus === "DUE";
};

export const processUpdateDuePayment = async (
  reqBody: Record<string, any>
): Promise<{ success: boolean; message: string; orderId?: string }> => {
  const {
    outletId: reqOutletId,
    orderId,
    duePaymentId,
    paymentId,
    id,
    status,
    paymentMode,
  } = reqBody || {};

  const resolvedOrderId = readString(orderId || duePaymentId || paymentId || id);
  let resolvedOutletId = readString(reqOutletId);

  if (!resolvedOrderId) {
    throw new Error("orderId is required");
  }

  let orderHistoryRef: admin.firestore.DocumentReference | null = null;
  let orderData: admin.firestore.DocumentData | null = null;

  // 1) Direct path lookup in ordersHistory
  if (resolvedOutletId) {
    const directRef = db.collection("outlets").doc(resolvedOutletId).collection("ordersHistory").doc(resolvedOrderId);
    const snap = await directRef.get();
    if (snap.exists) {
      orderHistoryRef = directRef;
      orderData = snap.data() || null;
    }
  }

  // 2) CollectionGroup search in ordersHistory
  if (!orderData) {
    const historySnap = await db.collectionGroup("ordersHistory")
      .where(FieldPath.documentId(), "==", resolvedOrderId)
      .limit(1)
      .get();

    if (!historySnap.empty) {
      const docSnap = historySnap.docs[0];
      orderHistoryRef = docSnap.ref;
      orderData = docSnap.data();
      if (!resolvedOutletId) {
        resolvedOutletId = readString(orderData.outletId);
      }
    }
  }

  // 3) Legacy fallback: duePayments doc that stores orderId
  if (!orderData) {
    const legacyQueries = [
      db.collectionGroup("duePayments").where(FieldPath.documentId(), "==", resolvedOrderId),
      db.collectionGroup("duePayments").where("duePaymentId", "==", resolvedOrderId),
      db.collectionGroup("duePayments").where("paymentId", "==", resolvedOrderId),
    ];

    for (const q of legacyQueries) {
      const snap = await q.limit(1).get();
      if (!snap.empty) {
        const legacyData = snap.docs[0].data();
        const legacyOrderId = readString(legacyData.orderId);
        if (!legacyOrderId) break;
        if (!resolvedOutletId) {
          resolvedOutletId = readString(legacyData.outletId);
        }
        if (resolvedOutletId) {
          const legacyOrderRef = db.collection("outlets").doc(resolvedOutletId).collection("ordersHistory").doc(legacyOrderId);
          const legacyOrderSnap = await legacyOrderRef.get();
          if (legacyOrderSnap.exists) {
            orderHistoryRef = legacyOrderRef;
            orderData = legacyOrderSnap.data() || null;
          }
        }
        break;
      }
    }
  }

  if (!orderHistoryRef || !orderData) {
    throw new Error("Order history document not found");
  }

  const normalizedStatus = readString(status).toUpperCase();
  const resolvedPaymentMode = readString(paymentMode).toUpperCase() || "OTHERS";
  const isMarkingComplete = ["COMPLETED", "PAID", "SETTLED", "SUCCESS"].includes(normalizedStatus);
  const now = FieldValue.serverTimestamp();

  if (isMarkingComplete && !isDueOrder(orderData)) {
    throw new Error("Order is not pending settlement");
  }

  await db.runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderHistoryRef!);
    if (!orderSnap.exists) {
      throw new Error("Order history document not found");
    }

    const currentData = orderSnap.data() || {};
    const updatePayload: Record<string, unknown> = {
      updatedAt: now,
    };

    if (isMarkingComplete) {
      updatePayload.settlementStatus = "PAID";
      updatePayload.paymentStatus = "SUCCESS";
      updatePayload.paymentMode = resolvedPaymentMode;
      updatePayload.settledAt = now;
      updatePayload.status = readString(currentData.status) || "completed";
      updatePayload.orderLifecycleStatus = readString(currentData.orderLifecycleStatus) || "COMPLETED";
    } else if (status) {
      updatePayload.paymentStatus = normalizedStatus;
    }

    if (paymentMode) {
      updatePayload.paymentMode = resolvedPaymentMode;
    }

    tx.update(orderHistoryRef!, updatePayload);
  });

  return {
    success: true,
    message: "Due payment updated successfully",
    orderId: orderHistoryRef.id,
  };
};

export const updateDuePayment = functions.https.onRequest(
  async (req: Request, res: Response): Promise<void> => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.status(200).send("");
      return;
    }

    try {
      if (req.method !== "PUT" && req.method !== "POST") {
        res.status(405).json({ success: false, message: "Method not allowed" });
        return;
      }

      const result = await processUpdateDuePayment(req.body || {});
      res.status(200).json(result);
    } catch (error: any) {
      console.error("updateDuePayment error:", error);
      const status = error.message.includes("not found") ? 404 : error.message.includes("required") ? 400 : 500;
      res.status(status).json({ success: false, message: error.message || "Internal server error" });
    }
  }
);
