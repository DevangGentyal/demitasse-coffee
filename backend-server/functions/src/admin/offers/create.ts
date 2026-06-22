import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {FieldValue} from "firebase-admin/firestore";

const validOfferTypes = ["DISCOUNT", "CATEGORY_DISCOUNT", "B1G1", "COMBO", "BIRTHDAY", "NEW_USER", "BOGO", "FREEBIE"] as const;

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

const normalizeOfferType = (value: unknown): string => {
  const offerType = readString(value).toUpperCase();
  if (offerType === "BOGO" || offerType === "FREEBIE") return "B1G1";
  if (offerType === "NEW_USER") return "NEW_USER";
  if (offerType === "CATEGORY_DISCOUNT") return "DISCOUNT";
  if (offerType === "DISCOUNT" || offerType === "B1G1" || offerType === "COMBO" || offerType === "BIRTHDAY") return offerType;
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

const normalizeOfferConfig = (type: string, config: any) => {
  const normalizedType = normalizeOfferType(type);
  if (normalizedType === "COMBO") {
    const comboSource = config?.combo;
    const comboGroups = normalizeComboGroups(Array.isArray(comboSource?.groups) ? comboSource.groups : Array.isArray(comboSource) ? comboSource : []);
    const comboProductIds = Array.isArray(comboSource?.productIds) ? comboSource.productIds.map((id: unknown) => readString(id)).filter(Boolean) : flattenComboProductIds(comboGroups);
    return {
      combo: {
        productIds: comboProductIds,
        groups: comboGroups,
        comboPrice: readNumber(comboSource?.comboPrice ?? config?.comboPrice, 0),
      },
      b1g1: null,
      discount: null,
      freeItem: null,
      loyalty: null,
    };
  }

  if (normalizedType === "B1G1") {
    return {
      combo: null,
      comboPrice: null,
      b1g1: {
        productIds: Array.isArray(config?.b1g1?.productIds ?? config?.b1g1?.applicableProductIds) ? (config?.b1g1?.productIds ?? config?.b1g1?.applicableProductIds).map((id: unknown) => readString(id)).filter(Boolean) : [],
        type: readString(config?.b1g1?.type) || "CHEAPEST_FREE",
      },
      discount: null,
      freeItem: null,
      loyalty: null,
    };
  }
  if (normalizedType === "BIRTHDAY") {
    return {
      combo: null,
      comboPrice: null,
      b1g1: null,
      discount: null,
      freeItems: {
        productIds: Array.isArray(config?.freeItems?.productIds) ?
          config.freeItems.productIds
            .map((id: unknown) => readString(id))
            .filter(Boolean) :
          [],
        minSelect: readNumber(config?.freeItems?.minSelect, 1),
        maxSelect: readNumber(config?.freeItem?.maxSelect, 1),
      },
      loyalty: null,
    };
  }

  if (normalizedType === "DISCOUNT") {
    const discountMode = readString(config?.discount?.mode || config?.discount?.type || "PRODUCT").toUpperCase();
    return {
      combo: null,
      comboPrice: null,
      b1g1: null,
      discount: {
        mode: discountMode === "CATEGORY" ? "CATEGORY" : "PRODUCT",
        productIds: Array.isArray(config?.discount?.productIds) ? config.discount.productIds.map((id: unknown) => readString(id)).filter(Boolean) : [],
        categoryName: readString(config?.discount?.categoryName || config?.discount?.category) || null,
        discountValue: readNumber(config?.discount?.discountValue, readNumber(config?.discountValue, 0)),
      },
      freeItem: null,
      loyalty: null,
    };
  }

  return {
    combo: config?.combo ? {
      productIds: Array.isArray(config?.combo?.productIds) ? config.combo.productIds.map((id: unknown) => readString(id)).filter(Boolean) : [],
      groups: Array.isArray(config?.combo?.groups) ? normalizeComboGroups(config.combo.groups) : null,
      comboPrice: readNumber(config?.combo?.comboPrice, 0),
    } : null,
    comboPrice: config?.combo?.comboPrice !== undefined ? readNumber(config.combo.comboPrice, 0) : null,
    b1g1: config?.b1g1 ? {
      productIds: Array.isArray(config?.b1g1?.productIds) ? config.b1g1.productIds.map((id: unknown) => readString(id)).filter(Boolean) : [],
      type: readString(config?.b1g1?.type) || "CHEAPEST_FREE",
    } : null,
    discount: config?.discount ? {
      mode: readString(config?.discount?.mode || config?.discount?.type || "PRODUCT").toUpperCase() === "CATEGORY" ? "CATEGORY" : "PRODUCT",
      productIds: Array.isArray(config?.discount?.productIds) ? config.discount.productIds.map((id: unknown) => readString(id)).filter(Boolean) : [],
      categoryName: readString(config?.discount?.categoryName || config?.discount?.category) || null,
      discountValue: readNumber(config?.discount?.discountValue, readNumber(config?.discountValue, 0)),
    } : null,
    freeItem: config?.freeItem ?? null,
    loyalty: config?.loyalty ?? null,
  };
};

export const createOffer = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, PATCH, DELETE");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(200).send(""); return;
  }

  try {
    const db = admin.firestore();
    if (req.method !== "POST") {
      res.status(405).json({success: false, message: "Method not allowed"}); return;
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const data = body;
    if (!data.outletId || !data.title || (!data.type && !data.offerType)) {
      res.status(400).json({success: false, message: "Missing required fields"}); return;
    }

    const offerType = normalizeOfferType(data.offerType || data.type);
    if (!validOfferTypes.includes(offerType as any)) {
      res.status(400).json({success: false, message: "Invalid offer type"}); return;
    }
    if (!["DISCOUNT", "B1G1", "COMBO", "BIRTHDAY", "NEW_USER"].includes(offerType)) {
      res.status(400).json({success: false, message: "Invalid offerType"}); return;
    }

    if (offerType === "DISCOUNT") {
      const rawDiscountVal = data.discountValue ?? data.config?.discount?.discountValue;
      const discountVal = readNumber(rawDiscountVal, NaN);
      if (typeof discountVal !== "number" || isNaN(discountVal) || discountVal <= 0 || discountVal > 100) {
        res.status(400).json({success: false, message: "Invalid discount value. Must be a number between 1 and 100."}); return;
      }
      data.discountValue = discountVal;
      if (data.config?.discount) data.config.discount.discountValue = discountVal;
    }

    const startDate = data.startDate ?
      parseOfferDateInput(data.startDate, "startDate") :
      null;

    const endDate = data.endDate ?
      parseOfferDateInput(data.endDate, "endDate") :
      null;

    // Only validate when both dates are present
    if (startDate && endDate && startDate >= endDate) {
      res.status(400).json({
        success: false,
        message: "startDate must be before endDate",
      });
      return;
    }

    const normalizedConfig = normalizeOfferConfig(offerType, data.config);
    const offerRef = db.collection("outlets").doc(data.outletId).collection("offers").doc();
    const category = offerType === "DISCOUNT" ?
      readString(data.category || data.applicableCategory) || null :
      null;
    // Normalize userRules to include perUserLimit if provided top-level
    const normalizedUserRules = data.userRules && typeof data.userRules === "object" ? {...(data.userRules || {})} : null;
    const perUserLimitVal = readPositiveInt(data.perUserLimit);


    await offerRef.set({
      id: offerRef.id,
      title: readString(data.title),
      description: readString(data.description),
      offerType,
      category,
      outletId: data.outletId,
      isActive: data.isActive ?? true,
      autoApply: !!data.autoApply,
      isStackable: !!data.isStackable,
      priority: Number(data.priority || 0),

      startDate, // null if not provided
      endDate, // null if not provided

      minOrderValue: Number(data.minOrderValue || 0),
      usageLimit: Number(data.usageLimit || 0),
      perUserLimit: perUserLimitVal,
      usedCount: 0,
      config: normalizedConfig,
      userRules: normalizedUserRules || null,
      display: data.display || null,
      offerMeta: {
        canonical: true,
        createdByAdmin: true,
      },
      createdAt: data.createdAt ?
        new Date(data.createdAt) :
        FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.status(201).json({success: true, message: "Offer created successfully", data: {offerId: offerRef.id}});
  } catch (error) {
    console.error("createOffer error:", error);
    res.status(500).json({success: false, message: "Internal server error", error: error instanceof Error ? error.message : String(error)});
  }
});
