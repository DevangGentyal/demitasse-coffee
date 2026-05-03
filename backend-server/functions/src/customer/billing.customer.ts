import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { calculateSubtotal } from "../utils/pricing";
import { applyTax } from "../utils/tax";
import { applyOffer } from "../utils/offers";

const db = admin.firestore();

interface OrderItem {
  productId: string;
  qty: number;
  totalPrice: number;
  finalUnitPrice?: number;
  createdBy?: string;
  name?: string;
  price?: number;
  quantity?: number;
}

const readString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const setCors = (res: Response): void => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
};

const readNumber = (value: unknown, fallback = 0): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const sanitizeOrderItems = (rawItems: unknown[]): OrderItem[] => {
  if (!Array.isArray(rawItems)) return [];

  return rawItems.map((item) => {
    const data = (item || {}) as Record<string, unknown>;
    const qty = Math.max(1, Math.floor(readNumber(data.qty ?? data.quantity, 1)));
    const unitPrice = readNumber(data.finalUnitPrice ?? data.price, 0);
    const explicitTotal = readNumber(data.totalPrice, NaN);
    const createdBy = readString(data.createdBy);

    const normalizedItem: OrderItem = {
      productId: String(data.productId || data.id || ""),
      name: String(data.name || ""),
      qty,
      quantity: qty,
      finalUnitPrice: unitPrice,
      price: unitPrice,
      totalPrice: Number.isFinite(explicitTotal) ? explicitTotal : unitPrice * qty,
    };

    if (createdBy) {
      normalizedItem.createdBy = createdBy;
    }

    return normalizedItem;
  });
};



const generateBillHandler = async (req: Request, res: Response): Promise<void> => {
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
    const { sessionId, tableId } = req.body as {
      sessionId?: string;
      tableId?: string;
    };

    if (!sessionId && !tableId) {
      res.status(400).json({ success: false, message: "sessionId or tableId is required" });
      return;
    }

    const result = await db.runTransaction(async (tx) => {
      // 1. Resolve all active orders for this session/table
      let candidates: FirebaseFirestore.QueryDocumentSnapshot[] = [];
      
      if (sessionId && tableId) {
        // Fetch by both to be extremely inclusive (merging results)
        const [sessionSnap, tableSnap] = await Promise.all([
          tx.get(db.collection("orders").where("sessionId", "==", sessionId)),
          tx.get(db.collection("orders").where("tableId", "==", tableId.toString()))
        ]);
        
        const map = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
        sessionSnap.docs.forEach(d => map.set(d.id, d));
        tableSnap.docs.forEach(d => map.set(d.id, d));
        candidates = Array.from(map.values());
      } else if (sessionId) {
        const snap = await tx.get(db.collection("orders").where("sessionId", "==", sessionId));
        candidates = snap.docs;
      } else if (tableId) {
        const snap = await tx.get(db.collection("orders").where("tableId", "==", tableId.toString()));
        candidates = snap.docs;
      } else {
        throw new Error("INSUFFICIENT_FILTERS");
      }

      // NOTE: Do NOT filter by ownerId here. Manager-placed orders (from floor map)
      // have a different ownerId or none at all. All orders for this session/table
      // must be included in the bill regardless of who placed them.

      // Filter out already archived or unrelated (though sessionId/tableId should be enough)
      candidates = candidates.filter(doc => {
        const data = doc.data();
        const status = String(data.status || "").toUpperCase();
        const oStatus = String(data.orderStatus || "").toLowerCase();
        // Include everything that isn't already archived in history
        return status !== "ARCHIVED" && oStatus !== "archived";
      });

      if (candidates.length === 0) {
        throw new Error("ORDER_NOT_FOUND");
      }

      // 2. Aggregate all items and find common outletId
      const allItems: OrderItem[] = [];
      let outletId = "";
      let primaryOrderDoc = candidates[0]; // Use the oldest or most significant one as primary reference

      for (const doc of candidates) {
        const data = doc.data();
        if (!outletId) outletId = String(data.outletId || "");
        const docItems = sanitizeOrderItems(Array.isArray(data.items) ? data.items : []);
        allItems.push(...docItems);
        
        // Pick the most recent order as primary for paymentId storage
        const curTime = readNumber((data.updatedAt as { toMillis?: () => number })?.toMillis?.(), 0)
          || readNumber((data.createdAt as { toMillis?: () => number })?.toMillis?.(), 0);
        const priTime = readNumber((primaryOrderDoc.data().updatedAt as { toMillis?: () => number })?.toMillis?.(), 0)
          || readNumber((primaryOrderDoc.data().createdAt as { toMillis?: () => number })?.toMillis?.(), 0);
        if (curTime > priTime) primaryOrderDoc = doc;
      }

      if (allItems.length === 0) {
        throw new Error("EMPTY_CART");
      }

      const subtotal = calculateSubtotal(allItems);
      
      // Note: Offers are trickier with aggregation. 
      // For now, we take the offer from the primary order if it exists.
      const savedOfferId = primaryOrderDoc.data().offerId ? String(primaryOrderDoc.data().offerId) : null;

      let discount = 0;
      let appliedOffers: Array<{ offerId: string; title: string; type: string; amount: number }> = [];

      if (savedOfferId) {
        const offerRef = db.collection("offers").doc(savedOfferId);
        const offerSnap = await tx.get(offerRef);

        if (offerSnap.exists) {
          const offerResult = applyOffer(
            {
              outletId,
              items: allItems,
              subtotal,
            },
            {
              id: offerSnap.id,
              ...(offerSnap.data() || {}),
            }
          );

          discount = offerResult.discount;
          appliedOffers = offerResult.appliedOffers;
        }
      }

      const taxableAmount = Math.max(subtotal - discount, 0);
      const tax = applyTax(taxableAmount);
      const total = Math.round(taxableAmount + tax);

      // 3. Return calculation results ONLY (NO DB writes as per requirement)
      return {
        orderId: primaryOrderDoc.id,
        sessionId: primaryOrderDoc.data().sessionId || null,
        tableId: primaryOrderDoc.data().tableId || null,
        items: allItems,
        pricing: {
          subtotal,
          discount,
          tax,
          total,
        },
        appliedOffers,
        noteToCustomer: "Your calculated bill is ready.",
      };
    });

    res.status(200).json({ success: true, ...result });
    return;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "ORDER_NOT_FOUND") {
        res.status(404).json({ success: false, message: "Order not found" });
        return;
      }

      if (error.message === "EMPTY_CART") {
        res.status(400).json({ success: false, message: "Cannot finalize empty order" });
        return;
      }
    }

    console.error("generateBill error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
    return;
  }
};

const closeSessionHandler = async (req: Request, res: Response): Promise<void> => {
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
    const { sessionId } = req.body as { sessionId?: string };

    if (!sessionId) {
      res.status(400).json({ success: false, message: "sessionId is required" });
      return;
    }

    const result = await db.runTransaction(async (tx) => {
      const sessionRef = db.collection("sessions").doc(sessionId);
      const sessionSnap = await tx.get(sessionRef);

      if (!sessionSnap.exists) {
        throw new Error("SESSION_NOT_FOUND");
      }

      const sessionData = sessionSnap.data() || {};
      const tableId = String(sessionData.tableId || "");

      // 1. Resolve all orders for this session
      const ordersSnap = await tx.get(db.collection("orders").where("sessionId", "==", sessionId));
      if (ordersSnap.empty) {
        throw new Error("ORDER_NOT_FOUND");
      }

      const candidates = ordersSnap.docs;
      const allItems: OrderItem[] = [];
      let outletId = "";
      let primaryOrderDoc = candidates[0];

      // Aggregate all items and find common outletId
      for (const doc of candidates) {
        const data = doc.data();
        if (!outletId) outletId = String(data.outletId || "");
        const docItems = sanitizeOrderItems(Array.isArray(data.items) ? data.items : []);
        allItems.push(...docItems);
        
        // Pick the most recent order as primary reference
        const curTime = readNumber((data.updatedAt as { toMillis?: () => number })?.toMillis?.(), 0)
          || readNumber((data.createdAt as { toMillis?: () => number })?.toMillis?.(), 0);
        const priTime = readNumber((primaryOrderDoc.data().updatedAt as { toMillis?: () => number })?.toMillis?.(), 0)
          || readNumber((primaryOrderDoc.data().createdAt as { toMillis?: () => number })?.toMillis?.(), 0);
        if (curTime > priTime) primaryOrderDoc = doc;
      }

      if (allItems.length === 0) {
        throw new Error("EMPTY_CART");
      }

      const subtotal = calculateSubtotal(allItems);
      const savedOfferId = primaryOrderDoc.data().offerId ? String(primaryOrderDoc.data().offerId) : null;

      let discount = 0;
      let appliedOffers: Array<{ offerId: string; title: string; type: string; amount: number }> = [];

      if (savedOfferId) {
        const offerRef = db.collection("offers").doc(savedOfferId);
        const offerSnap = await tx.get(offerRef);

        if (offerSnap.exists) {
          const offerResult = applyOffer(
            { outletId, items: allItems, subtotal },
            { id: offerSnap.id, ...(offerSnap.data() || {}) }
          );
          discount = offerResult.discount;
          appliedOffers = offerResult.appliedOffers;
        }
      }

      const taxableAmount = Math.max(subtotal - discount, 0);
      const tax = applyTax(taxableAmount);
      const total = Math.round(taxableAmount + tax);

      // 2. Create Final Payment (PERSISTENT step)
      const paymentRef = db.collection("payments").doc();
      const ownerId = readString(primaryOrderDoc.data().ownerId) || readString(sessionData.ownerId) || readString(primaryOrderDoc.data().userId) || null;
      
      const paymentPayload = {
        paymentId: paymentRef.id,
        orderId: primaryOrderDoc.id,
        allOrderIds: candidates.map(d => d.id),
        outletId,
        tableId: tableId || primaryOrderDoc.data().tableId || null,
        sessionId,
        ownerId,
        placedBy: "counter_close", // Indicates payment created on session close
        customer: {
          name: primaryOrderDoc.data().customerName || null,
          phone: primaryOrderDoc.data().customerPhone || null,
          userId: ownerId,
        },
        items: allItems,
        pricing: { subtotal, discount, tax, total },
        appliedOffers,
        paymentStatus: "PENDING_COUNTER",
        settlementStatus: "UNPAID",
        payAt: "COUNTER",
        generatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      tx.set(paymentRef, paymentPayload);

      // 3. Archive and Delete ALL orders
      const archiveTimestamp = FieldValue.serverTimestamp();
      for (const doc of candidates) {
        const orderData = doc.data();
        const historyRef = db.collection("ordersHistory").doc(doc.id);
        
        tx.set(historyRef, {
          orderId: doc.id,
          outletId: orderData.outletId || null,
          tableId: tableId || null,
          sessionId,
          placedBy: orderData.placedBy || null,
          ownerId,
          items: Array.isArray(orderData.items) ? orderData.items : [],
          orderLifecycleStatus: "COMPLETED",
          pricing: orderData.pricing || null,
          appliedOffers: Array.isArray(orderData.appliedOffers) ? orderData.appliedOffers : [],
          customer: {
            id: ownerId,
            name: orderData.customerName || null,
            phone: orderData.customerPhone || null,
          },
          startedAt: sessionData.startedAt || null,
          closedAt: archiveTimestamp,
          archivedAt: archiveTimestamp,
          source: "customer.closeSession",
          createdAt: orderData.createdAt || null,
          updatedAt: archiveTimestamp,
          paymentId: paymentRef.id,
        }, { merge: true });

        tx.delete(doc.ref);
      }

      // 4. Close Session
      tx.update(sessionRef, {
        status: "CLOSED",
        closedAt: archiveTimestamp,
        updatedAt: archiveTimestamp,
        totalAmount: total,
      });

      if (tableId) {
        const tableRef = db.collection("tables").doc(tableId);
        tx.update(tableRef, {
          isOccupied: false,
          activeSessionId: null,
          updatedAt: archiveTimestamp,
        });
      }

      // Increment used counts for applied offers
      if (appliedOffers.length > 0) {
        const userRef = ownerId ? db.collection("users").doc(ownerId) : null;
        for (const source of appliedOffers) {
          const offerRef = db.collection("offers").doc(source.offerId);
          tx.update(offerRef, { usedCount: FieldValue.increment(1) });
          
          if (userRef) {
            tx.set(userRef, {
              usedOffers: {
                [source.offerId]: FieldValue.increment(1)
              }
            }, { merge: true });
          }
        }
      }

      return {
        sessionId,
        paymentId: paymentRef.id,
      };
    });

    res.status(200).json({
      success: true,
      message: "Session closed successfully",
      ...result,
    });
    return;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "SESSION_NOT_FOUND") {
        res.status(404).json({ success: false, message: "Session not found" });
        return;
      }

      if (error.message === "ORDER_NOT_FOUND") {
        res.status(404).json({ success: false, message: "Order not found for session" });
        return;
      }

      if (error.message === "ORDER_NOT_FINALIZED") {
        res.status(409).json({ success: false, message: "Order must be finalized before session close" });
        return;
      }
    }

    console.error("closeSession error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
    return;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared cart validation logic (NO DB writes)
// ─────────────────────────────────────────────────────────────────────────────

interface CartItemInput {
  id: string;
  name?: string;
  price: number;
  qty: number;
  isCombo?: boolean;
  isManualB1G1?: boolean;
  isDiscount?: boolean;
  isBirthday?: boolean;
  isFree?: boolean;
  offerId?: string;
  comboPrice?: number;
  offerTitle?: string;
  originalPrice?: number;
  discountValue?: number;
  discountType?: string;
  variation?: Record<string, unknown>;
  addons?: Record<string, unknown>;
  offerType?: string;
  items?: Array<{
    productId: string;
    name?: string;
    price?: number;
    isFree?: boolean;
    addOnsCost?: number;
    customizations?: Record<string, unknown>;
    addOns?: Record<string, unknown>;
  }>;
}

interface DiscountSource {
  offerId: string;
  title: string;
  type: string;
  amount: number;
}

interface ValidatedBill {
  verifiedItems: CartItemInput[];
  subtotal: number;
  discount: number;
  discountSources: DiscountSource[];
  tax: number;
  total: number;
}

const toDateSafe = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof (value as any)?.toDate === "function") {
    try { return (value as any).toDate(); } catch { return null; }
  }
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
  if (usageLimit > 0 && usedCount >= usageLimit) return false;

  return true;
};

const checkPerUserLimit = async (
  offerData: Record<string, unknown>, 
  offerId: string, 
  userId: string | undefined,
  localUsageMap: Record<string, number>,
  sessionId: string | undefined,
  currentItemUsage: number,
  tx?: FirebaseFirestore.Transaction
) => {
  const perUserLimit = getOfferLimit(offerData, "perUserLimit");
  if (perUserLimit > 0 && userId) {
    // 1. FETCH PAST USAGE
    const userRef = db.collection("users").doc(userId);
    const userSnap = tx ? await tx.get(userRef) : await userRef.get();
    const userData = userSnap.data() || {};
    const usedOffers = userData.usedOffers || {};
    const pastUsage = readNumber(usedOffers[offerId], 0);

    // 2. FETCH CURRENT SESSION USAGE
    let currentUsage = 0;
    if (sessionId) {
      const activeOrdersQuery = db.collection("orders").where("sessionId", "==", sessionId);
      const activeOrdersSnap = tx ? await tx.get(activeOrdersQuery) : await activeOrdersQuery.get();
        
      activeOrdersSnap.docs.forEach(doc => {
        const data = doc.data();
        const items = Array.isArray(data.items) ? data.items : [];
        items.forEach((item: any) => {
          if (item.offerId === offerId) {
            if (item.items && Array.isArray(item.items)) {
              currentUsage += item.items.length;
            } else {
              currentUsage += 1;
            }
          }
        });
      });
    }

    // 3. COUNT NEW ITEMS IN REQUEST
    const newUsage = (localUsageMap[offerId] || 0) + currentItemUsage;

    // 4. FINAL VALIDATION
    const totalUsage = pastUsage + currentUsage + newUsage;
    if (totalUsage > perUserLimit) {
      throw new Error(`INVALID_OFFER:You have reached the maximum usage for this offer`);
    }
  }
};

const validateCartServer = async (
  cartItems: CartItemInput[],
  outletId: string,
  autoAppliedOfferId?: string,
  userId?: string,
  sessionId?: string,
  tx?: FirebaseFirestore.Transaction
): Promise<ValidatedBill> => {

  const verifiedItems: CartItemInput[] = [];
  let subtotal = 0;
  let discount = 0;
  const discountSources: DiscountSource[] = [];
  const localUsageMap: Record<string, number> = {};

  for (const item of cartItems) {
    // ── COMBO ──
    if (item.isCombo && item.offerId) {
      const offerRef = db.collection("offers").doc(item.offerId);
      const offerSnap = tx ? await tx.get(offerRef) : await offerRef.get();
      if (!offerSnap.exists) throw new Error("OFFER_NOT_FOUND");
      const offerData = offerSnap.data();
      if (!offerData) throw new Error("OFFER_NOT_FOUND");
      if (!isOfferCurrentlyValid(offerData)) throw new Error("INVALID_OFFER:Combo offer is no longer active or has expired");
      
      const currentItemUsage = (item.items && Array.isArray(item.items)) ? item.items.length : 1;
      await checkPerUserLimit(offerData, item.offerId, userId, localUsageMap, sessionId, currentItemUsage, tx);

      // Track usage in current cart
      localUsageMap[item.offerId] = (localUsageMap[item.offerId] || 0) + currentItemUsage;
      if (offerData.outletId && offerData.outletId !== outletId) throw new Error("INVALID_OFFER:Combo offer not valid for this outlet");

      const dbComboPrice = readNumber((offerData as any).config?.comboPrice, -1);
      if (dbComboPrice < 0) throw new Error("INVALID_OFFER:Combo offer has no valid price");

      // Calculate addons cost from sub-items
      const subItems = Array.isArray(item.items) ? item.items : [];
      const addOnsCost = subItems.reduce((s, si) => s + readNumber(si.addOnsCost, 0), 0);
      const verifiedPrice = dbComboPrice + addOnsCost;

      verifiedItems.push({ ...item, price: verifiedPrice, comboPrice: dbComboPrice });
      subtotal += verifiedPrice;
      continue;
    }

    // ── B1G1 ──
    if (item.isManualB1G1 && item.offerId) {
      const offerRef = db.collection("offers").doc(item.offerId);
      const offerSnap = tx ? await tx.get(offerRef) : await offerRef.get();
      if (!offerSnap.exists) throw new Error("OFFER_NOT_FOUND");
      const offerData = offerSnap.data();
      if (!offerData) throw new Error("OFFER_NOT_FOUND");
      if (!isOfferCurrentlyValid(offerData)) throw new Error("INVALID_OFFER:B1G1 offer is no longer active or has expired");
      
      const currentItemUsage = (item.items && Array.isArray(item.items)) ? item.items.length : 1;
      await checkPerUserLimit(offerData, item.offerId, userId, localUsageMap, sessionId, currentItemUsage, tx);

      // Track usage in current cart
      localUsageMap[item.offerId] = (localUsageMap[item.offerId] || 0) + currentItemUsage;
      if (offerData.outletId && offerData.outletId !== outletId) throw new Error("INVALID_OFFER:B1G1 offer not valid for this outlet");

      const subItems = Array.isArray(item.items) ? item.items : [];
      if (subItems.length < 2) throw new Error("INVALID_OFFER:B1G1 requires at least 2 items");

      // Fetch real prices from DB for each sub-item
      const pricesFromDb: number[] = [];
      for (const si of subItems) {
        const pSnap = await db.collection("products").doc(si.productId).get();
        if (!pSnap.exists) throw new Error(`INVALID_ITEM:Product ${si.productId} not found`);
        pricesFromDb.push(readNumber((pSnap.data() || {}).price, 0));
      }

      // Sort descending: customer pays highest, cheapest is free
      const sorted = [...pricesFromDb].sort((a, b) => b - a);
      const paidPrice = sorted[0]; // highest
      const addOnsCost = subItems.reduce((s, si) => s + readNumber(si.addOnsCost, 0), 0);
      const verifiedDealPrice = paidPrice + addOnsCost;
      const originalTotal = pricesFromDb.reduce((s, p) => s + p, 0);
      const b1g1Discount = originalTotal - paidPrice;

      verifiedItems.push({
        ...item,
        price: verifiedDealPrice,
        originalPrice: originalTotal,
      });
      subtotal += verifiedDealPrice;

      discountSources.push({
        offerId: item.offerId,
        title: item.offerTitle || "B1G1 Offer",
        type: "B1G1",
        amount: b1g1Discount,
      });
      continue;
    }

    // ── DISCOUNT (product-level or category-level) ──
    if ((item.isDiscount || item.offerType === "CATEGORY_DISCOUNT") && item.offerId) {
      const offerRef = db.collection("offers").doc(item.offerId);
      const offerSnap = tx ? await tx.get(offerRef) : await offerRef.get();
      if (!offerSnap.exists) throw new Error("OFFER_NOT_FOUND");
      const offerData = offerSnap.data();
      if (!offerData) throw new Error("OFFER_NOT_FOUND");
      if (!isOfferCurrentlyValid(offerData)) throw new Error("INVALID_OFFER:Discount offer is no longer active or has expired");
      
      const currentItemUsage = (item.items && Array.isArray(item.items)) ? item.items.length : 1;
      await checkPerUserLimit(offerData, item.offerId, userId, localUsageMap, sessionId, currentItemUsage, tx);

      // Track usage in current cart
      localUsageMap[item.offerId] = (localUsageMap[item.offerId] || 0) + currentItemUsage;
      if (offerData.outletId && offerData.outletId !== outletId) throw new Error("INVALID_OFFER:Discount offer not valid for this outlet");

      const discConfig = (offerData as any).config?.discount;
      const discountPercent = readNumber(discConfig?.discountValue || (offerData as any).discountValue, 0);
      if (discountPercent <= 0 || discountPercent > 100) throw new Error("INVALID_OFFER:Invalid discount percentage");

      // Fetch real product prices and validate category if applicable
      const subItems = Array.isArray(item.items) ? item.items : [];
      let originalPrice = 0;
      for (const si of subItems) {
        const pSnap = await db.collection("products").doc(si.productId).get();
        if (!pSnap.exists) throw new Error(`INVALID_ITEM:Product ${si.productId} not found`);
        const productData = pSnap.data() || {};
        
        // Validate category if offer is restricted to a specific category
        if (offerData.applicableCategory && offerData.applicableCategory !== "all") {
          const productCat = String(productData.category || "").toLowerCase().trim();
          const productSubCat = String(productData.subcategory || "").toLowerCase().trim();
          const offerCat = String(offerData.applicableCategory).toLowerCase().trim();
          
          if (productCat !== offerCat && productSubCat !== offerCat) {
            throw new Error(`INVALID_ITEM:Product ${si.productId} does not belong to category ${offerData.applicableCategory}`);
          }
        }
        
        originalPrice += readNumber(productData.price, 0);
      }

      const addOnsCost = subItems.reduce((s, si) => s + readNumber(si.addOnsCost, 0), 0);
      const discountAmount = Math.round((originalPrice * discountPercent) / 100);
      const finalPrice = Math.max(0, originalPrice - discountAmount) + addOnsCost;

      verifiedItems.push({
        ...item,
        price: finalPrice,
        originalPrice,
      });
      subtotal += finalPrice;

      discountSources.push({
        offerId: item.offerId,
        title: item.offerTitle || "Discount Offer",
        type: "DISCOUNT",
        amount: discountAmount,
      });
      continue;
    }

    // ── BIRTHDAY ──
    if (item.isBirthday && item.offerId) {
      const offerRef = db.collection("offers").doc(item.offerId);
      const offerSnap = tx ? await tx.get(offerRef) : await offerRef.get();
      if (!offerSnap.exists) throw new Error("OFFER_NOT_FOUND");
      const offerData = offerSnap.data();
      if (!offerData) throw new Error("OFFER_NOT_FOUND");
      if (!isOfferCurrentlyValid(offerData)) throw new Error("INVALID_OFFER:Birthday offer is no longer active or has expired");
      
      const currentItemUsage = (item.items && Array.isArray(item.items)) ? item.items.length : 1;
      await checkPerUserLimit(offerData, item.offerId, userId, localUsageMap, sessionId, currentItemUsage, tx);

      // Track usage in current cart
      localUsageMap[item.offerId] = (localUsageMap[item.offerId] || 0) + currentItemUsage;

      verifiedItems.push({ ...item, price: 0 });
      // Birthday items are free — don't add to subtotal
      continue;
    }

    // ── FREE ITEM (reward) ──
    if (item.isFree) {
      verifiedItems.push({ ...item, price: 0 });
      continue;
    }

    // ── REGULAR ITEM ──
    const productId = String(item.id || "").split("_")[0]; // strip any suffix
    if (!productId) throw new Error("INVALID_ITEM:Missing product ID");

    const productSnap = await db.collection("products").doc(productId).get();
    if (!productSnap.exists) throw new Error(`INVALID_ITEM:Product ${productId} not found`);

    const dbPrice = readNumber((productSnap.data() || {}).price, 0);
    const qty = Math.max(1, Math.floor(readNumber(item.qty, 1)));

    // Accept frontend price only if >= DB price (addons can increase it)
    const unitPrice = item.price >= dbPrice ? item.price : dbPrice;
    const lineTotal = unitPrice * qty;

    verifiedItems.push({ ...item, price: unitPrice, qty });
    subtotal += lineTotal;
  }

  // ── AUTO-APPLIED OFFER (registration/first-order) ──
  if (autoAppliedOfferId) {
    const offerRef = db.collection("offers").doc(autoAppliedOfferId);
    const offerSnap = tx ? await tx.get(offerRef) : await offerRef.get();
    if (offerSnap.exists) {
      const offerData = offerSnap.data();
      if (offerData && isOfferCurrentlyValid(offerData)) {
        try {
          await checkPerUserLimit(offerData, autoAppliedOfferId, userId, localUsageMap, sessionId, 1, tx);

          
          // Check first-order eligibility
          let eligible = true;
          if ((offerData as any).userRules?.firstOrderOnly && userId) {
            const userSnap = await db.collection("users").doc(userId).get();
            if (userSnap.exists && (userSnap.data() || {}).hasPlacedFirstOrder) {
              eligible = false;
            }
          }

          if (eligible) {
            // Calculate on eligible items (non-combo, non-B1G1, non-free, non-discount, non-birthday)
            const eligibleTotal = verifiedItems
              .filter(i => !i.isFree && !i.isCombo && !i.isManualB1G1 && !i.isDiscount && !i.isBirthday)
              .reduce((s, i) => s + (i.price * (i.qty || 1)), 0);

            if (eligibleTotal > 0) {
              // Get discount value — treat as percentage
              const discVal = readNumber(
                (offerData as any).config?.discount?.discountValue ??
                (offerData as any).discountValue, 0
              );
              if (discVal > 0 && discVal <= 100) {
                const autoDisc = Math.round((eligibleTotal * discVal) / 100);
                discount += autoDisc;
                discountSources.push({
                  offerId: autoAppliedOfferId,
                  title: String(offerData.title || "First Order Offer"),
                  type: "AUTO_APPLIED",
                  amount: autoDisc,
                });
              }
            }
          }
        } catch (e) {
          // If auto-applied offer exceeds perUserLimit, just silently ignore it
        }
      }
    }
  }

  const taxableAmount = Math.max(subtotal - discount, 0);
  const tax = applyTax(taxableAmount);
  const total = Math.round(taxableAmount + tax);

  return { verifiedItems, subtotal, discount, discountSources, tax, total };
};

// ─────────────────────────────────────────────────────────────────────────────
// Handler: validateAndCalculateBill — READ ONLY, no DB writes
// ─────────────────────────────────────────────────────────────────────────────

const validateAndCalculateBillHandler = async (req: Request, res: Response): Promise<void> => {
  setCors(res);
  if (req.method === "OPTIONS") { res.status(200).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ success: false, message: "Method not allowed" }); return; }

  try {
    const { cartItems, outletId, autoAppliedOfferId, userId, sessionId } = req.body as {
      cartItems?: CartItemInput[];
      outletId?: string;
      autoAppliedOfferId?: string;
      userId?: string;
      sessionId?: string;
    };

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      res.status(400).json({ success: false, message: "Cart is empty" });
      return;
    }
    if (!outletId) {
      res.status(400).json({ success: false, message: "outletId is required" });
      return;
    }

    const bill = await validateCartServer(cartItems, outletId, autoAppliedOfferId, userId, sessionId);

    res.status(200).json({
      success: true,
      items: bill.verifiedItems,
      pricing: {
        subtotal: bill.subtotal,
        discount: bill.discount,
        tax: bill.tax,
        total: bill.total,
      },
      discountSources: bill.discountSources,
    });
    return;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Validation failed";
    if (msg.startsWith("INVALID_OFFER:") || msg.startsWith("INVALID_ITEM:")) {
      res.status(400).json({ success: false, message: msg.split(":").slice(1).join(":") });
      return;
    }
    console.error("validateAndCalculateBill error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
    return;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Handler: finalizeAndClose — Re-validates, then writes order+payment+closes
// ─────────────────────────────────────────────────────────────────────────────

const finalizeAndCloseHandler = async (req: Request, res: Response): Promise<void> => {
  setCors(res);
  if (req.method === "OPTIONS") { res.status(200).send(""); return; }
  if (req.method !== "POST") { res.status(405).json({ success: false, message: "Method not allowed" }); return; }

  try {
    const {
      cartItems, outletId, sessionId, tableId, userId,
      autoAppliedOfferId, guestName, guestPhone, userType,
    } = req.body as {
      cartItems?: CartItemInput[];
      outletId?: string;
      sessionId?: string;
      tableId?: string;
      userId?: string;
      autoAppliedOfferId?: string;
      guestName?: string;
      guestPhone?: string;
      userType?: string;
    };

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      res.status(400).json({ success: false, message: "Cart is empty" });
      return;
    }
    if (!outletId || !sessionId) {
      res.status(400).json({ success: false, message: "outletId and sessionId are required" });
      return;
    }

    // All DB writes and validation in a single transaction
    const result = await db.runTransaction(async (tx) => {
      // Re-validate everything from scratch inside the transaction
      const bill = await validateCartServer(cartItems, outletId, autoAppliedOfferId, userId, sessionId, tx);

      // Verify session exists and is active
      const sessionRef = db.collection("sessions").doc(sessionId);
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists) throw new Error("SESSION_NOT_FOUND");

      const sessionData = sessionSnap.data() || {};
      const resolvedTableId = readString(tableId) || String(sessionData.tableId || "");

      // Build order items for storage
      const orderItems = bill.verifiedItems.map((item) => ({
        productId: String(item.id || ""),
        name: String(item.name || ""),
        qty: item.qty || 1,
        price: item.price,
        totalPrice: item.price * (item.qty || 1),
        isCombo: !!item.isCombo,
        isManualB1G1: !!item.isManualB1G1,
        isDiscount: !!item.isDiscount,
        isBirthday: !!item.isBirthday,
        isFree: !!item.isFree,
        offerId: item.offerId || null,
        offerTitle: item.offerTitle || null,
        items: item.items || null,
      }));

      // Create order
      const orderRef = db.collection("orders").doc();
      const orderPayload = {
        outletId,
        tableId: resolvedTableId,
        sessionId,
        ownerId: userId || null,
        userId: userId || null,
        placedBy: "customer",
        userType: userType || "registered",
        customerName: guestName || null,
        customerPhone: guestPhone || null,
        items: orderItems,
        pricing: {
          subtotal: bill.subtotal,
          discount: bill.discount,
          tax: bill.tax,
          total: bill.total,
        },
        appliedOffers: bill.discountSources,
        status: "in-progress",
        orderStatus: "in-progress",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      tx.set(orderRef, orderPayload);

      // Create payment
      const paymentRef = db.collection("payments").doc();
      const paymentPayload = {
        paymentId: paymentRef.id,
        orderId: orderRef.id,
        outletId,
        tableId: resolvedTableId,
        sessionId,
        ownerId: userId || null,
        placedBy: "customer",
        customer: {
          name: guestName || null,
          phone: guestPhone || null,
          userId: userId || null,
        },
        items: orderItems,
        pricing: {
          subtotal: bill.subtotal,
          discount: bill.discount,
          tax: bill.tax,
          total: bill.total,
        },
        appliedOffers: bill.discountSources,
        paymentStatus: "PENDING_COUNTER",
        settlementStatus: "UNPAID",
        payAt: "COUNTER",
        noteToCustomer: "Please pay at the counter. Your bill is ready.",
        generatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      tx.set(paymentRef, paymentPayload);

      // Archive to ordersHistory
      const historyRef = db.collection("ordersHistory").doc(orderRef.id);
      tx.set(historyRef, {
        orderId: orderRef.id,
        outletId,
        tableId: resolvedTableId,
        sessionId,
        ownerId: userId || null,
        placedBy: "customer",
        items: orderItems,
        orderLifecycleStatus: "COMPLETED",
        pricing: { subtotal: bill.subtotal, discount: bill.discount, tax: bill.tax, total: bill.total },
        appliedOffers: bill.discountSources,
        customer: { id: userId || null, name: guestName || null, phone: guestPhone || null },
        closedAt: FieldValue.serverTimestamp(),
        archivedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        source: "customer.finalizeAndClose",
      });

      // Close session
      tx.update(sessionRef, {
        status: "CLOSED",
        closedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Reset table
      if (resolvedTableId) {
        const tableRef = db.collection("tables").doc(resolvedTableId);
        tx.set(tableRef, {
          isOccupied: false,
          activeSessionId: null,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      // Mark first order for user
      if (userId && userType !== "guest") {
        const userRef = db.collection("users").doc(userId);
        tx.set(userRef, { hasPlacedFirstOrder: true }, { merge: true });
      }

      // Increment used counts for applied offers
      if (bill.discountSources.length > 0) {
        const userRef = (userId && userType !== "guest") ? db.collection("users").doc(userId) : null;
        for (const source of bill.discountSources) {
          const offerRef = db.collection("offers").doc(source.offerId);
          tx.update(offerRef, { usedCount: FieldValue.increment(1) });
          
          if (userRef) {
            tx.set(userRef, {
              usedOffers: {
                [source.offerId]: FieldValue.increment(1)
              }
            }, { merge: true });
          }
        }
      }

      return {
        orderId: orderRef.id,
        paymentId: paymentRef.id,
        sessionId,
        pricing: { subtotal: bill.subtotal, discount: bill.discount, tax: bill.tax, total: bill.total },
        discountSources: bill.discountSources,
      };
    });

    res.status(200).json({
      success: true,
      message: "Order finalized and session closed",
      ...result,
    });
    return;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (msg === "SESSION_NOT_FOUND") {
      res.status(404).json({ success: false, message: "Session not found" });
      return;
    }
    if (msg.startsWith("INVALID_OFFER:") || msg.startsWith("INVALID_ITEM:")) {
      res.status(400).json({ success: false, message: msg.split(":").slice(1).join(":") });
      return;
    }
    console.error("finalizeAndClose error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
    return;
  }
};

export const generateBill = functions.https.onRequest(generateBillHandler);
export const closeSession = functions.https.onRequest(closeSessionHandler);
export const validateAndCalculateBill = functions.https.onRequest(validateAndCalculateBillHandler);
export const finalizeAndClose = functions.https.onRequest(finalizeAndCloseHandler);
