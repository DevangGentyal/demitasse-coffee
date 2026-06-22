import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {Request, Response} from "express";
import {handleCustomerPreflight} from "../../shared/utilities/security/cors";
import {applyTax} from "../../shared/utilities/billing/tax";
import {isOrderArchived} from "../../shared/utilities/orders/orderStatus";

const db = admin.firestore();

// ─── Helpers ──────────────────────────────────────────────────────────────

const readNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const getItemTotal = (item: Record<string, unknown>): number => {
  const direct = readNumber(
    item.totalPrice ??
    item.discountedPrice ??
    item.totalAmount ??
    item.itemTotal,
    NaN
  );

  const nested = Array.isArray(item.items) ?
    (item.items as Record<string, unknown>[]) :
    [];

  if (Number.isFinite(direct) && direct >= 0) {
    return direct;
  }

  if (nested.length > 0) {
    return nested.reduce(
      (sum, child) => sum + getItemTotal(child),
      0
    );
  }

  return 0;
};

const getOrderTotal = (
  orderData: Record<string, unknown>
): number => {
  const subtotal = readNumber(
    orderData.subTotal,
    NaN
  );

  if (Number.isFinite(subtotal) && subtotal >= 0) {
    return subtotal;
  }

  const direct = readNumber(
    orderData.totalAmount ??
    orderData.itemTotal,
    NaN
  );

  if (Number.isFinite(direct) && direct >= 0) {
    return direct;
  }

  const items = Array.isArray(orderData.items) ?
    (orderData.items as Record<string, unknown>[]) :
    [];

  return items.reduce(
    (sum, item) => sum + getItemTotal(item),
    0
  );
};

const getOrderDiscount = (orderData: Record<string, unknown>): number => {
  const pricing = orderData.pricing as Record<string, unknown> | undefined;
  const d = readNumber(
    pricing?.discount ?? orderData.discount,
    NaN
  );
  return Number.isFinite(d) ? Math.max(d, 0) : 0;
};

/** Normalise one item into the shape the frontend Bill Summary expects. */
const normalizeItem = (
  item: Record<string, unknown>,
  orderId: string
): Record<string, unknown> => {
  const qty = Math.max(
    readNumber(item.quantity ?? item.qty, 1),
    1
  );

  const totalPrice = readNumber(
    item.discountedPrice ??
    item.totalPrice,
    0
  );

  const unitPrice = readNumber(
    item.unitPrice ??
    item.price,
    qty > 0 ? totalPrice / qty : 0
  );
  console.log(
    "[ITEM]",
    item.name,
    {
      totalPrice: item.totalPrice,
      discountedPrice: item.discountedPrice,
      isDiscount: item.isDiscount,
      offerTitle: item.offerTitle,
    }
  );
  return {
    id: String(item.id || item.productId || ""),
    productId: String(item.productId || item.id || ""),
    orderId,

    name: String(item.name || item.title || "Item"),

    qty,
    unitPrice: Math.round(unitPrice),
    totalPrice: Math.round(totalPrice),

    addOns: Array.isArray(item.addOns) ?
      item.addOns :
      Array.isArray(item.addons) ?
        item.addons :
        [],

    variations: Array.isArray(item.variations) ?
      item.variations :
      [],

    customizations: Array.isArray(item.customizations) ?
      item.customizations :
      [],

    items: Array.isArray(item.items) ?
      (item.items as Record<string, unknown>[]).map(
        (child) => normalizeItem(child, orderId)
      ) :
      [],

    isCombo: Boolean(item.isCombo),
    isManualB1G1: Boolean(item.isManualB1G1),
    isDiscount: Boolean(item.isDiscount),
    isBirthday: Boolean(item.isBirthday),
    isFree: Boolean(item.isFree),

    offerId: String(item.offerId || ""),
    offerType: String(item.offerType || ""),
    offerTitle: String(item.offerTitle || ""),

    category: item.category ?? null,
    subcategory: item.subcategory ?? null,
  };
};


/** Same bucket logic as OrderCard / frontend. */
const buildOfferBuckets = (
  items: Record<string, unknown>[]
): Map<
  string,
  {
    offerId: string;
    offerType: string;
    offerTitle: string;
    items: Record<string, unknown>[];
  }
> => {
  const buckets = new Map<
    string,
    {
      offerId: string;
      offerType: string;
      offerTitle: string;
      items: Record<string, unknown>[];
    }
  >();

  for (const item of items) {
    const rawOfferId = String(item.offerId || "").trim();
    const rawOfferTitle = String(item.offerTitle || "").trim();
    const rawOfferType = String(item.offerType || "").trim();

    const isOffer = Boolean(
      item.isCombo ||
      item.isManualB1G1 ||
      item.isDiscount ||
      item.isBirthday ||
      item.isFree
    );

    const fallbackOfferId =
      `${rawOfferType || "offer"}::${rawOfferTitle || "group"}`;

    const bucketId =
      rawOfferId || (isOffer ? fallbackOfferId : "");

    if (!bucketId) continue;

    if (!buckets.has(bucketId)) {
      buckets.set(bucketId, {
        offerId: bucketId,
        offerType:
          rawOfferType ||
          (item.isCombo ?
            "COMBO" :
            item.isManualB1G1 ?
              "B1G1" :
              item.isDiscount ?
                "DISCOUNT" :
                item.isBirthday ?
                  "BIRTHDAY" :
                  "OFFER"),
        offerTitle: rawOfferTitle || "Offer Group",
        items: [],
      });
    }

    buckets.get(bucketId)!.items.push(item);
  }

  return buckets;
};


// ─── Cloud Function ─────────────────────────────────────────────────────────

export const generateBill = functions.https.onRequest(
  async (req: Request, res: Response): Promise<void> => {
    if (handleCustomerPreflight(req, res)) return;
    if (req.method !== "POST") {
      res.status(405).json({success: false, message: "Method not allowed"});
      return;
    }

    try {
      const {
        outletId,
        sessionId,
        tableId,
      } = req.body as {
        outletId?: string;
        sessionId?: string;
        tableId?: string;
      };

      console.info("[generateBill] request", {
        sessionId: sessionId || null,
        tableId: tableId || null,
      });

      if (!sessionId && !tableId) {
        res.status(400).json({
          success: false,
          message: "sessionId or tableId is required",
        });
        return;
      }
      if (!outletId) {
        res.status(400).json({
          success: false,
          message: "outletId is required",
        });
        return;
      }

      // ── 1. Fetch candidate orders ─────────────────────────────────────────
      let candidateDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
      let ordersQuery: FirebaseFirestore.Query =
        db.collection(`outlets/${outletId}/orders`);

      if (sessionId) {
        ordersQuery = ordersQuery.where(
          "sessionId",
          "==",
          sessionId
        ) as FirebaseFirestore.Query;
      }

      if (tableId) {
        ordersQuery = ordersQuery.where(
          "tableId",
          "==",
          tableId
        ) as FirebaseFirestore.Query;
      }

      const snapshot = await ordersQuery.get();

      candidateDocs = snapshot.docs;

      console.info("[generateBill] candidates before filter", {
        count: candidateDocs.length,
        ids: candidateDocs.map((d) => d.id),
      });

      // ── 2. Filter archived orders ─────────────────────────────────────────
      candidateDocs = candidateDocs.filter((doc) => {
        const d = doc.data();
        return !isOrderArchived(d);
      });

      console.info("[generateBill] candidates after filter", {
        count: candidateDocs.length,
        ids: candidateDocs.map((d) => d.id),
      });

      if (candidateDocs.length === 0) {
        res.status(404).json({success: false, message: "Order not found"});
        return;
      }

      // ── 3. Normalise items, sum order totals & discounts ───────────────────
      const allNormalizedItems: Record<string, unknown>[] = [];
      let subtotal = 0;
      let totalDiscount = 0;
      let primaryDoc = candidateDocs[0];

      for (const doc of candidateDocs) {
        const data = doc.data() as Record<string, unknown>;

        const rawItems = Array.isArray(data.items) ?
          (data.items as Record<string, unknown>[]) :
          [];

        if (rawItems.length === 0) continue;

        const normalized = rawItems.map((item) => normalizeItem(item, doc.id));
        allNormalizedItems.push(...normalized);

        subtotal += getOrderTotal(data);
        totalDiscount += getOrderDiscount(data);

        const curMs =
          readNumber((data.updatedAt as { toMillis?: () => number })?.toMillis?.(), 0) ||
          readNumber((data.createdAt as { toMillis?: () => number })?.toMillis?.(), 0);
        const priData = primaryDoc.data() as Record<string, unknown>;
        const priMs =
          readNumber((priData.updatedAt as { toMillis?: () => number })?.toMillis?.(), 0) ||
          readNumber((priData.createdAt as { toMillis?: () => number })?.toMillis?.(), 0);
        if (curMs > priMs) primaryDoc = doc;
      }

      if (allNormalizedItems.length === 0) {
        res.status(400).json({success: false, message: "Cannot finalize empty order"});
        return;
      }

      // ── 4. Pricing ───────────────────────────────────────────────────────
      const roundedSubtotal = Math.round(subtotal);

      const discount = Math.round(totalDiscount);

      const discountedPrice = Math.max(
        roundedSubtotal - discount,
        0
      );

      const tax = applyTax(discountedPrice);

      const total = discountedPrice + tax;

      const pricing = {
        subtotal: roundedSubtotal,
        discount,
        discountedPrice,
        tax,
        total,
      };

      // ── 5. Offer grouping ───────────────────────────────────────────────────
      const buckets = buildOfferBuckets(allNormalizedItems);

      const displayBillGroups = Array.from(buckets.values()).map((bucket) => {
        const groupDiscountedPrice = bucket.items.reduce(
          (sum, item) => sum + readNumber(item.totalPrice, 0),
          0
        );

        return {
          offerId: bucket.offerId,
          offerType: bucket.offerType,
          offerTitle: bucket.offerTitle,
          items: bucket.items,
          groupDiscountedPrice,
        };
      });

      // ── 6. Applied offers (savings) ─────────────────────────────────────────
      const totalChargedAcrossGroups = displayBillGroups.reduce(
        (s, g) => s + g.groupDiscountedPrice,
        0
      );

      const appliedOffers = displayBillGroups.map((g) => {
        const share =
          totalChargedAcrossGroups > 0 ?
            g.groupDiscountedPrice / totalChargedAcrossGroups :
            0;
        const amount = Math.round(totalDiscount * share);

        return {
          offerId: g.offerId,
          title: g.offerTitle,
          type: g.offerType,
          offerType: g.offerType,
          amount,
        };
      });

      const primaryData = primaryDoc.data() as Record<string, unknown>;

      console.info(
        `[generateBill] subtotal=${roundedSubtotal} discount=${discount} ` +
        `discountedPrice=${discountedPrice} tax=${tax} total=${total} ` +
        `items=${allNormalizedItems.length}`
      );
      console.info("[generateBill] request", {
        outletId: outletId || null,
        sessionId: sessionId || null,
        tableId: tableId || null,
      });

      res.status(200).json({
        success: true,
        orderId: primaryDoc.id,
        sessionId: primaryData.sessionId || null,
        tableId: primaryData.tableId || null,
        items: allNormalizedItems,
        pricing,
        displayBillGroups,
        appliedOffers,
        appliedOfferLogs: displayBillGroups,
        noteToCustomer: "Your calculated bill is ready.",
      });
    } catch (error) {
      console.error("[generateBill] error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: String(error),
      });
    }
  }
);
