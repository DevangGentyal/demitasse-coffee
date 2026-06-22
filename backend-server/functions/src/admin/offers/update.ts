import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";

const readString = (value: unknown): string => String(value ?? "").trim();
const readNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const readPositiveInt = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

const parseOfferDateInput = (value: unknown, fieldName: string): Date => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) throw new Error(`${fieldName} is required`);

    // Preserve date-only inputs as UTC midnight for deterministic storage.
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const parsed = new Date(`${raw}T00:00:00.000Z`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  if (value && typeof value === "object") {
    const secondsRaw = (value as { seconds?: unknown; _seconds?: unknown }).seconds ?? (value as { seconds?: unknown; _seconds?: unknown })._seconds;
    const seconds = Number(secondsRaw);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000);
  }

  throw new Error(`Invalid ${fieldName}`);
};

const dateFromFirestoreLike = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (value && typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (value && typeof value === "object") {
    const secondsRaw = (value as { seconds?: unknown; _seconds?: unknown }).seconds ?? (value as { seconds?: unknown; _seconds?: unknown })._seconds;
    const seconds = Number(secondsRaw);
    if (Number.isFinite(seconds)) return new Date(seconds * 1000);
  }
  return null;
};

const normalizeOfferType = (value: unknown): string => {
  const offerType = readString(value).toUpperCase();
  if (offerType === "BOGO" || offerType === "FREEBIE") return "B1G1";
  if (offerType === "CATEGORY_DISCOUNT") return "DISCOUNT";
  return offerType;
};

const normalizeComboGroups = (combo: any): any[] => {
  if (!Array.isArray(combo)) return [];
  return combo.map((group) => ({
    categoryName: readString(group?.categoryName) || null,
    groupName: readString(group?.groupName) || "Group",
    isFree: !!group?.isFree,
    selectionType: group?.selectionType === "MULTIPLE" ? "MULTIPLE" : "ONE",
    items: Array.isArray(group?.items) ?
      group.items.map((item: any) => ({
        productId: readString(item?.productId),
        isCustomizable: !!item?.isCustomizable,
      })) :
      [],
  }));
};

const flattenComboProductIds = (groups: any[]): string[] => Array.from(new Set(
  (groups || []).flatMap((group) => Array.isArray(group?.items) ? group.items.map((item: any) => readString(item?.productId)).filter(Boolean) : []),
));

const normalizeOfferConfig = (type: string, config: any, existingData: any) => {
  const normalizedType = normalizeOfferType(type);
  if (normalizedType === "COMBO") {
    const comboSource = config?.combo ?? existingData?.config?.combo;
    const comboGroups = normalizeComboGroups(Array.isArray(comboSource?.groups) ? comboSource.groups : Array.isArray(comboSource) ? comboSource : []);
    const comboProductIds = Array.isArray(comboSource?.productIds) ? comboSource.productIds.map((id: unknown) => readString(id)).filter(Boolean) : flattenComboProductIds(comboGroups);
    return {
      combo: {
        productIds: comboProductIds,
        groups: comboGroups,
        comboPrice: readNumber(comboSource?.comboPrice ?? config?.comboPrice ?? existingData?.config?.combo?.comboPrice ?? existingData?.config?.comboPrice, 0),
      },
      b1g1: null,
      discount: null,
      freeItem: null,
      loyalty: null,
    };
  }

  if (normalizedType === "B1G1") {
    const b1g1Source = config?.b1g1 ?? existingData?.config?.b1g1;
    return {
      combo: null,
      comboPrice: null,
      b1g1: {
        productIds: Array.isArray(b1g1Source?.productIds ?? b1g1Source?.applicableProductIds) ?
          (b1g1Source?.productIds ?? b1g1Source?.applicableProductIds).map((id: unknown) => readString(id)).filter(Boolean) :
          [],
        type: readString(b1g1Source?.type) || "CHEAPEST_FREE",
      },
      discount: null,
      freeItem: null,
      loyalty: null,
    };
  }

  if (normalizedType === "DISCOUNT") {
    const discountSource = config?.discount ?? existingData?.config?.discount;
    const discountType = readString((discountSource?.mode ?? discountSource?.type) || "PRODUCT").toUpperCase();
    const discountValue = readNumber(discountSource?.discountValue ?? existingData?.config?.discount?.discountValue, 0);
    return {
      combo: null,
      comboPrice: null,
      b1g1: null,
      discount: {
        mode: discountType === "CATEGORY" ? "CATEGORY" : "PRODUCT",
        productIds: Array.isArray(discountSource?.productIds ?? existingData?.config?.discount?.productIds) ?
          (discountSource?.productIds ?? existingData?.config?.discount?.productIds).map((id: unknown) => readString(id)).filter(Boolean) :
          [],
        categoryName: readString(discountSource?.categoryName ?? discountSource?.category ?? existingData?.config?.discount?.categoryName ?? existingData?.config?.discount?.category) || null,
        discountValue,
      },
      freeItem: null,
      loyalty: null,
    };
  }

  return config ?? existingData?.config ?? null;
};

export const updateOffer = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(200).send(""); return;
  }

  try {
    const db = admin.firestore();
    if (req.method !== "PUT" && req.method !== "PATCH") {
      res.status(405).json({success: false, message: "Method not allowed"}); return;
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const data = body;
    if (!data.offerId) {
      res.status(400).json({success: false, message: "offerId is required"}); return;
    }

    let offerRef = null;
    const outletId = data.outletId || "";
    if (outletId) {
      offerRef = db.collection("outlets").doc(outletId).collection("offers").doc(data.offerId);
    } else {
      const querySnap = await db.collectionGroup("offers").where(admin.firestore.FieldPath.documentId(), "==", data.offerId).limit(1).get();
      if (!querySnap.empty) {
        offerRef = querySnap.docs[0].ref;
      }
    }

    if (!offerRef) {
      res.status(404).json({success: false, message: "Offer not found"});
      return;
    }
    const offerSnap = await offerRef.get();
    if (!offerSnap.exists) {
      res.status(404).json({success: false, message: "Offer not found"}); return;
    }

    const existingData = offerSnap.data();
    if (data.type || data.offerType) {
      const resolvedType = normalizeOfferType(data.offerType || data.type);
      if (!["DISCOUNT", "B1G1", "COMBO", "BIRTHDAY", "NEW_USER"].includes(resolvedType)) {
        res.status(400).json({success: false, message: "Invalid offerType"}); return;
      }
      data.type = resolvedType;
      data.offerType = resolvedType;
    }
    const finalType = data.offerType || data.type || existingData?.offerType || existingData?.type;

    if (finalType === "DISCOUNT") {
      const existingDiscount = existingData?.config?.discount || {};
      const incomingDiscount = data.config?.discount || {};
      const rawDiscVal = incomingDiscount.discountValue ?? existingDiscount.discountValue;
      const discVal = typeof rawDiscVal === "string" ? parseFloat(rawDiscVal) : rawDiscVal;
      if (typeof discVal !== "number" || isNaN(discVal) || discVal <= 0 || discVal > 100) {
        res.status(400).json({success: false, message: "Invalid discount value. Must be a number between 1 and 100."}); return;
      }
      if (data.config?.discount) data.config.discount.discountValue = discVal;
    }

    const updateData: any = {updatedAt: FieldValue.serverTimestamp()};
    if (data.startDate !== undefined) updateData.startDate = parseOfferDateInput(data.startDate, "startDate");
    if (data.endDate !== undefined) updateData.endDate = parseOfferDateInput(data.endDate, "endDate");

    const nextStartDate = data.startDate !== undefined ?
      updateData.startDate :
      dateFromFirestoreLike(existingData?.startDate);
    const nextEndDate = data.endDate !== undefined ?
      updateData.endDate :
      dateFromFirestoreLike(existingData?.endDate);
    if (nextStartDate && nextEndDate && nextStartDate >= nextEndDate) {
      res.status(400).json({success: false, message: "startDate must be before endDate"});
      return;
    }
    if (data.title !== undefined) updateData.title = String(data.title).trim();
    if (data.description !== undefined) updateData.description = String(data.description);
    if (data.type !== undefined || data.offerType !== undefined) {
      updateData.offerType = finalType;
      updateData.type = FieldValue.delete();
    }
    if (data.category !== undefined || data.applicableCategory !== undefined) {
      const catVal = data.applicableCategory || data.category;
      if (finalType === "DISCOUNT") {
        updateData.category = catVal || existingData?.category || existingData?.applicableCategory || null;
      } else {
        updateData.category = FieldValue.delete();
      }
    }
    if (data.isActive !== undefined) updateData.isActive = !!data.isActive;
    if (data.autoApply !== undefined) updateData.autoApply = !!data.autoApply;
    if (data.isStackable !== undefined) updateData.isStackable = !!data.isStackable;
    if (data.priority !== undefined) updateData.priority = Number(data.priority);
    if (data.minOrderValue !== undefined) updateData.minOrderValue = Number(data.minOrderValue);
    if (data.usageLimit !== undefined) updateData.usageLimit = Number(data.usageLimit);

    if (data.config !== undefined && data.config !== null) updateData.config = normalizeOfferConfig(finalType, data.config, existingData);
    if (data.config === null) updateData.config = null;
    if (data.userRules != null) updateData.userRules = data.userRules;
    if (data.perUserLimit !== undefined) {
      const perUserLimitVal = readPositiveInt(data.perUserLimit);
      const base = existingData?.userRules && typeof existingData.userRules === "object" ? {...(existingData.userRules || {})} : {};
      if (perUserLimitVal !== null) base.perUserLimit = perUserLimitVal; else delete base.perUserLimit;
      updateData.userRules = base;
    }
    if (data.display != null) updateData.display = data.display;

    await offerRef.update(updateData);
    res.status(200).json({success: true, message: "Offer updated successfully"});
  } catch (error) {
    console.error("updateOffer error:", error);
    res.status(500).json({success: false, message: "Internal server error", error: error instanceof Error ? error.message : String(error)});
  }
});
