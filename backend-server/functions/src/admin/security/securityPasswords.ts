import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {Request, Response} from "express";
import {FieldValue} from "firebase-admin/firestore";
import * as bcrypt from "bcryptjs";

const db = admin.firestore();

const setCors = (res: Response): void => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

const verifyToken = async (req: Request): Promise<admin.auth.DecodedIdToken> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) throw new Error("Missing token");
  return admin.auth().verifyIdToken(authHeader.slice("Bearer ".length));
};

const normalizeSecurityName = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const isAdminUser = async (uid: string): Promise<boolean> => {
  const adminSnap = await db.collection("admin").doc(uid).get();
  if (adminSnap.exists) return true;
  const userSnap = await db.collection("users").doc(uid).get();
  return userSnap.exists && String(userSnap.data()?.role || "").toLowerCase() === "admin";
};

export const updateOutletRegistrationPassword = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).send(""); return;
  }
  if (req.method !== "POST") {
    res.status(405).json({success: false, message: "Method not allowed"}); return;
  }

  try {
    const decoded = await verifyToken(req);
    if (!(await isAdminUser(decoded.uid))) {
      res.status(403).json({success: false, message: "Forbidden: Admin only"}); return;
    }

    const {currentPassword, newPassword} = req.body || {};
    if (!newPassword || typeof newPassword !== "string" || newPassword.trim() === "") {
      res.status(400).json({success: false, message: "newPassword is required"}); return;
    }

    const securityRef = db.collection("securityPasswords").doc("outletRegister");
    const securitySnap = await securityRef.get();
    if (securitySnap.exists) {
      const existingHash = securitySnap.data()?.password;
      if (!currentPassword || typeof currentPassword !== "string" || !bcrypt.compareSync(currentPassword, existingHash)) {
        res.status(401).json({success: false, message: "Current password is incorrect"}); return;
      }
    }

    const hash = bcrypt.hashSync(newPassword, bcrypt.genSaltSync(10));
    await securityRef.set({
      name: "outletRegister",
      password: hash,
      createdAt: securitySnap.exists ? securitySnap.data()?.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    res.status(200).json({success: true, message: "Registration password updated"});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    res.status(message === "Missing token" ? 401 : 500).json({success: false, message});
  }
});

export const upsertSecurityPassword = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).send(""); return;
  }
  if (req.method !== "POST") {
    res.status(405).json({success: false, message: "Method not allowed"}); return;
  }

  try {
    const decoded = await verifyToken(req);
    if (!(await isAdminUser(decoded.uid))) {
      res.status(403).json({success: false, message: "Forbidden: Admin only"}); return;
    }

    const {name, currentPassword, newPassword} = req.body || {};
    const securityName = normalizeSecurityName(name);
    if (!securityName) {
      res.status(400).json({success: false, message: "name is required"}); return;
    }
    if (!newPassword || typeof newPassword !== "string" || newPassword.trim() === "") {
      res.status(400).json({success: false, message: "newPassword is required"}); return;
    }

    const ref = db.collection("securityPasswords").doc(securityName);
    const snap = await ref.get();
    if (snap.exists) {
      const existingHash = snap.data()?.password;
      if (!currentPassword || typeof currentPassword !== "string" || !bcrypt.compareSync(currentPassword, existingHash)) {
        res.status(401).json({success: false, message: "Current password is incorrect"}); return;
      }
    }

    const hash = bcrypt.hashSync(newPassword, bcrypt.genSaltSync(10));
    await ref.set({
      name: securityName,
      password: hash,
      createdAt: snap.exists ? snap.data()?.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
    res.status(snap.exists ? 200 : 201).json({success: true, message: snap.exists ? "Security password updated" : "Security password created"});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    res.status(message === "Missing token" ? 401 : 500).json({success: false, message});
  }
});

export const getSecurityPasswordMeta = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).send(""); return;
  }
  if (req.method !== "GET") {
    res.status(405).json({success: false, message: "Method not allowed"}); return;
  }
  try {
    const decoded = await verifyToken(req);
    if (!(await isAdminUser(decoded.uid))) {
      res.status(403).json({success: false, message: "Forbidden: Admin only"}); return;
    }
    const name = normalizeSecurityName(req.query.name);
    if (!name) {
      res.status(400).json({success: false, message: "name is required"}); return;
    }
    const snap = await db.collection("securityPasswords").doc(name).get();
    res.status(200).json({success: true, data: snap.exists ? [{id: snap.id, name: snap.data()?.name || snap.id, exists: true, createdAt: snap.data()?.createdAt || null, updatedAt: snap.data()?.updatedAt || null}] : []});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    res.status(message === "Missing token" ? 401 : 500).json({success: false, message});
  }
});

export const verifySecurityPassword = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).send(""); return;
  }
  if (req.method !== "POST") {
    res.status(405).json({success: false, message: "Method not allowed"}); return;
  }

  try {
    const {name, password} = req.body || {};
    const securityName = normalizeSecurityName(name);
    if (!securityName) {
      res.status(400).json({success: false, message: "name is required"}); return;
    }
    if (!password || typeof password !== "string") {
      res.status(400).json({success: false, message: "password is required"}); return;
    }

    const snap = await db.collection("securityPasswords").doc(securityName).get();
    if (!snap.exists) {
      res.status(404).json({success: false, message: "Security password not configured"});
      return;
    }

    const storedHash = snap.data()?.password;
    if (!storedHash || !bcrypt.compareSync(password, storedHash)) {
      res.status(401).json({success: false, message: "Invalid security password"});
      return;
    }

    res.status(200).json({success: true, message: "Security password verified"});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({success: false, message});
  }
});
