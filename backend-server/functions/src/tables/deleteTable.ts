import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";

const db = admin.firestore();

const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const extractTableNumber = (name: unknown): number | null => {
  if (typeof name !== "string") return null;
  const normalized = name.trim();
  const match = normalized.match(/^table\s*(\d+)$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const setCors = (res: Response): void => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const deleteDocRefs = async (refs: FirebaseFirestore.DocumentReference[]): Promise<void> => {
  if (refs.length === 0) return;

  const batches = chunk(refs, 450);
  for (const refsBatch of batches) {
    const batch = db.batch();
    refsBatch.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
};

const renumberOutletTables = async (outletId: string): Promise<void> => {
  if (!outletId) return;

  const tablesSnap = await db.collection("tables").where("outletId", "==", outletId).get();
  const numberedTables = tablesSnap.docs
    .filter((doc) => readString(doc.data()?.name).toLowerCase() !== "counter")
    .map((doc) => {
      const data = doc.data() || {};
      const parsedNumber = extractTableNumber(data.name);
      const createdAtMillis = typeof data.createdAt?.toMillis === "function" ? data.createdAt.toMillis() : 0;

      return {
        ref: doc.ref,
        currentName: readString(data.name),
        parsedNumber: parsedNumber ?? Number.MAX_SAFE_INTEGER,
        createdAtMillis,
      };
    })
    .sort((a, b) => {
      if (a.parsedNumber !== b.parsedNumber) return a.parsedNumber - b.parsedNumber;
      if (a.createdAtMillis !== b.createdAtMillis) return a.createdAtMillis - b.createdAtMillis;
      return a.currentName.localeCompare(b.currentName, undefined, { numeric: true, sensitivity: "base" });
    });

  const batch = db.batch();
  numberedTables.forEach((table, index) => {
    const nextName = `Table ${index + 1}`;
    if (table.currentName !== nextName) {
      batch.update(table.ref, {
        name: nextName,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

  const counterRef = db.collection("outletTableCounters").doc(outletId);
  batch.set(counterRef, {
    outletId,
    latestTableNumber: numberedTables.length,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await batch.commit();
};

export const deleteTable = functions.https.onRequest(
  async (req: Request, res: Response): Promise<void> => {
    setCors(res);

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
      const tableSnap = await tableRef.get();
      if (!tableSnap.exists) {
        res.status(404).json({ success: false, message: "Table not found" });
        return;
      }

      const outletId = readString(tableSnap.data()?.outletId);

      const sessionsSnap = await db.collection("sessions").where("tableId", "==", tableId).get();
      const sessionRefs = sessionsSnap.docs.map((doc) => doc.ref);
      const sessionIds = sessionsSnap.docs.map((doc) => doc.id);

      const ordersByTableSnap = await db.collection("orders").where("tableId", "==", tableId).get();
      const orderRefMap = new Map<string, FirebaseFirestore.DocumentReference>();
      ordersByTableSnap.docs.forEach((doc) => {
        orderRefMap.set(doc.id, doc.ref);
      });

      for (const idsBatch of chunk(sessionIds, 10)) {
        const ordersBySessionSnap = await db.collection("orders").where("sessionId", "in", idsBatch).get();
        ordersBySessionSnap.docs.forEach((doc) => {
          orderRefMap.set(doc.id, doc.ref);
        });
      }

      const orderRefs = Array.from(orderRefMap.values());
      const refsToDelete = [tableRef, ...sessionRefs, ...orderRefs];
      await deleteDocRefs(refsToDelete);
      await renumberOutletTables(outletId);

      res.status(200).json({
        success: true,
        message: "Table deleted successfully and remaining tables renumbered",
        deleted: {
          tables: 1,
          sessions: sessionRefs.length,
          orders: orderRefs.length,
        },
      });
    } catch (error) {
      console.error("deleteTable error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
);
