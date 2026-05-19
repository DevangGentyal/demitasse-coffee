import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const readNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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

  const discount = 0;
  const tax = subtotal * 0.05;
  const total = subtotal - discount + tax;

  return { subtotal, discount, tax, total };
};

/**
 * closeSession
 * -------------------
 * Manually closes a dining session.
 * Intended to be called ONLY from Admin/POS UI.
 * Session closes when table becomes free (not on payment).
 */
export const closeSession = functions.https.onRequest(
  async (req: Request, res: Response): Promise<void> => {
    // Set CORS headers
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    // Handle OPTIONS preflight request
    if (req.method === "OPTIONS") {
      res.status(200).send("");
      return;
    }

    try {
      // Only POST allowed
      if (req.method !== "POST") {
        res.status(405).json({
          success: false,
          message: "Method not allowed",
        });
        return;
      }

      const { sessionId, tableId } = req.body as { sessionId?: string; tableId?: string };

      // Validate input
      if (!sessionId && !tableId) {
        res.status(400).json({
          success: false,
          message: "sessionId or tableId is required",
        });
        return;
      }

      let resolvedSessionId = "";
      let sessionRef: FirebaseFirestore.DocumentReference | null = null;
      let sessionSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      let allowTableForceClose = false;

      if (sessionId) {
        resolvedSessionId = readString(sessionId);
        sessionRef = db.collection("sessions").doc(resolvedSessionId);
        sessionSnap = await sessionRef.get();
      } else {
        const resolvedTableId = readString(tableId);
        const activeSessionQuery = db
          .collection("sessions")
          .where("tableId", "==", resolvedTableId)
          .where("status", "==", "ACTIVE")
          .limit(1);
        const activeSessionSnap = await activeSessionQuery.get();

        if (activeSessionSnap.empty) {
          // Fallback mode: table can still be force-reset and table-linked orders can still be archived.
          allowTableForceClose = true;
        } else {
          const activeSessionDoc = activeSessionSnap.docs[0];
          resolvedSessionId = activeSessionDoc.id;
          sessionRef = activeSessionDoc.ref;
          sessionSnap = activeSessionDoc;
        }
      }

      if (!allowTableForceClose && (!sessionSnap || !sessionSnap.exists || !sessionRef)) {
        res.status(404).json({
          success: false,
          message: "Session not found",
        });
        return;
      }

      const sessionData = sessionSnap?.data() || {};

      // Ensure session is active
      if (!allowTableForceClose && sessionData?.status !== "ACTIVE") {
        res.status(409).json({
          success: false,
          message: "Session is already closed",
        });
        return;
      }

      // Fetch associated table
      const resolvedTableId = allowTableForceClose
        ? readString(tableId)
        : readString(sessionData?.tableId);
      const tableRef = db.collection("tables").doc(resolvedTableId);

      // Atomic update: finalize billing records + close session + free/reset table
      await db.runTransaction(async (tx) => {
        const tableOrderQuery = db.collection("orders").where("tableId", "==", resolvedTableId).limit(50);
        const tableOrderSnap = await tx.get(tableOrderQuery);

        const candidateOrderDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
        tableOrderSnap.docs.forEach((doc) => candidateOrderDocs.set(doc.id, doc));
        if (resolvedSessionId) {
          const sessionOrderQuery = db.collection("orders").where("sessionId", "==", resolvedSessionId);
          const sessionOrderSnap = await tx.get(sessionOrderQuery);
          sessionOrderSnap.docs.forEach((doc) => candidateOrderDocs.set(doc.id, doc));
        }

        const paymentRefs = new Map<string, FirebaseFirestore.DocumentReference>();
        for (const orderDoc of candidateOrderDocs.values()) {
          const orderData = orderDoc.data();
          if (readString(orderData.paymentId)) {
            paymentRefs.set(orderDoc.id, db.collection("payments").doc(readString(orderData.paymentId)));
            continue;
          }

          const paymentQuery = db.collection("payments").where("orderId", "==", orderDoc.id).limit(1);
          const paymentSnap = await tx.get(paymentQuery);
          const paymentRef = paymentSnap.empty ? db.collection("payments").doc() : paymentSnap.docs[0].ref;
          paymentRefs.set(orderDoc.id, paymentRef);
        }

        const archivedAt = FieldValue.serverTimestamp();
        const closedOrderIds: string[] = [];
        const closedPaymentIds: string[] = [];

        for (const orderDoc of candidateOrderDocs.values()) {
          const orderData = orderDoc.data();
          closedOrderIds.push(orderDoc.id);

          const ownerId = readString(orderData.ownerId) || readString(sessionData.ownerId) || readString(orderData.userId) || null;
          const resolvedPricing = orderData.pricing || computePricingFromItems(Array.isArray(orderData.items) ? orderData.items : []);

          const isCancelled = String(orderData.status || orderData.orderStatus || orderData.orderLifecycleStatus || "").toLowerCase() === "cancelled";

          const paymentRef = paymentRefs.get(orderDoc.id) || db.collection("payments").doc();
          if (!isCancelled) {
            closedPaymentIds.push(paymentRef.id);

            tx.set(paymentRef, {
              paymentId: paymentRef.id,
              orderId: orderDoc.id,
              outletId: orderData.outletId || null,
              tableId: resolvedTableId || null,
              sessionId: resolvedSessionId || readString(orderData.sessionId) || null,
              ownerId,
              customer: {
                id: ownerId,
                name: orderData.customerName || null,
                phone: orderData.customerPhone || null,
              },
              items: Array.isArray(orderData.items) ? orderData.items : [],
              pricing: resolvedPricing,
              appliedOffers: Array.isArray(orderData.appliedOffers) ? orderData.appliedOffers : [],
              paymentStatus: "PENDING_COUNTER",
              settlementStatus: "UNPAID",
              payAt: "COUNTER",
              noteToCustomer: "Please pay at counter.",
              sessionClosedByAdmin: true,
              sessionClosedAt: archivedAt,
              updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
          }

          const historyRef = db.collection("ordersHistory").doc(orderDoc.id);
          tx.set(historyRef, {
            orderId: orderDoc.id,
            outletId: orderData.outletId || null,
            tableId: resolvedTableId || null,
            sessionId: resolvedSessionId || readString(orderData.sessionId) || null,
            placedBy: orderData.placedBy || null,
            ownerId,
            paymentId: !isCancelled ? paymentRef.id : null,
            items: Array.isArray(orderData.items) ? orderData.items : [],
            orderLifecycleStatus: isCancelled ? "CANCELLED" : "COMPLETED",
            pricing: resolvedPricing,
            appliedOffers: Array.isArray(orderData.appliedOffers) ? orderData.appliedOffers : [],
            customer: {
              id: ownerId,
              name: orderData.customerName || null,
              phone: orderData.customerPhone || null,
            },
            finalizedAt: orderData.finalizedAt || null,
            closedAt: archivedAt,
            archivedAt,
            source: "admin.closeSession",
            createdAt: orderData.createdAt || null,
            updatedAt: archivedAt,
          }, { merge: true });

          if (!isCancelled) {
            // ✅ Increment offer usage counters
            const appliedOffers = Array.isArray(orderData.appliedOffers) ? orderData.appliedOffers : [];
            const orderItems = Array.isArray(orderData.items) ? orderData.items : [];
            
            console.log(`[OFFER_INCREMENT_DEBUG] candidateOrdersCount=${candidateOrderDocs.size}, orderId=${orderDoc.id}, appliedOffers=${JSON.stringify(appliedOffers)}, itemsCount=${orderItems.length}`);

            // Collect all offer IDs from order-level and item-level
            const offerIdsToProcess = new Set<string>();
            appliedOffers.forEach((o: any) => { if (o.offerId) offerIdsToProcess.add(o.offerId); });
            if (orderData.offerId) offerIdsToProcess.add(String(orderData.offerId));
            orderItems.forEach((item: any) => { if (item.offerId) offerIdsToProcess.add(item.offerId); });

            if (offerIdsToProcess.size > 0) {
              for (const offerId of offerIdsToProcess) {
                console.log(`[OFFER_INCREMENT_START] offerId=${offerId}, source=admin.closeSession`);
                
                const offerRef = db.collection("offers").doc(offerId);
                // Use a transaction get to log current count
                const offerSnap = await tx.get(offerRef);
                const currentUsedCount = readNumber(offerSnap.data()?.usedCount, 0);
                console.log(`[OFFER_INCREMENT_DEBUG] offerId=${offerId}, currentUsedCount=${currentUsedCount}, userId=${ownerId || 'GUEST'}`);

                tx.update(offerRef, { usedCount: FieldValue.increment(1) });

                if (ownerId) {
                  const userRef = db.collection("users").doc(ownerId);
                  tx.set(userRef, {
                    [`usedOffers.${offerId}`]: FieldValue.increment(1)
                  }, { merge: true });
                  console.log(`[OFFER_INCREMENT_SUCCESS] offerId=${offerId}, newUsedCount=${currentUsedCount + 1}`);
                } else {
                  console.log(`[OFFER_INCREMENT_SKIPPED] reason=No ownerId found for user-specific tracking`);
                  console.log(`[OFFER_INCREMENT_SUCCESS] offerId=${offerId}, newUsedCount=${currentUsedCount + 1} (Global Only)`);
                }
              }
            } else {
              console.log(`[OFFER_INCREMENT_SKIPPED] reason=No offers found in order ${orderDoc.id} (checked appliedOffers, root offerId, and item offerIds)`);
            }
          }
        }

        for (const orderDoc of candidateOrderDocs.values()) {
          tx.delete(orderDoc.ref);
        }

        // Compute total bill from non-cancelled orders to decide payment notification
        let totalBillAmount = 0;
        for (const orderDoc of candidateOrderDocs.values()) {
          const orderData = orderDoc.data();
          const isCancelled = String(orderData.status || orderData.orderStatus || orderData.orderLifecycleStatus || "").toLowerCase() === "cancelled";
          if (!isCancelled) {
            const resolvedPricing = orderData.pricing || computePricingFromItems(Array.isArray(orderData.items) ? orderData.items : []);
            totalBillAmount += readNumber(resolvedPricing.total, 0);
          }
        }

        // Reset table first so the UI immediately reflects a free table.
        // If there was an actual bill (> 0), set needsPaymentCollection flag
        // so the manager dashboard can show a notification/highlight.
        const tableResetPayload: Record<string, unknown> = {
          isOccupied: false,
          occupied: false,
          activeSessionId: null,
          owner: null,
          billAmount: 0,
          ownerAssignedAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (totalBillAmount > 0) {
          tableResetPayload.needsPaymentCollection = true;
          tableResetPayload.needsPaymentCollectionAt = FieldValue.serverTimestamp();
        }

        tx.update(tableRef, tableResetPayload);

        const closeLogRef = db.collection("sessionCloseLogs").doc();
        tx.set(closeLogRef, {
          sessionId: resolvedSessionId || null,
          tableId: resolvedTableId || null,
          outletId: sessionData.outletId || null,
          orderIds: closedOrderIds,
          paymentIds: closedPaymentIds,
          closedOrdersCount: closedOrderIds.length,
          forceClosedWithoutActiveSession: allowTableForceClose,
          source: "billing-admin.closeSession",
          closedAt: FieldValue.serverTimestamp(),
        });

        if (!allowTableForceClose && sessionRef) {
          tx.update(sessionRef, {
            status: "CLOSED",
            closedAt: FieldValue.serverTimestamp(),
            closeReason: "MANUAL",
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });

      res.status(200).json({
        success: true,
        sessionId: resolvedSessionId,
        message: "Session closed. Table reset, billing records saved, and logs captured.",
      });
      return;
    } catch (error) {
      console.error("closeSession error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
      return;
    }
  }
);
