import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { handleCustomerPreflight } from "./cors";

const db = admin.firestore();

export const openSession = functions.https.onRequest(
  async (req: Request, res: Response): Promise<void> => {
    if (handleCustomerPreflight(req, res)) return;

    if (req.method !== "POST") {
      res.status(405).json({ success: false, message: "Method not allowed" });
      return;
    }

    try {
      const { outletId, tableId, userId, guestId } = req.body as {
        outletId?: string;
        tableId?: string;
        userId?: string;
        guestId?: string;
      };

      const participantId = (userId || guestId || "").trim();

      if (!outletId || !tableId || !participantId) {
        res.status(400).json({
          success: false,
          message: "outletId, tableId and userId or guestId are required",
        });
        return;
      }

      const tableRef = db.collection("tables").doc(tableId);
      const sessionRef = db.collection("sessions").doc();

      const result = await db.runTransaction(async (tx) => {
        const tableSnap = await tx.get(tableRef);

        if (!tableSnap.exists) {
          throw new Error("TABLE_NOT_FOUND");
        }

        const tableData = tableSnap.data() || {};
        if (tableData.outletId !== outletId) {
          throw new Error("TABLE_OUTLET_MISMATCH");
        }

        const isOccupied = Boolean(tableData.isOccupied);
        const activeSessionId = tableData.activeSessionId ? String(tableData.activeSessionId) : "";

        const createFreshSession = async (): Promise<{ sessionId: string; created: boolean }> => {
          tx.set(sessionRef, {
            outletId,
            tableId,
            status: "ACTIVE",
            startedAt: FieldValue.serverTimestamp(),
            closedAt: null,
            ownerId: participantId,
            participants: [participantId],
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });

          tx.update(tableRef, {
            isOccupied: true,
            activeSessionId: sessionRef.id,
            updatedAt: FieldValue.serverTimestamp(),
          });

          return { sessionId: sessionRef.id, created: true };
        };

        if (!isOccupied) {
          return createFreshSession();
        }

        if (!activeSessionId) {
          return createFreshSession();
        }

        const activeSessionRef = db.collection("sessions").doc(activeSessionId);
        const activeSessionSnap = await tx.get(activeSessionRef);

        if (!activeSessionSnap.exists) {
          return createFreshSession();
        }

        const activeSessionData = activeSessionSnap.data() || {};
        if (activeSessionData.status !== "ACTIVE") {
          return createFreshSession();
        }

        const participants = Array.isArray(activeSessionData.participants)
          ? activeSessionData.participants.map((value: unknown) => String(value))
          : [];

        if (!participants.includes(participantId)) {
          participants.push(participantId);
          tx.update(activeSessionRef, {
            participants,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }

        return { sessionId: activeSessionId, created: false };
      });

      res.status(200).json({
        success: true,
        sessionId: result.sessionId,
        created: result.created,
      });
      return;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "TABLE_NOT_FOUND") {
          res.status(404).json({ success: false, message: "Table not found" });
          return;
        }

        if (error.message === "TABLE_OUTLET_MISMATCH") {
          res.status(400).json({ success: false, message: "Table does not belong to this outlet" });
          return;
        }
      }

      console.error("customer openSession error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
      return;
    }
  }
);
