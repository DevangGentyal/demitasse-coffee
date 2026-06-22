import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {Timestamp} from "firebase-admin/firestore";
import {Request, Response} from "express";
import {
  setCors,
  verifyAdminToken,
  readString,
  readNumber,
} from "./helpers";

const db = admin.firestore();
const REPORT_TIME_ZONE = "Asia/Kolkata";

type Cancellation = {
	id: string;
	outletId: string;
	custId: string;
	billerId: string;
	totalOrdersCost: number;
	cancelledAtMillis: number;
	dateKey: string;
	displayDate: string;
	reason: string;
};

const dateKeyInIST = (date: Date): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string): string => parts.find((entry) => entry.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const displayDateInIST = (date: Date): string => date.toLocaleDateString("en-GB", {
  timeZone: REPORT_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const parseISTDateInput = (value: string, edge: "start" | "end"): Timestamp | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = edge === "start" ? "00:00:00.000" : "23:59:59.999";
  const parsed = new Date(`${value}T${time}+05:30`);
  if (Number.isNaN(parsed.getTime()) || dateKeyInIST(parsed) !== value) return null;
  return Timestamp.fromDate(parsed);
};

export const getCancelOrderReport = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).send(""); return;
  }
  if (req.method !== "GET") {
    res.status(405).json({success: false, message: "Method not allowed"}); return;
  }

  const decodedToken = await verifyAdminToken(req, res);
  if (!decodedToken) return;

  try {
    const outletId = readString(req.query.outletId);
    const startDate = readString(req.query.startDate);
    const endDate = readString(req.query.endDate);

    const startTimestamp = parseISTDateInput(startDate, "start");
    const endTimestamp = parseISTDateInput(endDate, "end");

    // Fetch all outlets for friendly name lookup
    const outletsSnap = await db.collection("outlets").get();
    const outlets = outletsSnap.docs.map((doc) => ({
      id: doc.id,
      name: readString(doc.data().name || doc.id),
    }));

    // Build cancellation query
    let query: admin.firestore.Query;
    if (outletId) {
      query = db.collection("outlets").doc(outletId).collection("orderCancel");
    } else {
      query = db.collectionGroup("orderCancel");
    }
    if (startTimestamp) {
      query = query.where("cancelledAt", ">=", startTimestamp);
    }
    if (endTimestamp) {
      query = query.where("cancelledAt", "<=", endTimestamp);
    }

    const snap = await query.get();
    const timestampedCancellations: Cancellation[] = [];
    snap.docs.forEach((doc) => {
      const data = doc.data();
      const cancelledAt = data.cancelledAt as Timestamp | undefined;
      if (!cancelledAt || typeof cancelledAt.toDate !== "function") return;

      const dateObj = cancelledAt.toDate();
      timestampedCancellations.push({
        id: doc.id,
        outletId: readString(data.outletId || "unknown"),
        custId: readString(data.custId),
        billerId: readString(data.billerId),
        totalOrdersCost: readNumber(data.totalOrdersCost || data.totalCost, 0),
        cancelledAtMillis: dateObj.getTime(),
        dateKey: dateKeyInIST(dateObj),
        displayDate: displayDateInIST(dateObj),
        reason: readString(data.closeReason || data.reason || "No reason given"),
      });
    });
    const cancellations = timestampedCancellations
      .filter((c) => !outletId || c.outletId === outletId)
      .sort((a, b) => b.cancelledAtMillis - a.cancelledAtMillis);

    // Unique dates in the cancellation dataset, sorted descending
    const uniqueDates = Array.from(new Set(cancellations.map((c) => c.dateKey))).sort((a, b) => b.localeCompare(a));

    // Identify which outlets are represented in the filters or dataset
    const representedMissingOutlets = cancellations
      .filter((c) => !outlets.some((o) => o.id === c.outletId))
      .reduce<Array<{ id: string; name: string }>>((missing, c) => {
        if (!missing.some((o) => o.id === c.outletId)) missing.push({id: c.outletId, name: c.outletId});
        return missing;
      }, []);
    const filteredOutlets = outletId ?
      [outlets.find((o) => o.id === outletId) || {id: outletId, name: outletId}] :
      [...outlets, ...representedMissingOutlets];

    // 1. Columns structure
    const columns = [
      {header: "Date", key: "date"},
      ...filteredOutlets.map((o) => ({header: o.name, key: o.id})),
    ];

    // 2. Cancellation Quantity Matrix Rows
    const qtyRows: Record<string, any>[] = uniqueDates.map((dKey) => {
      const displayDate = displayDateInIST(new Date(`${dKey}T00:00:00+05:30`));
      const row: Record<string, any> = {date: displayDate, _dateKey: dKey};
      filteredOutlets.forEach((o) => {
        row[o.id] = 0;
      });
      return row;
    });

    // 3. Cancellation Amount Matrix Rows
    const amtRows: Record<string, any>[] = uniqueDates.map((dKey) => {
      const displayDate = displayDateInIST(new Date(`${dKey}T00:00:00+05:30`));
      const row: Record<string, any> = {date: displayDate, _dateKey: dKey};
      filteredOutlets.forEach((o) => {
        row[o.id] = 0;
      });
      return row;
    });

    // Populate Matrix values
    cancellations.forEach((c) => {
      const qtyRow = qtyRows.find((r) => r._dateKey === c.dateKey);
      if (qtyRow && qtyRow[c.outletId] !== undefined) {
        qtyRow[c.outletId] += 1;
      }

      const amtRow = amtRows.find((r) => r._dateKey === c.dateKey);
      if (amtRow && amtRow[c.outletId] !== undefined) {
        amtRow[c.outletId] = Math.round((amtRow[c.outletId] + c.totalOrdersCost) * 100) / 100;
      }
    });

    // Clean date keys used for sorting
    qtyRows.forEach((r) => delete r._dateKey);
    amtRows.forEach((r) => delete r._dateKey);

    // Calculate total cancellation counts/sums for summaries
    const totalCanceledCount = cancellations.length;
    const totalCanceledValue = cancellations.reduce((sum, c) => sum + c.totalOrdersCost, 0);

    res.status(200).json({
      success: true,
      metadata: {
        generatedAt: new Date().toISOString(),
      },
      filters: {
        outletId,
        startDate,
        endDate,
      },
      summary: {
        totalCanceledCount,
        totalCanceledValue: Math.round(totalCanceledValue * 100) / 100,
      },
      columns,
      rows: cancellations.map((c) => {
        const outlet = outlets.find((o) => o.id === c.outletId);
        return {
          id: c.id,
          date: c.displayDate,
          outlet: outlet ? outlet.name : c.outletId,
          custId: c.custId,
          billerId: c.billerId,
          amount: c.totalOrdersCost,
          reason: c.reason,
        };
      }),
      charts: {
        qtyMatrix: qtyRows,
        amtMatrix: amtRows,
      },
    });
  } catch (error) {
    console.error("getCancelOrderReport error:", error);
    res.status(500).json({success: false, message: "Internal server error", error: String(error)});
  }
});
