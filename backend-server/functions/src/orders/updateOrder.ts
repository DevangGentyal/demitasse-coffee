import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

const normalizeOrderStatus = (value: unknown): "pending" | "in-progress" | "ready" | "completed" => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "in-progress" || raw === "in progress" || raw === "working" || raw === "preparing") {
    return "in-progress";
  }
  if (raw === "ready") {
    return "ready";
  }
  if (raw === "completed" || raw === "complete" || raw === "delivered" || raw === "finalized") {
    return "completed";
  }
  return "pending";
};

const normalizeItemStatus = (value: unknown): "pending" | "in-progress" | "ready" | "completed" => {
  return normalizeOrderStatus(value);
};

export const updateOrder = functions.https.onRequest(
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
      console.log("📥 UPDATE ORDER - Request received");
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

      const { outletId, orderId, orderStatus, items, totalAmount } = req.body;

      console.log("🔍 Validating:", { outletId, orderId, orderStatus });

      // Validate required fields
      if (!outletId || !orderId) {
        console.error("❌ Missing required fields");
        res.status(400).json({
          success: false,
          message: "outletId and orderId are required",
        });
        return;
      }

      // Verify order exists and belongs to outlet
      const orderRef = db.collection("orders").doc(orderId);
      const orderSnap = await orderRef.get();

      if (!orderSnap.exists) {
        console.error("❌ Order not found:", orderId);
        res.status(404).json({
          success: false,
          message: "Order not found",
        });
        return;
      }

      const orderData = orderSnap.data();
      if (orderData?.outletId !== outletId) {
        console.error("❌ Outlet mismatch. Expected:", outletId, "Got:", orderData?.outletId);
        res.status(403).json({
          success: false,
          message: "Order does not belong to this outlet",
        });
        return;
      }

      // Build update object
      const updateData: any = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      const normalizedOrderStatus = normalizeOrderStatus(orderStatus);
      if (orderStatus) {
        updateData.orderStatus = normalizedOrderStatus;
        updateData.status = normalizedOrderStatus;
        console.log("📝 Updating status to:", normalizedOrderStatus);
      }

      let normalizedItems: any[] | null = null;
      if (items && Array.isArray(items)) {
        normalizedItems = items.map((item: any) => ({
          id: item.id || Math.random().toString(36).substr(2, 9),
          name: item.name,
          quantity: item.quantity || 1,
          status: normalizeItemStatus(item.status),
          price: item.price || 0,
          addOns: item.addOns || "",
          notes: item.notes || "",
        }));
        updateData.items = normalizedItems;
      } else if (orderStatus && Array.isArray(orderData?.items)) {
        // Keep item-level status in sync when order-level status is changed without explicit items.
        normalizedItems = orderData.items.map((item: any) => {
          const currentStatus = normalizeItemStatus(item?.status);
          let nextStatus = currentStatus;

          if (normalizedOrderStatus === "completed") {
            nextStatus = "completed";
          } else if (normalizedOrderStatus === "ready" && currentStatus !== "completed") {
            nextStatus = "ready";
          } else if (normalizedOrderStatus === "in-progress" && currentStatus === "pending") {
            nextStatus = "in-progress";
          } else if (normalizedOrderStatus === "pending") {
            nextStatus = "pending";
          }

          return {
            ...item,
            status: nextStatus,
          };
        });
        updateData.items = normalizedItems;
      }

      if (totalAmount !== undefined) {
        updateData.totalAmount = totalAmount;
      }

      // Update order
      await orderRef.update(updateData);
      console.log("✅ Order updated successfully:", orderId);

      res.status(200).json({
        success: true,
        id: orderId,
        message: "Order updated successfully",
      });
      return;
    } catch (error) {
      console.error("❌ Error updating order:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: String(error),
      });
      return;
    }
  }
);
