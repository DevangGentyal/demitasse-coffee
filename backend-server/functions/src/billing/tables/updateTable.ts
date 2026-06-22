import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {Request, Response} from "express";
import {FieldValue} from "firebase-admin/firestore";

const db = admin.firestore();

export const updateTable = functions.https.onRequest(
  async (req: Request, res: Response): Promise<void> => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.status(200).send(""); return;
    }

    try {
      if (req.method !== "PUT") {
        res.status(405).json({success: false, message: "Method not allowed"}); return;
      }

      const {outletId, tableId, ...updates} = req.body;
      if (!tableId) {
        res.status(400).json({success: false, message: "tableId is required"}); return;
      }

      let tableRef = null;
      if (outletId) {
        tableRef = db.collection("outlets").doc(outletId).collection("tables").doc(tableId);
      } else {
        const querySnap = await db.collectionGroup("tables").where("id", "==", tableId).limit(1).get();
        if (!querySnap.empty) {
          tableRef = querySnap.docs[0].ref;
        }
      }

      if (!tableRef) {
        res.status(404).json({success: false, message: "Table not found"});
        return;
      }

      const sanitizedUpdates: Record<string, unknown> = {...updates};
      if (Object.prototype.hasOwnProperty.call(sanitizedUpdates, "occupied")) {
        sanitizedUpdates.occupied = Boolean(sanitizedUpdates.occupied);
      }

      await tableRef.update({...sanitizedUpdates, updatedAt: FieldValue.serverTimestamp()});
      res.status(200).json({success: true, message: "Table updated successfully"});
    } catch (error) {
      console.error("updateTable error:", error);
      res.status(500).json({success: false, message: "Internal server error"});
    }
  }
);
