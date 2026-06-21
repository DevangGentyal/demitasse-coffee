import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

const setCorsHeaders = (res: Response) => {
	res.set("Access-Control-Allow-Origin", "*");
	res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
	res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

const verifyAuth = async (req: Request): Promise<string | null> => {
	const authHeader = req.headers.authorization;
	if (!authHeader?.startsWith("Bearer ")) return null;
	try {
		const token = authHeader.split("Bearer ")[1];
		const decoded = await admin.auth().verifyIdToken(token);
		return decoded.uid;
	} catch {
		return null;
	}
};

// ── CREATE ─────────────────────────────────────────────────────────
export const billingPrinterConfigCreate = functions.https.onRequest(
	async (req: Request, res: Response): Promise<void> => {
		setCorsHeaders(res);
		if (req.method === "OPTIONS") { res.status(200).send(""); return; }

		try {
			if (req.method !== "POST") {
				res.status(405).json({ success: false, message: "Method not allowed" });
				return;
			}

			const uid = await verifyAuth(req);
			if (!uid) {
				res.status(401).json({ success: false, message: "User must be authenticated" });
				return;
			}

			const { outletId, printerConfig } = req.body;

			if (!outletId) {
				res.status(400).json({ success: false, message: "Outlet ID is required" });
				return;
			}

			if (!printerConfig || !printerConfig.printerName || !printerConfig.role) {
				res.status(400).json({ success: false, message: "Printer name and role are required" });
				return;
			}

			const docRef = db
				.collection("outlets")
				.doc(outletId)
				.collection("printerConfigs")
				.doc();

			const data = {
				...printerConfig,
				id: docRef.id,
				enabled: printerConfig.enabled ?? true,
				createdAt: FieldValue.serverTimestamp(),
				updatedAt: FieldValue.serverTimestamp(),
			};

			await docRef.set(data);

			res.status(201).json({
				success: true,
				message: "Printer config created",
				data: { id: docRef.id, ...data },
			});
		} catch (error) {
			console.error("[billingPrinterConfigCreate] Error:", error);
			res.status(500).json({ success: false, message: "Failed to create printer config" });
		}
	}
);

// ── UPDATE ─────────────────────────────────────────────────────────
export const billingPrinterConfigUpdate = functions.https.onRequest(
	async (req: Request, res: Response): Promise<void> => {
		setCorsHeaders(res);
		if (req.method === "OPTIONS") { res.status(200).send(""); return; }

		try {
			if (req.method !== "PUT") {
				res.status(405).json({ success: false, message: "Method not allowed" });
				return;
			}

			const uid = await verifyAuth(req);
			if (!uid) {
				res.status(401).json({ success: false, message: "User must be authenticated" });
				return;
			}

			const { printerId, updates, outletId } = req.body;

			if (!printerId || !updates) {
				res.status(400).json({ success: false, message: "Printer ID and updates are required" });
				return;
			}

			if (!outletId) {
				res.status(400).json({ success: false, message: "Outlet ID is required" });
				return;
			}

			const docRef = db
				.collection("outlets")
				.doc(outletId)
				.collection("printerConfigs")
				.doc(printerId);

			const updateData = {
				...updates,
				updatedAt: FieldValue.serverTimestamp(),
			};

			await docRef.set(updateData, { merge: true });

			res.status(200).json({
				success: true,
				message: "Printer config updated",
				data: { id: printerId, ...updateData },
			});
		} catch (error) {
			console.error("[billingPrinterConfigUpdate] Error:", error);
			res.status(500).json({ success: false, message: "Failed to update printer config" });
		}
	}
);

// ── DELETE ─────────────────────────────────────────────────────────
export const billingPrinterConfigDelete = functions.https.onRequest(
	async (req: Request, res: Response): Promise<void> => {
		setCorsHeaders(res);
		if (req.method === "OPTIONS") { res.status(200).send(""); return; }

		try {
			if (req.method !== "DELETE") {
				res.status(405).json({ success: false, message: "Method not allowed" });
				return;
			}

			const uid = await verifyAuth(req);
			if (!uid) {
				res.status(401).json({ success: false, message: "User must be authenticated" });
				return;
			}

			const { printerId, outletId } = req.body;

			if (!printerId) {
				res.status(400).json({ success: false, message: "Printer ID is required" });
				return;
			}

			let docRef: admin.firestore.DocumentReference | null = null;

			if (outletId) {
				docRef = db
					.collection("outlets")
					.doc(outletId)
					.collection("printerConfigs")
					.doc(printerId);
			} else {
				const querySnap = await db
					.collectionGroup("printerConfigs")
					.where("id", "==", printerId)
					.limit(1)
					.get();

				if (!querySnap.empty) {
					docRef = querySnap.docs[0].ref;
				}
			}

			if (!docRef) {
				res.status(404).json({ success: false, message: "Printer config not found" });
				return;
			}

			await docRef.delete();

			res.status(200).json({
				success: true,
				message: "Printer config deleted",
			});
		} catch (error) {
			console.error("[billingPrinterConfigDelete] Error:", error);
			res.status(500).json({ success: false, message: "Failed to delete printer config" });
		}
	}
);