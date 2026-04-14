import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";

const db = admin.firestore();

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

      const { sessionId } = req.body;

      // Validate input
      if (!sessionId) {
        res.status(400).json({
          success: false,
          message: "sessionId is required",
        });
        return;
      }

      // Fetch session
      const sessionRef = db.collection("sessions").doc(sessionId);
      const sessionSnap = await sessionRef.get();

      if (!sessionSnap.exists) {
        res.status(404).json({
          success: false,
          message: "Session not found",
        });
        return;
      }

      const sessionData = sessionSnap.data();

      // Ensure session is active
      if (sessionData?.status !== "ACTIVE") {
        res.status(409).json({
          success: false,
          message: "Session is already closed",
        });
        return;
      }

      // Fetch associated table
      const tableRef = db.collection("tables").doc(sessionData.tableId);

      // Atomic update: close session + free table
      await db.runTransaction(async (tx) => {
        tx.update(sessionRef, {
          status: "CLOSED",
          closedAt: new Date(),
          closeReason: "MANUAL" // explicit & future-proof
        });

        tx.update(tableRef, {
          isOccupied: false,
          activeSessionId: null,
        });
      });

      res.status(200).json({
        success: true,
        message: "Session closed manually by admin",
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
