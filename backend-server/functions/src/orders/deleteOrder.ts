import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";

const db = admin.firestore();

export const deleteOrder = functions.https.onRequest(
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
      console.log("📥 DELETE ORDER - Request received");
      console.log("Method:", req.method);
      console.log("Body:", JSON.stringify(req.body, null, 2));

      // Allow only DELETE
      if (req.method !== "DELETE") {
        console.warn("❌ Wrong method:", req.method);
        res.status(405).json({
          success: false,
          message: "Method not allowed",
        });
        return;
      }

      const { outletId, orderId } = req.body;

      console.log("🔍 Validating:", { outletId, orderId });

      // Validate required fields
      if (!outletId || !orderId) {
        console.error("❌ Missing outletId or orderId");
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

      // Delete order
      console.log("📝 Deleting order:", orderId);
      await orderRef.delete();

      console.log("✅ Order deleted successfully:", orderId);

      res.status(200).json({
        success: true,
        id: orderId,
        message: "Order deleted successfully",
      });
      return;
    } catch (error) {
      console.error("❌ Error deleting order:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: String(error),
      });
      return;
    }
  }
);
