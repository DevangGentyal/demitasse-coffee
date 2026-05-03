import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { earnPoints } from "../loyalty/earnPoints";

const db = admin.firestore();

const resolvePlacedBy = (value: unknown): "billing" | "customer" => {
  return value === "customer" ? "customer" : "billing";
};

export const createOrder = functions.https.onRequest(
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
      console.log("📥 CREATE ORDER - Request received");
      console.log("Method:", req.method);
      console.log("Body:", JSON.stringify(req.body, null, 2));

      // Allow only PUT
      if (req.method !== "PUT") {
        console.warn("❌ Wrong method:", req.method);
        res.status(405).json({
          success: false,
          message: "Method not allowed",
        });
        return;
      }

      const {
        outletId,
        customerName,
        customerId,
        customerPhone,
        placedBy,
        tableId,
        items,
        totalAmount,
      } = req.body;

      console.log("🔍 Validating:", { outletId, customerName, itemCount: items?.length });

      // Validate required fields
      if (!outletId || !items || !Array.isArray(items)) {
        console.error("❌ Missing required fields");
        res.status(400).json({
          success: false,
          message: "outletId and items array are required",
        });
        return;
      }

      if (items.length === 0) {
        console.error("❌ Items array is empty");
        res.status(400).json({
          success: false,
          message: "Order must contain at least one item",
        });
        return;
      }

      // Handle table session logic if tableId is provided
      let activeSessionId = null;
      if (tableId) {
        console.log(`🪑 Checking table session for table: ${tableId}`);
        const tableRef = db.collection("tables").doc(tableId.toString());
        const tableSnap = await tableRef.get();

        if (tableSnap.exists) {
          const tableData = tableSnap.data();
          if (tableData?.isOccupied && tableData.activeSessionId) {
            activeSessionId = tableData.activeSessionId;
            console.log(`🔗 Linking order to existing session: ${activeSessionId}`);
          } else {
            // Start a new session
            const sessionRef = db.collection("sessions").doc();
            activeSessionId = sessionRef.id;
            console.log(`🆕 Starting new session: ${activeSessionId}`);

            await db.runTransaction(async (tx) => {
              tx.set(sessionRef, {
                outletId,
                tableId: tableId.toString(),
                status: "ACTIVE",
                startedAt: FieldValue.serverTimestamp(),
                closedAt: null,
                totalAmount: 0,
              });

              tx.update(tableRef, {
                isOccupied: true,
                activeSessionId: sessionRef.id,
                updatedAt: FieldValue.serverTimestamp(),
              });
            });
          }
        } else {
          console.warn(`⚠️ Table ${tableId} not found in DB`);
        }
      }

      // Create new order document
      const orderRef = db.collection("orders").doc();

      const orderData = {
        outletId,
        customerName: (customerName || "Walk-in Customer").trim(),
        customerId: customerId ? String(customerId).trim() : null,
        customerPhone: customerPhone ? String(customerPhone).trim() : "",
        placedBy: resolvePlacedBy(placedBy),
        tableId: tableId || null,
        sessionId: activeSessionId,
        items: items.map((item: any) => ({
          id: item.id || Math.random().toString(36).substr(2, 9),
          category: item.category || "unknown",
          name: item.name,
          quantity: item.quantity || 1,
          status: item.status || "pending",
          price: item.price || 0,
          addOns: Array.isArray(item.addons) ? item.addons : (Array.isArray(item.addOns) ? item.addOns : []),
          items: Array.isArray(item.items) ? item.items.map((sub: any) => ({
            ...sub,
            addOns: Array.isArray(sub.addons) ? sub.addons : (Array.isArray(sub.addOns) ? sub.addOns : [])
          })) : undefined,
          notes: item.notes || "",
        })),
        orderStatus: "pending",
        totalAmount: totalAmount || 0,
        timeOfOrder: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      console.log("📝 Creating order:", orderRef.id);

      await orderRef.set(orderData);

      console.log("✅ Order created successfully:", orderRef.id);

      // --- LOYALTY LOGIC ---
      if (customerId) {
        // Run loyalty logic separately without disrupting the return payload
        earnPoints(customerId, customerName, totalAmount, items, orderRef.id);
      }
      // --- END LOYALTY LOGIC ---

      res.status(201).json({
        success: true,
        id: orderRef.id,
        message: "Order created successfully",
      });
      return;
    } catch (error) {
      console.error("❌ Error creating order:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: String(error),
      });
      return;
    }
  }
);
