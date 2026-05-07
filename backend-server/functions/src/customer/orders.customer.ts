import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { calculateSubtotal } from "../utils/pricing";
import { applyOffer } from "../utils/offers";
import { applyTax } from "../utils/tax";

interface InputItem {
  productId: string;
  qty: number;
  variations?: unknown[];
  customizations?: unknown[];
  offerId?: string;
}

interface PersistedOrderItem {
  productId: string;
  name: string;
  basePrice: number;
  qty: number;
  variations: unknown[];
  customizations: unknown[];
  priceBreakdown: {
    basePrice: number;
    addonsTotal: number;
    finalUnitPrice: number;
  };
  finalUnitPrice: number;
  totalPrice: number;
  createdBy: string;
  addedAt: unknown;
  offerId?: string | null;
}

const setCors = (res: Response): void => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

const readNumberish = (value: unknown): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const flattenForPrices = (value: unknown): number[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenForPrices(entry));
  }

  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const ownPrice = ["price", "amount", "extraPrice", "additionalPrice"]
      .map((key) => readNumberish(objectValue[key]))
      .filter((price) => price > 0);

    const nested = Object.values(objectValue).flatMap((entry) => flattenForPrices(entry));
    return ownPrice.concat(nested);
  }

  return [];
};

const resolveAddonsTotal = (variations: unknown[] = [], customizations: unknown[] = []): number => {
  const prices = flattenForPrices(variations).concat(flattenForPrices(customizations));
  return prices.reduce((sum, price) => sum + price, 0);
};

const sanitizeQty = (qty: unknown): number => {
  const value = Number(qty);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
};

const toDateSafe = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as any)?.toDate === "function") {
    try { return (value as any).toDate(); } catch { return null; }
  }
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const readNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const getOfferLimit = (offerData: any, key: string): number => {
  return readNumber(offerData[key], readNumber(offerData.userRules?.[key], 0));
};

const isOfferCurrentlyValid = (offerData: Record<string, unknown>): boolean => {
  if (!offerData.isActive) return false;
  const now = new Date();
  const start = toDateSafe(offerData.startDate);
  const end = toDateSafe(offerData.endDate);
  if (start && now < start) return false;
  if (end && now > end) return false;

  const usageLimit = getOfferLimit(offerData, "usageLimit");
  const usedCount = readNumber(offerData.usedCount, 0);
  console.log(`[OFFER_VALIDATION] [Global] usageLimit=${usageLimit}, usedCount=${usedCount}`);
  if (usageLimit > 0 && usedCount >= usageLimit) {
    console.log(`[OFFER_VALIDATION] [Global] ❌ Limit reached (${usedCount}/${usageLimit})`);
    return false;
  }

  return true;
};


export const addItemsToOrder = functions.https.onRequest(
  async (req: Request, res: Response): Promise<void> => {
    const db = admin.firestore();
    setCors(res);

    if (req.method === "OPTIONS") {
      res.status(200).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ success: false, message: "Method not allowed" });
      return;
    }

    try {
      const { sessionId, items, offerId, userId, guestId } = req.body as {
        sessionId?: string;
        items?: InputItem[];
        offerId?: string;
        userId?: string;
        guestId?: string;
      };

      const actorId = (userId || guestId || "").trim();
      if (!sessionId || !Array.isArray(items) || items.length === 0 || !actorId) {
        res.status(400).json({
          success: false,
          message: "sessionId, items and userId or guestId are required",
        });
        return;
      }

      const transactionResult = await db.runTransaction(async (tx) => {
        const orderQuery = db.collection("orders").where("sessionId", "==", sessionId).limit(1);
        const orderQuerySnap = await tx.get(orderQuery);

        if (orderQuerySnap.empty) {
          throw new Error("ORDER_NOT_FOUND");
        }

        const orderDoc = orderQuerySnap.docs[0];
        const orderRef = orderDoc.ref;
        const orderData = orderDoc.data();

        if (orderData.status !== "ACTIVE") {
          throw new Error("ORDER_NOT_ACTIVE");
        }

        const nextOfferId = offerId ?? (orderData.offerId ? String(orderData.offerId) : null);
        const newItems: PersistedOrderItem[] = [];

        for (const incomingItem of items) {
          const qty = sanitizeQty(incomingItem.qty);
          if (!incomingItem?.productId || qty <= 0) {
            throw new Error("INVALID_ITEM_PAYLOAD");
          }

          const productRef = db.collection("products").doc(incomingItem.productId);
          const productSnap = await tx.get(productRef);
          if (!productSnap.exists) {
            throw new Error(`PRODUCT_NOT_FOUND:${incomingItem.productId}`);
          }

          const productData = productSnap.data() || {};
          const basePrice = readNumberish(productData.price);
          const variations = Array.isArray(incomingItem.variations) ? incomingItem.variations : [];
          const customizations = Array.isArray(incomingItem.customizations) ? incomingItem.customizations : [];
          const addonsTotal = resolveAddonsTotal(variations, customizations);
          const finalUnitPrice = basePrice + addonsTotal;
          const totalPrice = finalUnitPrice * qty;

          newItems.push({
            productId: incomingItem.productId,
            name: String(productData.name || "Unknown Product"),
            basePrice,
            qty,
            variations,
            customizations,
            priceBreakdown: {
              basePrice,
              addonsTotal,
              finalUnitPrice,
            },
            finalUnitPrice,
            totalPrice,
            createdBy: actorId,
            addedAt: FieldValue.serverTimestamp(),
            offerId: incomingItem.offerId || nextOfferId || null,
          });
        }

        const existingItems = Array.isArray(orderData.items)
          ? (orderData.items as PersistedOrderItem[])
          : [];

        const mergedItems = existingItems.concat(newItems);
        const subtotal = calculateSubtotal(mergedItems);

        let appliedOffers: Array<{ offerId: string; title: string; type: string; amount: number }> = [];
        let discount = 0;

        if (nextOfferId) {
          const offerRef = db.collection("offers").doc(nextOfferId);
          const offerSnap = await tx.get(offerRef);
          if (!offerSnap.exists) {
            throw new Error("OFFER_NOT_FOUND");
          }

          const offerData = offerSnap.data();
          if (!offerData) {
            throw new Error("OFFER_NOT_FOUND");
          }

          if (!isOfferCurrentlyValid(offerData)) {
            throw new Error("OFFER_EXPIRED");
          }
          
          // perUserLimit: default to 1 if not set (missing = 1 per user)
          const rawPerUserLimit = getOfferLimit(offerData, "perUserLimit");
          const perUserLimit = rawPerUserLimit > 0 ? rawPerUserLimit : 1;
          console.log(`[OFFER_VALIDATION] [PerUser] userId=${userId || 'GUEST'}, offer=${nextOfferId}, limit=${perUserLimit} (raw=${rawPerUserLimit})`);
          if (userId) {
            // 1. FETCH CURRENT SESSION USAGE
            const activeOrdersSnap = await tx.get(db.collection("orders").where("sessionId", "==", sessionId));
            let currentUsage = 0;
            
            activeOrdersSnap.docs.forEach(doc => {
              if (doc.id === orderRef.id) return; // skip current order, we'll check existingItems
              const data = doc.data();
              const dItems = Array.isArray(data.items) ? data.items : [];
              dItems.forEach((item: any) => {
                if (item.offerId === nextOfferId) {
                  if (item.items && Array.isArray(item.items)) {
                    currentUsage += item.items.length;
                  } else {
                    currentUsage += 1;
                  }
                }
              });
            });

            existingItems.forEach((item: any) => {
              if (item.offerId === nextOfferId) {
                if (item.items && Array.isArray(item.items)) {
                  currentUsage += item.items.length;
                } else {
                  currentUsage += 1;
                }
              }
            });

            // 2. COUNT NEW ITEMS IN REQUEST
            let newUsage = 0;
            for (const item of items) {
              if (item.offerId === nextOfferId || nextOfferId) {
                if ((item as any).items && Array.isArray((item as any).items)) {
                  newUsage += (item as any).items.length;
                } else {
                  newUsage += 1;
                }
              }
            }

            // 3. FETCH PAST USAGE
            const userSnap = await tx.get(db.collection("users").doc(userId));
            const pastUsage = readNumber((userSnap.data()?.usedOffers || {})[nextOfferId], 0);
            console.log(`[OFFER_VALIDATION] [PerUser] user_path=users/${userId}, pastUsage=${pastUsage}`);

            // 4. FINAL VALIDATION
            const totalUsage = pastUsage + currentUsage + newUsage;
            console.log(`[OFFER_VALIDATION] [PerUser] check: pastUsage=${pastUsage}, currentUsage=${currentUsage}, newUsage=${newUsage}, totalUsage=${totalUsage}, limit=${perUserLimit}`);
            if (totalUsage > perUserLimit) {
              console.log(`[OFFER_VALIDATION] [PerUser] ❌ Limit reached for user=${userId} on offer=${nextOfferId} (${totalUsage}/${perUserLimit})`);
              throw new Error("LIMIT_REACHED");
            }
          } else {
            console.log(`[OFFER_VALIDATION] [PerUser] ⚠️ Validation skipped: userId is missing (GUEST user)`);
          }

          const offerResult = applyOffer(
            {
              outletId: String(orderData.outletId || ""),
              items: mergedItems,
              subtotal,
            },
            {
              id: offerSnap.id,
              ...offerData,
            }
          );

          discount = offerResult.discount;
          appliedOffers = offerResult.appliedOffers;
        }

        const taxableAmount = Math.max(subtotal - discount, 0);
        const tax = applyTax(taxableAmount);
        const total = taxableAmount + tax;

        tx.update(orderRef, {
          items: mergedItems,
          offerId: nextOfferId,
          appliedOffers,
          pricing: {
            subtotal,
            discount,
            tax,
            total,
          },
          updatedAt: FieldValue.serverTimestamp(),
        });

        return {
          orderId: orderRef.id,
          pricing: {
            subtotal,
            discount,
            tax,
            total,
          },
          appliedOffers,
          itemsCount: mergedItems.length,
        };
      });

      res.status(200).json({
        success: true,
        ...transactionResult,
      });
      return;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "ORDER_NOT_FOUND") {
          res.status(404).json({ success: false, message: "Order not found for session" });
          return;
        }

        if (error.message === "ORDER_NOT_ACTIVE") {
          res.status(409).json({ success: false, message: "Order is not active" });
          return;
        }

        if (error.message === "OFFER_NOT_FOUND") {
          res.status(404).json({ success: false, message: "Offer not found" });
          return;
        }

        if (error.message === "OFFER_EXPIRED") {
          res.status(400).json({ success: false, message: "Offer is no longer active or has expired" });
          return;
        }

        if (error.message === "LIMIT_REACHED") {
          res.status(400).json({ success: false, message: "You have reached the maximum usage for this offer" });
          return;
        }

        if (error.message === "INVALID_ITEM_PAYLOAD") {
          res.status(400).json({ success: false, message: "Invalid items payload" });
          return;
        }

        if (error.message.startsWith("PRODUCT_NOT_FOUND:")) {
          const productId = error.message.split(":")[1] || "";
          res.status(404).json({ success: false, message: `Product not found: ${productId}` });
          return;
        }
      }

      console.error("addItemsToOrder error:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
      return;
    }
  }
);
