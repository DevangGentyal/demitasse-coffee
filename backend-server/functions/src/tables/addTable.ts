import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

export const addTable = functions.https.onRequest(
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
      if (req.method !== "POST") {
        res.status(405).json({ success: false, message: "Method not allowed" });
        return;
      }

      const { outletId, name, capacity, x, y, color } = req.body;

      if (!outletId || !name) {
        res.status(400).json({ success: false, message: "outletId and name are required" });
        return;
      }

      const tableRef = db.collection("tables").doc();
      const tableData = {
        id: tableRef.id,
        outletId,
        name,
        capacity: capacity || 2,
        x: x || 100,
        y: y || 100,
        color: color || "#fbbf24",
        isOccupied: false,
        activeSessionId: null,
        billAmount: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      await tableRef.set(tableData);

      res.status(201).json({ success: true, id: tableRef.id, message: "Table added successfully" });
    } catch (error) {
      console.error("addTable error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
);
