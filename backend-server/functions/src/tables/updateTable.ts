import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

export const updateTable = functions.https.onRequest(
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
      if (req.method !== "PUT") {
        res.status(405).json({ success: false, message: "Method not allowed" });
        return;
      }

      const { tableId, ...updates } = req.body;

      if (!tableId) {
        res.status(400).json({ success: false, message: "tableId is required" });
        return;
      }

      const tableRef = db.collection("tables").doc(tableId);
      await tableRef.update({
        ...updates,
        updatedAt: FieldValue.serverTimestamp(),
      });

      res.status(200).json({ success: true, message: "Table updated successfully" });
    } catch (error) {
      console.error("updateTable error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
);
