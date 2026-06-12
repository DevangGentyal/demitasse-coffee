import * as admin from "firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { Request, Response } from "express";
import { resolveOrderStatus } from "../../shared/utilities/orders/orderStatus";

const db = admin.firestore();

export const setCors = (res: Response): void => {
	res.set("Access-Control-Allow-Origin", "*");
	res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
	res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

export const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
export const readNumber = (value: unknown, fallback = 0): number => { const numeric = Number(value); return Number.isFinite(numeric) ? numeric : fallback; };

export const toDateSafe = (value: unknown): Date | null => {
	if (!value) return null;
	if (value instanceof Date) return value;
	if (typeof (value as { toDate?: () => Date })?.toDate === "function") {
		try { return (value as { toDate: () => Date }).toDate(); } catch { return null; }
	}
	const parsed = new Date(String(value));
	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
export const endOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

export const parseDateInput = (value?: string, edge: "start" | "end" = "start"): Timestamp | null => {
	if (!value) return null;
	const parsed = new Date(`${value}T00:00:00`);
	if (Number.isNaN(parsed.getTime())) return null;
	const date = edge === "start" ? startOfDay(parsed) : endOfDay(parsed);
	return Timestamp.fromDate(date);
};

export const verifyAdminToken = async (req: Request, res: Response): Promise<admin.auth.DecodedIdToken | null> => {
	const authHeader = req.headers.authorization;
	if (!authHeader || !authHeader.startsWith("Bearer ")) {
		res.status(401).json({ success: false, message: "Unauthorized: Missing token" });
		return null;
	}
	const token = authHeader.split("Bearer ")[1];
	try {
		const decodedToken = await admin.auth().verifyIdToken(token);
		return decodedToken;
	} catch (error) {
		res.status(401).json({ success: false, message: "Unauthorized: Invalid token" });
		return null;
	}
};

export const resolveLifecycleStatus = (order: FirebaseFirestore.DocumentData): "success" | "canceled" => {
	const status = resolveOrderStatus(order);
	if (status.includes("CANCEL")) return "canceled";
	if (status.includes("SUCCESS") || status.includes("COMPLETE") || status.includes("CLOSE") || status.includes("FINAL") || status.includes("PAID")) return "success";
	const paymentStatus = readString(order.paymentStatus).toLowerCase();
	if (paymentStatus.includes("cancel")) return "canceled";
	if (paymentStatus.includes("success") || paymentStatus.includes("complete") || paymentStatus.includes("close") || paymentStatus.includes("final") || paymentStatus.includes("paid")) return "success";
	return "success";
};

export const resolvePaymentType = (order: FirebaseFirestore.DocumentData): string => {
	const directPayment = readString(order.paymentType || order.paymentMethod || order.paymentMode || order.payAt || order.settlementStatus);
	if (directPayment) return directPayment;
	return "NA";
};

export const resolveRestaurantName = (outlet: FirebaseFirestore.DocumentData | null, order: FirebaseFirestore.DocumentData): string => {
	return readString(order.restaurant) || readString(outlet?.name) || readString(order.outletName) || readString(order.outletId) || "Demitasse";
};

export const distributeAmount = (target: number, base: number, total: number): number => {
	if (!Number.isFinite(target) || !Number.isFinite(base) || !Number.isFinite(total) || base <= 0 || total <= 0) return 0;
	return Math.round((target * base / total) * 100) / 100;
};

export const fetchDocById = async (collectionName: string, id: string): Promise<FirebaseFirestore.DocumentData | null> => {
	const resolvedId = readString(id);
	if (!resolvedId) return null;
	const snapshot = await db.collection(collectionName).doc(resolvedId).get();
	return snapshot.exists ? snapshot.data() || null : null;
};
