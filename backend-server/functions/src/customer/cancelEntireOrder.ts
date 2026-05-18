import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import * as bcrypt from "bcryptjs";
import { handleCustomerPreflight } from "./cors";

const isActiveOrder = (orderData: FirebaseFirestore.DocumentData): boolean => {
  const status = String(orderData.status || orderData.orderStatus || orderData.orderLifecycleStatus || "")
    .trim()
    .toUpperCase();
  return !["CANCELLED", "COMPLETED", "CLOSED", "DELETED"].includes(status);
};

const sanitizeOrderSnapshot = (orderData: FirebaseFirestore.DocumentData): FirebaseFirestore.DocumentData => {
  const items = Array.isArray(orderData.items)
    ? orderData.items.map((item: any) => {
        const { customizations, variations, ...rest } = item || {};
        return rest;
      })
    : [];

  return {
    ...orderData,
    items,
    status: "CANCELLED",
    orderStatus: "CANCELLED",
    orderLifecycleStatus: "CANCELLED",
  };
};

const getOrderTotal = (orderData: FirebaseFirestore.DocumentData): number => {
  const directTotal = Number(orderData.grandTotal ?? orderData.totalAmount ?? orderData.itemTotal ?? orderData.pricing?.total);
  if (Number.isFinite(directTotal)) return directTotal;

  const items = Array.isArray(orderData.items) ? orderData.items : [];
  return items.reduce((sum: number, item: any) => {
    const qty = Number(item?.qty ?? item?.quantity ?? 1);
    const price = Number(item?.price ?? item?.finalUnitPrice ?? item?.priceRaw ?? 0);
    return sum + (Number.isFinite(qty) && Number.isFinite(price) ? qty * price : 0);
  }, 0);
};

export const cancelEntireOrder = functions.https.onRequest(
  async (req: Request, res: Response): Promise<void> => {
    const db = admin.firestore();
    if (handleCustomerPreflight(req, res)) return;

    if (req.method !== "POST") {
      res.status(405).json({ success: false, message: "Method not allowed" });
      return;
    }

    // 1. Authenticate user
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ success: false, message: "Unauthorized: Missing token" });
      return;
    }

    const token = authHeader.split("Bearer ")[1];
    try {
      await admin.auth().verifyIdToken(token);
    } catch (err) {
      res.status(401).json({ success: false, message: "Unauthorized: Invalid token" });
      return;
    }

    try {
      const { orderId, password, reason } = req.body as {
        orderId?: string;
        password?: string;
        reason?: string;
      };

      if (!orderId || !password || !reason) {
        res.status(400).json({
          success: false,
          message: "Missing required fields: orderId, password, and reason",
        });
        return;
      }

      // 2. Validate Password securely
      const passwordRef = db.collection("secureOrderCancellationAccess").doc("main");
      const passwordSnap = await passwordRef.get();
      if (!passwordSnap.exists) {
        res.status(500).json({
          success: false,
          message: "Cancellation password is not configured. Set it in the admin panel first.",
        });
        return;
      }

      const { passkeyHash } = passwordSnap.data() || {};
      if (!passkeyHash) {
        res.status(500).json({
          success: false,
          message: "Invalid configuration: Cancellation password hash is missing.",
        });
        return;
      }

      const isMatch = bcrypt.compareSync(password, passkeyHash);
      if (!isMatch) {
        res.status(401).json({
          success: false,
          message: "Incorrect cancellation password",
        });
        return;
      }

      // 3. Get Order
      const orderRef = db.collection("orders").doc(orderId);
      const orderSnap = await orderRef.get();
      if (!orderSnap.exists) {
        res.status(404).json({ success: false, message: "Order not found" });
        return;
      }

      const orderData = orderSnap.data() || {};
      if (!isActiveOrder(orderData)) {
        res.status(400).json({ success: false, message: "Order is not active" });
        return;
      }

      const sessionId = orderData.sessionId || "";
      const tableId = orderData.tableId || "";
      const outletId = orderData.outletId || "";
      const customerUserId = orderData.userId || orderData.ownerId || orderData.customerId || null;
      const ordersToCancelSnap = sessionId
        ? await db.collection("orders")
            .where("sessionId", "==", sessionId)
            .where("outletId", "==", outletId)
            .get()
        : null;

      const ordersToCancel = ordersToCancelSnap && !ordersToCancelSnap.empty
        ? ordersToCancelSnap.docs.filter((doc) => isActiveOrder(doc.data()))
        : [orderSnap];

      const orderSnapshots = ordersToCancel.map((doc) => ({
        orderId: doc.id,
        ...sanitizeOrderSnapshot(doc.data() || {}),
      }));

      const totalOrdersCost = ordersToCancel.reduce((sum, doc) => sum + getOrderTotal(doc.data() || {}), 0);

      // 4. Remove all active orders in this session before closeSession can archive them.
      const batch = db.batch();
      ordersToCancel.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      // 5. Store one session-level cancellation record. This is the only cancellation log.
      await db.collection("OrderCancel").doc(sessionId || tableId || orderId).set({
        userId: customerUserId,
        closeReason: reason,
        outletId,
        tableId: tableId || null,
        sessionId: sessionId || null,
        orderSnapshots,
        totalOrdersCost,
        cancelledAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      // 6. Trigger session closing loopback calls to both functions
      const projectId = admin.apps[0]?.options.projectId || "demitasse-cafe-pilot";
      const region = "us-central1";
      const baseUrl = process.env.FUNCTIONS_EMULATOR === "true"
        ? `http://localhost:5001/${projectId}/${region}`
        : `https://${region}-${projectId}.cloudfunctions.net`;

      const payload = sessionId ? { sessionId, tableId } : { tableId };
      let closeSuccess = false;
      let closeError = "";

      // Call closeSession
      try {
        console.log(`[CANCELLATION] Attempting closeSession call on: ${baseUrl}/closeSession`);
        const closeRes = await fetch(`${baseUrl}/closeSession`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader,
          },
          body: JSON.stringify(payload),
        });
        const resText = await closeRes.text();
        console.log(`[CANCELLATION] closeSession status=${closeRes.status}, body=${resText}`);
        if (closeRes.ok) {
          closeSuccess = true;
        } else {
          closeError = `closeSession returned ${closeRes.status}: ${resText}`;
        }
      } catch (err: any) {
        console.warn("[CANCELLATION] closeSession call failed:", err);
        closeError = err.message || String(err);
      }

      // Fallback: Call closeCustomerSession
      if (!closeSuccess) {
        try {
          console.log(`[CANCELLATION] Fallback: closeCustomerSession call on: ${baseUrl}/closeCustomerSession`);
          const closeRes = await fetch(`${baseUrl}/closeCustomerSession`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": authHeader,
            },
            body: JSON.stringify(payload),
          });
          const resText = await closeRes.text();
          console.log(`[CANCELLATION] closeCustomerSession status=${closeRes.status}, body=${resText}`);
          if (closeRes.ok) {
            closeSuccess = true;
          } else {
            closeError = `closeCustomerSession returned ${closeRes.status}: ${resText}`;
          }
        } catch (err: any) {
          console.error("[CANCELLATION] closeCustomerSession call failed:", err);
          closeError = err.message || String(err);
        }
      }

      if (!closeSuccess) {
        res.status(500).json({
          success: false,
          message: `Order cancelled in logs, but failed to automatically close session: ${closeError}`,
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Order cancelled and session closed successfully",
      });
      return;
    } catch (error) {
      console.error("cancelEntireOrder error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
      return;
    }
  }
);
