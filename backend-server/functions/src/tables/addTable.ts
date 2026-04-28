import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

const extractTableNumber = (name: unknown): number | null => {
  if (typeof name !== "string") return null;
  const normalized = name.trim();
  const match = normalized.match(/^table\s*(\d+)$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const getSmallestAvailableNumber = (usedNumbers: Set<number>): number => {
  let candidate = 1;
  while (usedNumbers.has(candidate)) {
    candidate += 1;
  }
  return candidate;
};

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

      const { outletId, name, capacity, x, y, color, autoGenerateName } = req.body;

      if (!outletId) {
        res.status(400).json({ success: false, message: "outletId is required" });
        return;
      }

      const tableRef = db.collection("tables").doc();
      const sanitizedName = typeof name === "string" ? name.trim() : "";
      const shouldAutoGenerate = Boolean(autoGenerateName) || !sanitizedName;

      const result = await db.runTransaction(async (tx) => {
        let resolvedName = sanitizedName;

        if (shouldAutoGenerate) {
          const tablesQuery = db.collection("tables").where("outletId", "==", outletId);
          const tablesSnap = await tx.get(tablesQuery);

          const usedNumbers = new Set<number>();
          tablesSnap.docs.forEach((tableDoc) => {
            const data = tableDoc.data() || {};
            if (String(data.name || "").trim().toLowerCase() === "counter") return;
            const parsed = extractTableNumber(data.name);
            if (parsed !== null) usedNumbers.add(parsed);
          });

          const nextTableNumber = getSmallestAvailableNumber(usedNumbers);

          resolvedName = `Table ${nextTableNumber}`;

          const counterRef = db.collection("outletTableCounters").doc(outletId);
          tx.set(counterRef, {
            outletId,
            latestTableNumber: nextTableNumber,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }

        const tableData = {
          id: tableRef.id,
          outletId,
          name: resolvedName,
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

        tx.set(tableRef, tableData);

        return {
          id: tableRef.id,
          name: resolvedName,
        };
      });

      res.status(201).json({
        success: true,
        id: result.id,
        name: result.name,
        message: "Table added successfully",
      });
    } catch (error) {
      console.error("addTable error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
);
