import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {Request, Response} from "express";
import {FieldValue} from "firebase-admin/firestore";

const db = admin.firestore();

const readString = (value: unknown): string => String(value ?? "").trim();

const isTableOccupied = (tableData: FirebaseFirestore.DocumentData): boolean => {
  const status = readString(tableData.status).toUpperCase();
  return Boolean(tableData.occupied || tableData.activeSessionId || status === "ACTIVE" || status === "BILL");
};

export const shiftTable = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(200).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({success: false, message: "Method not allowed"});
    return;
  }

  const outletId = readString(req.body?.outletId);
  const sourceTableId = readString(req.body?.sourceTableId);
  const destinationTableId = readString(req.body?.destinationTableId);

  if (!outletId || !sourceTableId || !destinationTableId) {
    res.status(400).json({success: false, message: "outletId, sourceTableId and destinationTableId are required"});
    return;
  }

  if (sourceTableId === destinationTableId) {
    res.status(400).json({success: false, message: "Destination table must be different from source table"});
    return;
  }

  try {
    const result = await db.runTransaction(async (tx) => {
      const outletRef = db.collection("outlets").doc(outletId);
      const sourceTableRef = outletRef.collection("tables").doc(sourceTableId);
      const destinationTableRef = outletRef.collection("tables").doc(destinationTableId);

      const sourceTableSnap = await tx.get(sourceTableRef);
      const destinationTableSnap = await tx.get(destinationTableRef);

      if (!sourceTableSnap.exists) throw new Error("SOURCE_TABLE_NOT_FOUND");
      if (!destinationTableSnap.exists) throw new Error("DESTINATION_TABLE_NOT_FOUND");

      const sourceTableData = sourceTableSnap.data() || {};
      const destinationTableData = destinationTableSnap.data() || {};
      const activeSessionId = readString(sourceTableData.activeSessionId);

      if (!activeSessionId || !sourceTableData.occupied) {
        throw new Error("SOURCE_TABLE_HAS_NO_ACTIVE_SESSION");
      }

      if (isTableOccupied(destinationTableData)) {
        throw new Error("DESTINATION_TABLE_OCCUPIED");
      }

      const sessionRef = outletRef.collection("sessions").doc(activeSessionId);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) throw new Error("ACTIVE_SESSION_NOT_FOUND");

      const sessionData = sessionSnap.data() || {};
      if (readString(sessionData.status).toUpperCase() === "CLOSED") {
        throw new Error("SOURCE_TABLE_HAS_NO_ACTIVE_SESSION");
      }

      const ordersBySessionSnap = await tx.get(
        outletRef.collection("orders").where("sessionId", "==", activeSessionId)
      );
      const legacyOrdersByTableSnap = await tx.get(
        outletRef.collection("orders").where("tableId", "==", sourceTableId).limit(50)
      );

      const orderDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      ordersBySessionSnap.docs.forEach((doc) => orderDocs.set(doc.id, doc));
      legacyOrdersByTableSnap.docs.forEach((doc) => orderDocs.set(doc.id, doc));

      const updatedAt = FieldValue.serverTimestamp();
      const destinationTablePayload: Record<string, unknown> = {
        occupied: true,
        activeSessionId,
        status: readString(sourceTableData.status).toUpperCase() || "ACTIVE",
        billAmount: sourceTableData.billAmount ?? 0,
        updatedAt,
      };

      if (Object.prototype.hasOwnProperty.call(sourceTableData, "owner")) {
        destinationTablePayload.owner = sourceTableData.owner ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(sourceTableData, "participants")) {
        destinationTablePayload.participants = sourceTableData.participants ?? [];
      }
      if (Object.prototype.hasOwnProperty.call(sourceTableData, "customerName")) {
        destinationTablePayload.customerName = sourceTableData.customerName ?? "";
      }
      if (Object.prototype.hasOwnProperty.call(sourceTableData, "customerPhone")) {
        destinationTablePayload.customerPhone = sourceTableData.customerPhone ?? "";
      }
      if (Object.prototype.hasOwnProperty.call(sourceTableData, "needsPaymentCollection")) {
        destinationTablePayload.needsPaymentCollection = sourceTableData.needsPaymentCollection ?? false;
      }
      if (Object.prototype.hasOwnProperty.call(sourceTableData, "needsPaymentCollectionAt")) {
        destinationTablePayload.needsPaymentCollectionAt = sourceTableData.needsPaymentCollectionAt ?? null;
      }

      const sourceTablePayload: Record<string, unknown> = {
        occupied: false,
        activeSessionId: null,
        status: "IDLE",
        billAmount: 0,
        updatedAt,
      };

      if (Object.prototype.hasOwnProperty.call(sourceTableData, "owner")) {
        sourceTablePayload.owner = null;
      }
      if (Object.prototype.hasOwnProperty.call(sourceTableData, "participants")) {
        sourceTablePayload.participants = FieldValue.delete();
      }
      if (Object.prototype.hasOwnProperty.call(sourceTableData, "customerName")) {
        sourceTablePayload.customerName = "";
      }
      if (Object.prototype.hasOwnProperty.call(sourceTableData, "customerPhone")) {
        sourceTablePayload.customerPhone = "";
      }
      if (Object.prototype.hasOwnProperty.call(sourceTableData, "needsPaymentCollection")) {
        sourceTablePayload.needsPaymentCollection = false;
      }
      if (Object.prototype.hasOwnProperty.call(sourceTableData, "needsPaymentCollectionAt")) {
        sourceTablePayload.needsPaymentCollectionAt = FieldValue.delete();
      }

      tx.set(destinationTableRef, destinationTablePayload, {merge: true});
      tx.set(sourceTableRef, sourceTablePayload, {merge: true});

      const sessionPayload: Record<string, unknown> = {updatedAt};
      if (Object.prototype.hasOwnProperty.call(sessionData, "tableId")) {
        sessionPayload.tableId = destinationTableId;
      }
      if (Object.prototype.hasOwnProperty.call(sessionData, "tableNumber")) {
        sessionPayload.tableNumber = readString(destinationTableData.name || destinationTableId);
      }
      tx.set(sessionRef, sessionPayload, {merge: true});

      orderDocs.forEach((orderDoc) => {
        const orderData = orderDoc.data() || {};
        const orderPayload: Record<string, unknown> = {updatedAt};
        if (Object.prototype.hasOwnProperty.call(orderData, "tableId")) {
          orderPayload.tableId = destinationTableId;
        }
        tx.set(orderDoc.ref, orderPayload, {merge: true});
      });

      return {
        sessionId: activeSessionId,
        updatedOrderCount: orderDocs.size,
        sourceTableName: readString(sourceTableData.name || sourceTableId),
        destinationTableName: readString(destinationTableData.name || destinationTableId),
      };
    });

    res.status(200).json({success: true, message: "Table shifted successfully", data: result});
  } catch (error: any) {
    const messageByCode: Record<string, {status: number; message: string}> = {
      SOURCE_TABLE_NOT_FOUND: {status: 404, message: "Source table not found"},
      DESTINATION_TABLE_NOT_FOUND: {status: 404, message: "Destination table not found"},
      SOURCE_TABLE_HAS_NO_ACTIVE_SESSION: {status: 409, message: "Source table has no active session"},
      DESTINATION_TABLE_OCCUPIED: {status: 409, message: "Destination table is already occupied"},
      ACTIVE_SESSION_NOT_FOUND: {status: 409, message: "Active session not found for source table"},
    };
    const mapped = messageByCode[error?.message];
    if (mapped) {
      res.status(mapped.status).json({success: false, message: mapped.message});
      return;
    }
    console.error("[billingTablesShift] Error:", error);
    res.status(500).json({success: false, message: "Failed to shift table"});
  }
});
