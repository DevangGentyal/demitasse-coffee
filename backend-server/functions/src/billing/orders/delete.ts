import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {Request, Response} from "express";

const db = admin.firestore();

export const deleteOrder = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(200).send(""); return;
  }

  try {
    if (req.method !== "DELETE") {
      res.status(405).json({success: false, message: "Method not allowed"}); return;
    }
    const {outletId, orderId} = req.body;
    if (!outletId || !orderId) {
      res.status(400).json({success: false, message: "outletId and orderId are required"}); return;
    }

    const orderRef = db.collection("outlets").doc(outletId).collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      res.status(404).json({success: false, message: "Order not found"}); return;
    }
    const orderData = orderSnap.data();
    if (orderData?.outletId !== outletId) {
      res.status(403).json({success: false, message: "Order does not belong to this outlet"}); return;
    }

    await orderRef.delete();
    res.status(200).json({success: true, id: orderId, message: "Order deleted successfully"});
  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).json({success: false, message: "Internal server error", error: String(error)});
  }
});
