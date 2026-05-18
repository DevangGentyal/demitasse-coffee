import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import * as bcrypt from "bcryptjs";
import { handleCustomerPreflight } from "../customer/cors";

export const updateCancellationPassword = functions.https.onRequest(
  async (req: Request, res: Response): Promise<void> => {
    const db = admin.firestore();
    if (handleCustomerPreflight(req, res)) return;

    if (req.method !== "POST") {
      res.status(405).json({ success: false, message: "Method not allowed" });
      return;
    }

    // 1. Authenticate user
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ success: false, message: "Unauthorized: Missing token" });
      return;
    }

    const token = authHeader.split("Bearer ")[1];
    try {
      await admin.auth().verifyIdToken(token);
    } catch (err) {
      res.status(401).json({ success: false, message: "Unauthorized: Invalid token" });
      return;
    }

    try {
      const { password, newPassword } = req.body as { password?: string; newPassword?: string };
      const nextPassword = password || newPassword;

      if (!nextPassword || typeof nextPassword !== "string" || nextPassword.trim() === "") {
        res.status(400).json({
          success: false,
          message: "Password is required and cannot be empty",
        });
        return;
      }

      // 2. Hash and store password
      const saltRounds = 10;
      const passkeyHash = bcrypt.hashSync(nextPassword, saltRounds);

      const passwordRef = db.collection("secureOrderCancellationAccess").doc("main");
      await passwordRef.set({
        passkeyHash,
      });

      res.status(200).json({
        success: true,
        message: "Cancellation password updated successfully",
      });
      return;
    } catch (error) {
      console.error("updateCancellationPassword error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
      return;
    }
  }
);
