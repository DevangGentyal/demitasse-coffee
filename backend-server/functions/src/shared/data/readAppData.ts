import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import {Request, Response} from "express";
import {FieldPath} from "firebase-admin/firestore"; // ← add this import

const db = admin.firestore();

const setCors = (res: Response): void => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const verifyToken = async (req: Request): Promise<admin.auth.DecodedIdToken> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing token");
  }

  const token = authHeader.slice("Bearer ".length);
  return admin.auth().verifyIdToken(token);
};

const mapDoc = (docSnap: FirebaseFirestore.QueryDocumentSnapshot): Record<string, unknown> => ({
  id: docSnap.id,
  ...docSnap.data(),
});

const normalizeStatus = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
};

const listCollection = async (collectionName: string, fieldName?: string, fieldValue?: string) => {
  let queryRef: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = db.collection(collectionName);
  if (fieldName && fieldValue) {
    queryRef = queryRef.where(fieldName, "==", fieldValue);
  }
  const snapshot = await queryRef.get();
  return snapshot.docs.map(mapDoc);
};

const readResource = async (resource: string, params: URLSearchParams, uid: string) => {
  switch (resource) {
  case "outlets": {
    const outletsSnap = await db.collection("outlets").get();
    const outletsData = await Promise.all(
      outletsSnap.docs.map(async (doc) => {
        const outlet = mapDoc(doc);
        const detailsSnap = await db.collection("outlets").doc(doc.id).collection("outletDetails").limit(1).get();
        const details = detailsSnap.empty ? {} : detailsSnap.docs[0].data();
        return {...outlet, ...details, id: doc.id};
      })
    );
    return outletsData;
  }
  case "outletDetails": {
    const outletId = readString(params.get("outletId"));
    if (!outletId) throw new Error("outletId is required");
    let snap = await db.collection("outlets").doc(outletId).collection("outletDetails").limit(1).get();
    if (snap.empty) {
      snap = await db.collection("outlets").doc(outletId).collection("outletDetails").limit(1).get();
    }
    return snap.empty ? [] : [{id: snap.docs[0].id, ...snap.docs[0].data()}];
  }
  case "outletById": {
    const outletId = readString(params.get("outletId"));
    if (!outletId) throw new Error("outletId is required");
    const snap = await db.collection("outlets").doc(outletId).get();
    return snap.exists ? [{id: snap.id, ...snap.data()}] : [];
  }
  case "products": {
    const outletId = readString(params.get("outletId"));
    if (!outletId) throw new Error("outletId is required");
    const snapshot = await db.collection("outlets").doc(outletId).collection("products").get();
    return snapshot.docs.map(mapDoc);
  }
  case "productById": {
    const productId = readString(params.get("productId"));
    if (!productId) throw new Error("productId is required");
    const outletId = readString(params.get("outletId"));
    if (!outletId) throw new Error("Outlet context required");
    const snap = await db.collection("outlets").doc(outletId).collection("products").doc(productId).get();
    return snap.exists ? [{id: snap.id, ...snap.data()}] : [];
  }
  case "offers": {
    let totalOrders = 0;
    if (uid) {
      try {
        const userSnap = await db.collection("users").doc(uid).get();
        const userOutletId = userSnap.data()?.outletId || userSnap.data()?.outletID;
        if (userOutletId) {
          const ordersQuery = await db.collection("outlets").doc(userOutletId).collection("orders").where("customerId", "==", uid).count().get();
          totalOrders = ordersQuery.data().count;
        }
      } catch (err) {
        console.error("Failed to fetch totalOrders for offers:", err);
      }
    }

    let offers: any[] = [];
    const outletId = readString(params.get("outletId"));
    if (!outletId) throw new Error("Outlet context required");

    const outletOffersSnap = await db.collection("outlets").doc(outletId).collection("offers").get();
    offers = outletOffersSnap.docs.map(mapDoc);

    // Backend Enforcement: Hide registration offers if user has already placed orders
    return offers.filter((offer) => {
      const isActive = offer.isActive !== false;
      const usageLimit = Number(offer.usageLimit || 0);
      const usedCount = Number(offer.usedCount || 0);

      if (!isActive || (usageLimit > 0 && usedCount >= usageLimit)) {
        return false;
      }

      const offerKind = String(offer.offerType || offer.type || "").toUpperCase();
      const isRegistration = offer.userRules?.firstOrderOnly === true ||
					offer.applicableFor === "new_user" ||
					["NEW_USER", "FIRSTORDER", "REGISTRATION"].includes(offerKind) ||
					offer.category === "registration";

      if (isRegistration && totalOrders > 0) {
        return false;
      }
      return true;
    });
  }
  case "offerById": {
    const offerId = readString(params.get("offerId"));
    if (!offerId) throw new Error("offerId is required");
    const outletId = readString(params.get("outletId"));
    if (!outletId) throw new Error("Outlet context required");
    const snap = await db.collection("outlets").doc(outletId).collection("offers").doc(offerId).get();
    return snap.exists ? [{id: snap.id, ...snap.data()}] : [];
  }
  case "tables": {
    const outletId = readString(params.get("outletId"));
    if (!outletId) throw new Error("outletId is required");
    const snapshot = await db.collection("outlets").doc(outletId).collection("tables").get();
    return snapshot.docs.map(mapDoc);
  }
  case "tableById": {
    const tableId = readString(params.get("tableId"));
    if (!tableId) throw new Error("tableId is required");
    const outletId = readString(params.get("outletId"));
    if (!outletId) throw new Error("Outlet context required");
    const snap = await db.collection("outlets").doc(outletId).collection("tables").doc(tableId).get();
    return snap.exists ? [{id: snap.id, ...snap.data()}] : [];
  }
  case "orders": {
    const outletId = readString(params.get("outletId"));
    if (!outletId) throw new Error("outletId is required");
    const snapshot = await db.collection("outlets").doc(outletId).collection("orders").get();
    return snapshot.docs.map(mapDoc);
  }
  case "orderById": {
    const orderId = readString(params.get("orderId"));
    if (!orderId) throw new Error("orderId is required");
    const outletId = readString(params.get("outletId"));

    // 1. Try active orders under specific outletId
    if (outletId) {
      const snap = await db.collection("outlets").doc(outletId).collection("orders").doc(orderId).get();
      if (snap.exists) return [{id: snap.id, ...snap.data()}];
    }

    // 2. Try collectionGroup active orders
    const querySnap = await db.collectionGroup("orders").where(FieldPath.documentId(), "==", orderId).limit(1).get();
    if (!querySnap.empty) return [{id: querySnap.docs[0].id, ...querySnap.docs[0].data()}];

    // 3. Try collectionGroup archived ordersHistory (subcollection under outlets)
    const historySnap = await db.collectionGroup("ordersHistory").where(FieldPath.documentId(), "==", orderId).limit(1).get();
    if (!historySnap.empty) return [{id: historySnap.docs[0].id, ...historySnap.docs[0].data()}];

    // 4. Try root archived ordersHistory collection
    const rootHistorySnap = await db.collection("ordersHistory").doc(orderId).get();
    if (rootHistorySnap.exists) return [{id: rootHistorySnap.id, ...rootHistorySnap.data()}];

    return [];
  }
  case "sessionOrders": {
    const outletId = readString(params.get("outletId"));
    const tableId = readString(params.get("tableId"));
    const sessionId = readString(params.get("sessionId"));

    if (!outletId) throw new Error("outletId is required");
    if (!tableId) throw new Error("tableId is required");
    if (!sessionId) throw new Error("sessionId is required");

    const tableRef = db.collection("outlets").doc(outletId).collection("tables").doc(tableId);
    const tableSnap = await tableRef.get();
    if (!tableSnap.exists) {
      throw new Error("Table not found under outlet");
    }
    const tableData = tableSnap.data() || {};

    const activeSessionId = readString(tableData.activeSessionId);
    if (activeSessionId !== sessionId) {
      throw new Error("Session is not active on this table");
    }

    const snapshot = await db.collection("outlets").doc(outletId).collection("orders")
      .where("sessionId", "==", sessionId)
      .get();
    return snapshot.docs.map(mapDoc);
  }
  case "checkGoogleUser": {
    const email = readString(params.get("email"));
    if (!email) throw new Error("email is required");
    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      const isGoogle = userRecord.providerData.some((p) => p.providerId === "google.com");
      return [{isGoogle}];
    } catch (e) {
      return [{isGoogle: false}];
    }
  }
  case "ordersHistory": {
    const ownerId = readString(params.get("ownerId")) || readString(params.get("customerId"));
    if (!ownerId) throw new Error("ownerId or customerId is required");
    const querySnap = await db.collection("ordersHistory").where("ownerId", "==", ownerId).get();
    return querySnap.docs.map(mapDoc);
  }
  case "failedPayments": {
    const userId = readString(params.get("userId"));
    if (userId) {
      const querySnap = await db.collectionGroup("failedPayments").where("userId", "==", userId).get();
      return querySnap.docs.map(mapDoc);
    }
    const querySnap = await db.collectionGroup("failedPayments").get();
    return querySnap.docs.map(mapDoc);
  }
  case "successPayments": {
    const userId = readString(params.get("userId"));
    if (userId) {
      const querySnap = await db.collectionGroup("successPayments").where("userId", "==", userId).get();
      return querySnap.docs.map(mapDoc);
    }
    const querySnap = await db.collectionGroup("successPayments").get();
    return querySnap.docs.map(mapDoc);
  }
  case "sessionById": {
    const sessionId = readString(params.get("sessionId"));
    if (!sessionId) throw new Error("sessionId is required");
    const querySnap = await db.collectionGroup("sessions").where(FieldPath.documentId(), "==", sessionId).limit(1).get();
    return querySnap.empty ? [] : [{id: querySnap.docs[0].id, ...querySnap.docs[0].data()}];
  }
  case "floorMap": {
    const outletId = readString(params.get("outletId"));
    if (!outletId) throw new Error("outletId is required");
    const snap = await db.collection("outlets").doc(outletId).collection("floorMap").doc("layout").get();
    return snap.exists ? [{id: snap.id, ...snap.data()}] : [];
  }
  case "currentUser": {
    let snap = await db.collection("admin").doc(uid).get();
    if (snap.exists) {
      return [{id: snap.id, role: "admin", ...snap.data()}];
    }
    snap = await db.collection("users").doc(uid).get();
    if (snap.exists) {
      const data = snap.data() || {};
      const resolvedOutletId = data.outletId || data.outletID || "";

      const ordersQuery = resolvedOutletId ?
        await db.collection("outlets").doc(resolvedOutletId).collection("orders").where("customerId", "==", uid).count().get() :
        {data: () => ({count: 0})};
      const totalOrders = ordersQuery.data().count;

      return [{id: snap.id, ...data, outletId: resolvedOutletId, outletID: resolvedOutletId, totalOrders}];
    }
    snap = await db.collection("outlets").doc(uid).get();
    if (snap.exists) {
      return [{id: snap.id, role: "outlet", outletID: snap.id, outletId: snap.id, ...snap.data()}];
    }
    return [];
  }
  case "pendingOutlets": {
    const snapshot = await db.collectionGroup("outletDetails").get();
    return snapshot.docs
      .map(mapDoc)
      .filter((outlet) => normalizeStatus(outlet.status) === "pending");
  }
  case "securityPasswords":
    return listCollection("securityPasswords").then((items) =>
      items.map(({password, ...rest}) => rest)
    );
  case "userById": {
    const userId = readString(params.get("userId"));
    if (!userId) throw new Error("userId is required");
    const snap = await db.collection("users").doc(userId).get();
    return snap.exists ? [{id: snap.id, ...snap.data()}] : [];
  }
  default:
    throw new Error(`Unsupported resource: ${resource}`);
  }
};

export const readAppData = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({success: false, message: "Method not allowed"});
    return;
  }

  try {
    const resource = readString(req.query.resource);
    if (!resource) {
      res.status(400).json({success: false, message: "resource is required"});
      return;
    }

    const publicResources = ["outlets", "outletById", "outletDetailsById", "tables", "tableById", "products", "productById", "offers", "offerById", "sessionOrders", "checkGoogleUser"];
    const isPublic = publicResources.includes(resource);

    let decoded: admin.auth.DecodedIdToken | null = null;
    if (!isPublic) {
      decoded = await verifyToken(req);
    } else {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          decoded = await verifyToken(req);
        } catch (error) {
          console.warn("Failed to verify token for public resource:", error);
        }
      }
    }

    const params = new URLSearchParams();
    Object.entries(req.query).forEach(([key, value]) => {
      if (typeof value === "string") {
        params.set(key, value);
      }
    });

    const data = await readResource(resource, params, decoded?.uid || "");
    if (resource === "offers") {
      console.log("[BACKEND DEBUG] Offers fetched:", data.map((o) => ({id: o.id, title: o.title, imageUrl: o.imageUrl})));
    }
    res.status(200).json({success: true, data});
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message === "Missing token" ? 401 : message.includes("required") || message.startsWith("Unsupported resource") ? 400 : 500;
    res.status(status).json({success: false, message});
  }
});
