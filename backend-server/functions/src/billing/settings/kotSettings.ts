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

export const billingKotSettingsSave = functions.https.onRequest(
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

			const { outletId, settings } = req.body;

			if (!outletId) {
				res.status(400).json({ success: false, message: "Outlet ID is required" });
				return;
			}

			if (!settings || typeof settings !== "object") {
				res.status(400).json({ success: false, message: "Settings object is required" });
				return;
			}

			const docRef = db
				.collection("outlets")
				.doc(outletId)
				.collection("kotBillingSettings")
				.doc("defaultSettings");

			const updateData = {
				...settings,
				outletId,
				updatedAt: FieldValue.serverTimestamp(),
			};

			await docRef.set(updateData, { merge: true });

			res.status(200).json({
				success: true,
				message: "KOT billing settings saved",
				data: updateData,
			});
		} catch (error) {
			console.error("[billingKotSettingsSave] Error:", error);
			res.status(500).json({ success: false, message: "Failed to save KOT settings" });
		}
	}
);