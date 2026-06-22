import * as admin from "firebase-admin";
import {OfferDocument} from "./offers/applyOffer";

const db = admin.firestore();

const readString = (value: unknown): string => String(value ?? "").trim();
const readNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

export interface CatalogProductDoc {
	id: string;
	price: number;
	name: string;
	category: string;
	subcategory: string;
	data: FirebaseFirestore.DocumentData;
}

const productCache = new Map<string, CatalogProductDoc | null>();
const offerCache = new Map<string, OfferDocument | null>();

export const validateRegistrationEligibility = async (uid: string, offerDocsById: Map<string, OfferDocument | null>): Promise<void> => {
  for (const offerDoc of offerDocsById.values()) {
    if (!offerDoc) continue;
    const offerKind = String(offerDoc.offerType || offerDoc.type || "").toUpperCase();
    const isRegistration = (offerDoc as any).userRules?.firstOrderOnly === true ||
			(offerDoc as any).applicableFor === "new_user" ||
			["NEW_USER", "FIRSTORDER", "REGISTRATION"].includes(offerKind) ||
			(offerDoc as any).category === "registration" ||
			(offerDoc as any).category === "REGISTRATION";

    if (isRegistration) {
      let totalOrders = 0;
      try {
        const activeCountSnap = await db.collectionGroup("orders").where("customerId", "==", uid).count().get();
        const historyCountSnap = await db.collectionGroup("ordersHistory").where("customerId", "==", uid).count().get();
        totalOrders = activeCountSnap.data().count + historyCountSnap.data().count;
      } catch (err: any) {
        if (err.code === 9 || err.message?.includes("index")) {
          const outletsSnap = await db.collection("outlets").get();
          for (const outlet of outletsSnap.docs) {
            const activeQ = await outlet.ref.collection("orders").where("customerId", "==", uid).count().get();
            const historyQ = await outlet.ref.collection("ordersHistory").where("customerId", "==", uid).count().get();
            totalOrders += activeQ.data().count + historyQ.data().count;
          }
        } else throw err;
      }

      if (totalOrders > 0) {
        throw new Error("Registration offer is only valid for your first order.");
      }
    }
  }
};

export const getProductDoc = async (productId: string, outletId?: string): Promise<CatalogProductDoc | null> => {
  const id = readString(productId);
  if (!id) return null;
  if (productCache.has(id)) return productCache.get(id) || null;

  let snapshot: FirebaseFirestore.DocumentSnapshot | null = null;
  if (outletId) {
    snapshot = await db.collection("outlets").doc(outletId).collection("products").doc(id).get();
  } else {
    const querySnap = await db.collectionGroup("products").where(admin.firestore.FieldPath.documentId(), "==", id).limit(1).get();
    snapshot = querySnap.empty ? null : querySnap.docs[0];
  }

  if (!snapshot || !snapshot.exists) {
    productCache.set(id, null);
    return null;
  }

  const data = snapshot.data() || {};
  const record: CatalogProductDoc = {
    id,
    price: readNumber(data.price, Number.NaN),
    name: readString(data.name),
    category: readString(data.category),
    subcategory: readString(data.subcategory),
    data,
  };
  productCache.set(id, record);
  return record;
};

export const getProductDocs = async (productIds: Iterable<string>, outletId?: string): Promise<Map<string, CatalogProductDoc>> => {
  const uniqueIds = Array.from(new Set(Array.from(productIds).map(readString).filter(Boolean)));
  const entries = await Promise.all(uniqueIds.map(async (id) => {
    const doc = await getProductDoc(id, outletId);
    return doc ? ([id, doc] as const) : null;
  }));
  return new Map(entries.filter((entry): entry is readonly [string, CatalogProductDoc] => Boolean(entry)) as Array<[string, CatalogProductDoc]>);
};

export const getOfferDoc = async (offerId: string, outletId?: string): Promise<OfferDocument | null> => {
  const id = readString(offerId);
  if (!id) return null;

  // Use a cache key that reflects the lookup scope so a global offer isn't
  // permanently cached as null from an outlet-scoped miss.
  const cacheKey = outletId ? `${outletId}::${id}` : id;
  if (offerCache.has(cacheKey)) return offerCache.get(cacheKey) || null;

  let snapshot: FirebaseFirestore.DocumentSnapshot | null = null;

  if (outletId) {
    // 1. Try outlet-specific collection first
    const outletSnap = await db.collection("outlets").doc(outletId).collection("offers").doc(id).get();
    if (outletSnap.exists) {
      snapshot = outletSnap;
    } else {
      // 2. Fall back to global 'offers' collection (e.g. registration offer)
      const globalSnap = await db.collection("offers").doc(id).get();
      if (globalSnap.exists) snapshot = globalSnap;
    }
  } else {
    const querySnap = await db.collectionGroup("offers").where(admin.firestore.FieldPath.documentId(), "==", id).limit(1).get();
    snapshot = querySnap.empty ? null : querySnap.docs[0];
  }

  if (!snapshot || !snapshot.exists) {
    offerCache.set(cacheKey, null);
    return null;
  }

  const data = {id: snapshot.id, ...(snapshot.data() || {})} as OfferDocument;
  offerCache.set(cacheKey, data);
  return data;
};

export const getOfferDocs = async (offerIds: Iterable<string>, outletId?: string): Promise<Map<string, OfferDocument>> => {
  const uniqueIds = Array.from(new Set(Array.from(offerIds).map(readString).filter(Boolean)));
  const entries = await Promise.all(uniqueIds.map(async (id) => {
    const doc = await getOfferDoc(id, outletId);
    return doc ? ([id, doc] as const) : null;
  }));
  return new Map(entries.filter((entry): entry is readonly [string, OfferDocument] => Boolean(entry)) as Array<[string, OfferDocument]>);
};
