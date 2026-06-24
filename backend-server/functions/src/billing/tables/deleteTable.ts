import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";
import {Request, Response} from "express";

const db = admin.firestore();
const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const extractTableNumber = (name: unknown): number | null => {
  if (typeof name !== "string") return null;
  const normalized = name.trim();
  const match = normalized.match(/^table\s*(\d+)$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : parsed;
};

const setCors = (res: Response): void => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

const deleteDocRefs = async (refs: FirebaseFirestore.DocumentReference[]): Promise<void> => {
  if (refs.length === 0) return;
  for (const refsBatch of chunk(refs, 450)) {
    const batch = db.batch();
    refsBatch.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
};

const renumberOutletTables = async (outletId: string, deletedTableId?: string): Promise<void> => {
  if (!outletId) return;
  const tablesSnap = await db.collection("outlets").doc(outletId).collection("tables").get();
  const numberedTables = tablesSnap.docs
    .filter((doc) => doc.id !== deletedTableId && readString(doc.data()?.name).toLowerCase() !== "counter")
    .map((doc) => ({ref: doc.ref, currentName: readString(doc.data()?.name), parsedNumber: extractTableNumber(doc.data()?.name) ?? Number.MAX_SAFE_INTEGER, createdAtMillis: typeof doc.data()?.createdAt?.toMillis === "function" ? doc.data().createdAt.toMillis() : 0}))
    .sort((a, b) => a.parsedNumber - b.parsedNumber || a.createdAtMillis - b.createdAtMillis || a.currentName.localeCompare(b.currentName, undefined, {numeric: true, sensitivity: "base"}));

  const batch = db.batch();
  numberedTables.forEach((table, index) => {
    const nextName = `Table ${index + 1}`;
    if (table.currentName !== nextName) batch.update(table.ref, {name: nextName, updatedAt: FieldValue.serverTimestamp()});
  });
  batch.set(db.collection("outletTableCounters").doc(outletId), {outletId, latestTableNumber: numberedTables.length, updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  await batch.commit();
};

export const deleteTable = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(200).send(""); return;
  }

  try {
    if (req.method !== "DELETE") {
      res.status(405).json({success: false, message: "Method not allowed"}); return;
    }
    const {tableId, outletId: inputOutletId} = req.body;
    if (!tableId) {
      res.status(400).json({success: false, message: "tableId is required"}); return;
    }

    let tableRef = null;
    let outletId = inputOutletId || "";
    if (outletId) {
      tableRef = db.collection("outlets").doc(outletId).collection("tables").doc(tableId);
    } else {
      const querySnap = await db.collectionGroup("tables").where("id", "==", tableId).limit(1).get();
      if (!querySnap.empty) {
        tableRef = querySnap.docs[0].ref;
        outletId = querySnap.docs[0].data()?.outletId || "";
      }
    }

    if (!tableRef) {
      res.status(404).json({success: false, message: "Table not found"}); return;
    }

    const sessionsSnap = await db.collection("outlets").doc(outletId).collection("sessions").where("tableId", "==", tableId).get();
    const sessionRefs = sessionsSnap.docs.map((doc) => doc.ref);
    const sessionIds = sessionsSnap.docs.map((doc) => doc.id);

    const ordersByTableSnap = await db.collection("outlets").doc(outletId).collection("orders").where("tableId", "==", tableId).get();
    const orderRefMap = new Map<string, FirebaseFirestore.DocumentReference>();
    ordersByTableSnap.docs.forEach((doc) => orderRefMap.set(doc.id, doc.ref));
    for (const idsBatch of chunk(sessionIds, 10)) {
      const ordersBySessionSnap = await db.collection("outlets").doc(outletId).collection("orders").where("sessionId", "in", idsBatch).get();
      ordersBySessionSnap.docs.forEach((doc) => orderRefMap.set(doc.id, doc.ref));
    }

    const orderRefs = Array.from(orderRefMap.values());
    await deleteDocRefs([tableRef, ...sessionRefs, ...orderRefs]);
    await renumberOutletTables(outletId, tableId);

    res.status(200).json({success: true, message: "Table deleted successfully and remaining tables renumbered", deleted: {tables: 1, sessions: sessionRefs.length, orders: orderRefs.length}});
  } catch (error) {
    console.error("deleteTable error:", error);
    res.status(500).json({success: false, message: "Internal server error"});
  }
});
