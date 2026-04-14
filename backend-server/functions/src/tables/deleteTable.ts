import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";

const db = admin.firestore();

export const deleteTable = functions.https.onRequest(
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
      if (req.method !== "DELETE") {
        res.status(405).json({ success: false, message: "Method not allowed" });
        return;
      }

      const { tableId } = req.body;

      if (!tableId) {
        res.status(400).json({ success: false, message: "tableId is required" });
        return;
      }

      const tableRef = db.collection("tables").doc(tableId);
      await tableRef.delete();

      res.status(200).json({ success: true, message: "Table deleted successfully" });
    } catch (error) {
      console.error("deleteTable error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
);
