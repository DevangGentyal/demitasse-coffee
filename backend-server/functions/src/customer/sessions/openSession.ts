import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {Request, Response} from "express";
import {handleCustomerPreflight} from "../../shared/utilities/security/cors";
import {createOrGetSession} from "../../shared/session/sessionUtils";

const db = admin.firestore();

export const openSession = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
  if (handleCustomerPreflight(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).json({success: false, message: "Method not allowed"});
    return;
  }

  try {
    const {outletId, tableId, userId, guestId} = req.body as {
      outletId?: string;
      tableId?: string;
      userId?: string;
      guestId?: string;
    };

    console.info("[customerSessionOpen] request", {
      method: req.method,
      outletId: outletId || null,
      tableId: tableId || null,
      userId: userId || null,
      guestId: guestId || null,
    });

    const resolvedOutletId = String(outletId || "").trim();
    const resolvedTableId = String(tableId || "").trim();
    const participantId = (userId || guestId || "").trim();
    if (!resolvedOutletId || !resolvedTableId || !participantId) {
      res.status(400).json({success: false, message: "outletId, tableId and userId or guestId are required"});
      return;
    }

    const sessionResult = await createOrGetSession(resolvedOutletId, resolvedTableId, {
      uid: participantId,
      name: userId ? "customer" : "guest",
    });

    const tableRef = db.collection("outlets").doc(resolvedOutletId).collection("tables").doc(resolvedTableId);
    const tableSnap = await tableRef.get();

    if (!tableSnap.exists) {
      console.warn("customerSessionOpen: table document missing; session created without table linkage", {outletId: resolvedOutletId, tableId: resolvedTableId, sessionId: sessionResult.sessionId});
    } else {
      const tableData = tableSnap.data() || {};
      const tableOutletId = String(tableData.outletId || "").trim();
      if (tableOutletId && tableOutletId !== resolvedOutletId) {
        console.warn("customerSessionOpen: table outlet mismatch; session created but table linkage may be stale", {outletId: resolvedOutletId, tableOutletId, tableId: resolvedTableId, sessionId: sessionResult.sessionId});
      }
    }

    console.info("[customerSessionOpen] response", {
      outletId: resolvedOutletId,
      tableId: resolvedTableId,
      sessionId: sessionResult.sessionId,
      created: sessionResult.created,
      ownerId: sessionResult.ownerId,
      participants: sessionResult.participants,
    });

    res.status(200).json({
      success: true,
      sessionId: sessionResult.sessionId,
      created: sessionResult.created,
      ownerId: sessionResult.ownerId,
      participants: sessionResult.participants,
    });
    return;
  } catch (error) {
    console.error("customer openSession error:", error);
    res.status(500).json({success: false, message: "Internal server error"});
    return;
  }
});
