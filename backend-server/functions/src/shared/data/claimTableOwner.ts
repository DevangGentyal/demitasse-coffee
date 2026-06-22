import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {Request, Response} from "express";

const db = admin.firestore();

const setCors = (res: Response): void => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

const verifyToken = async (req: Request): Promise<admin.auth.DecodedIdToken> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing token");
  }

  const token = authHeader.slice("Bearer ".length);
  return admin.auth().verifyIdToken(token);
};

export const claimTableOwner = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({success: false, message: "Method not allowed"});
    return;
  }

  try {
    const decoded = await verifyToken(req);
    const {tableId} = req.body || {};
    if (!tableId || typeof tableId !== "string") {
      res.status(400).json({success: false, message: "tableId is required"});
      return;
    }

    let tableRef = null;
    let ownerId = decoded.uid;
    let assigned = false;

    const tableQuery = await db.collectionGroup("tables").where("id", "==", tableId).limit(1).get();
    if (!tableQuery.empty) {
      tableRef = tableQuery.docs[0].ref;
    }

    if (!tableRef) {
      res.status(404).json({success: false, message: "Table not found"});
      return;
    }

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(tableRef!);
      if (!snap.exists) {
        throw new Error("Table not found");
      }

      const data = snap.data() || {};
      if (data.owner) {
        ownerId = data.owner;
        assigned = false;
        return;
      }

      tx.update(tableRef!, {
        owner: decoded.uid,
        ownerAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      assigned = true;
      ownerId = decoded.uid;
    });

    res.status(200).json({success: true, assigned, ownerId});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message === "Missing token" ? 401 : message.includes("required") || message === "Table not found" ? 400 : 500;
    res.status(status).json({success: false, message});
  }
});
