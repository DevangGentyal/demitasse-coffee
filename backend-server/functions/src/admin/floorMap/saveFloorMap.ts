import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

export const saveFloorMap = functions.https.onRequest(
	async (req: Request, res: Response): Promise<void> => {
		res.set("Access-Control-Allow-Origin", "*");
		res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
		res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

		if (req.method === "OPTIONS") {
			res.status(200).send("");
			return;
		}

		try {
			if (req.method !== "POST") {
				res.status(405).json({ success: false, message: "Method not allowed" });
				return;
			}

			const { outletId, walls, tablePositions } = req.body;
			if (!outletId) {
				res.status(400).json({ success: false, message: "outletId is required" });
				return;
			}

			const floorMapRef = db.collection("outlets").doc(outletId).collection("floorMap").doc("layout");
			await floorMapRef.set({ outletId, walls: walls || [], tablePositions: tablePositions || [], updatedAt: FieldValue.serverTimestamp() }, { merge: true });

			res.status(200).json({ success: true, message: "Floor map layout saved successfully" });
		} catch (error) {
			console.error("saveFloorMap error:", error);
			res.status(500).json({ success: false, message: "Internal server error" });
		}
	}
);
