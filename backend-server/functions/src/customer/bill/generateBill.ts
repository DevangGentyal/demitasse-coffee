import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { handleCustomerPreflight } from "../../shared/utilities/security/cors";

const db = admin.firestore();

// ─── Helpers (mirrors frontend exactly) ──────────────────────────────────────

const readNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Mirrors frontend `getOrderTotal`:
 *   discountedPrice ?? totalPrice ?? totalAmount ?? itemTotal
 * Falls back to summing item-level totals when the order-level field is absent.
 */
const getItemTotal = (item: Record<string, unknown>): number => {
  const direct = readNumber(
    item.discountedPrice ?? item.totalPrice ?? item.totalAmount ?? item.itemTotal,
    NaN
  );
  if (Number.isFinite(direct) && direct >= 0) return direct;

  // nested items (e.g. combo children)
  const nested = Array.isArray(item.items) ? item.items as Record<string, unknown>[] : [];
  if (nested.length > 0) {
    return nested.reduce((sum, child) => sum + getItemTotal(child), 0);
  }
  return 0;
};

const getOrderTotal = (orderData: Record<string, unknown>): number => {
  const direct = readNumber(
    orderData.discountedPrice ?? orderData.grandTotal ?? orderData.subTotal ??
    orderData.totalAmount ?? orderData.itemTotal,
    NaN
  );
  if (Number.isFinite(direct) && direct >= 0) return direct;

  const items = Array.isArray(orderData.items)
    ? orderData.items as Record<string, unknown>[]
    : [];
  if (items.length > 0) {
    return items.reduce((sum, item) => sum + getItemTotal(item), 0);
  }
  return 0;
};

const getOrderDiscount = (orderData: Record<string, unknown>): number => {
  const d = readNumber(
    orderData.discount ?? (orderData.pricing as Record<string, unknown> | undefined)?.discount,
    NaN
  );
  return Number.isFinite(d) ? Math.max(d, 0) : 0;
};

/** Normalise one item into the shape the frontend Bill Summary expects. */
const normalizeItem = (
  item: Record<string, unknown>,
  orderId: string
): Record<string, unknown> => {
  const qty = Math.max(readNumber(item.quantity ?? item.qty, 1), 1);
  const totalPrice = getItemTotal(item);
  const unitPrice = qty > 0 ? totalPrice / qty : 0;

  return {
    // identity
    id: String(item.id || item.productId || ""),
    productId: String(item.productId || item.id || ""),
    orderId,
    name: String(item.name || item.title || "Item"),
    // quantities & prices — computed the same way as the frontend
    qty,
    unitPrice: Math.round(unitPrice),
    totalPrice: Math.round(totalPrice),
    // extras
    addOns: Array.isArray(item.addOns)
      ? item.addOns
      : Array.isArray(item.addons)
        ? item.addons
        : [],
    variations: Array.isArray(item.variations) ? item.variations : [],
    customizations: Array.isArray(item.customizations) ? item.customizations : [],
    items: Array.isArray(item.items)
      ? (item.items as Record<string, unknown>[]).map((child) =>
          normalizeItem(child, orderId)
        )
      : [],
    // offer flags
    isCombo: Boolean(item.isCombo),
    isManualB1G1: Boolean(item.isManualB1G1),
    isDiscount: Boolean(item.isDiscount),
    isBirthday: Boolean(item.isBirthday),
    isFree: Boolean(item.isFree),
    offerId: String(item.offerId || ""),
    offerType: String(item.offerType || ""),
    offerTitle: String(item.offerTitle || ""),
    // pass-through metadata
    category: item.category ?? null,
    subcategory: item.subcategory ?? null,
  };
};

/** Same bucket logic as both OrderCard and the local handleGenerateBill. */
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
  const buckets = new Map<string, { offerId: string; offerType: string; offerTitle: string; items: Record<string, unknown>[] }>();

  for (const item of items) {
    const rawOfferId = String(item.offerId || "").trim();
    const rawOfferTitle = String(item.offerTitle || "").trim();
    const rawOfferType = String(item.offerType || "").trim();
    const isOffer = Boolean(
      item.isCombo || item.isManualB1G1 || item.isDiscount ||
      item.isBirthday || item.isFree
    );
    const fallbackOfferId = `${rawOfferType || "offer"}::${rawOfferTitle || "group"}`;
    const bucketId = rawOfferId || (isOffer ? fallbackOfferId : "");

    if (!bucketId) continue;

    if (!buckets.has(bucketId)) {
      buckets.set(bucketId, {
        offerId: bucketId,
        offerType:
          rawOfferType ||
          (item.isCombo
            ? "COMBO"
            : item.isManualB1G1
              ? "B1G1"
              : item.isDiscount
                ? "DISCOUNT"
                : item.isBirthday
                  ? "BIRTHDAY"
                  : "OFFER"),
        offerTitle: rawOfferTitle || "Offer Group",
        items: [],
      });
    }
    buckets.get(bucketId)!.items.push(item);
  }

  return buckets;
};

// ─── Cloud Function ───────────────────────────────────────────────────────────

export const generateBill = functions.https.onRequest(
  async (req: Request, res: Response): Promise<void> => {
    if (handleCustomerPreflight(req, res)) return;
    if (req.method !== "POST") {
      res.status(405).json({ success: false, message: "Method not allowed" });
      return;
    }

    try {
      const { sessionId, tableId } = req.body as {
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

      // ── 1. Fetch candidate orders ─────────────────────────────────────────
      let candidateDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];

      if (sessionId && tableId) {
        const [bySession, byTable] = await Promise.all([
          db.collection("orders").where("sessionId", "==", sessionId).get(),
          db.collection("orders").where("tableId", "==", tableId.toString()).get(),
        ]);
        const map = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
        bySession.docs.forEach((d) => map.set(d.id, d));
        byTable.docs.forEach((d) => map.set(d.id, d));
        candidateDocs = Array.from(map.values());
      } else if (sessionId) {
        candidateDocs = (
          await db.collection("orders").where("sessionId", "==", sessionId).get()
        ).docs;
      } else if (tableId) {
        candidateDocs = (
          await db
            .collection("orders")
            .where("tableId", "==", tableId.toString())
            .get()
        ).docs;
      }

      console.info("[generateBill] candidates before filter", {
        count: candidateDocs.length,
        ids: candidateDocs.map((d) => d.id),
      });

      // ── 2. Filter archived orders (same as frontend hasBillableItems) ─────
      candidateDocs = candidateDocs.filter((doc) => {
        const d = doc.data();
        const status = String(d.status || "").toUpperCase();
        const orderStatus = String(d.orderStatus || "").toLowerCase();
        return status !== "ARCHIVED" && orderStatus !== "archived";
      });

      console.info("[generateBill] candidates after filter", {
        count: candidateDocs.length,
        ids: candidateDocs.map((d) => d.id),
      });

      if (candidateDocs.length === 0) {
        res.status(404).json({ success: false, message: "Order not found" });
        return;
      }

      // ── 3. Normalise items + compute per-order totals ─────────────────────
      //       Uses getOrderTotal / getItemTotal — identical to the frontend.
      const allNormalizedItems: Record<string, unknown>[] = [];
      let grandDiscount = 0;
      let primaryDoc = candidateDocs[0];

      for (const doc of candidateDocs) {
        const data = doc.data() as Record<string, unknown>;

        const rawItems = Array.isArray(data.items)
          ? (data.items as Record<string, unknown>[])
          : [];

        // Skip orders with no billable items (mirrors frontend hasBillableItems)
        if (rawItems.length === 0) continue;

        const normalized = rawItems.map((item) => normalizeItem(item, doc.id));
        allNormalizedItems.push(...normalized);

        // Accumulate order-level discounts; subtotal will be computed from item totals
        grandDiscount += getOrderDiscount(data);

        // track most-recently-updated order as "primary"
        const curMs =
          readNumber(
            (data.updatedAt as { toMillis?: () => number })?.toMillis?.(),
            0
          ) ||
          readNumber(
            (data.createdAt as { toMillis?: () => number })?.toMillis?.(),
            0
          );
        const priData = primaryDoc.data() as Record<string, unknown>;
        const priMs =
          readNumber(
            (priData.updatedAt as { toMillis?: () => number })?.toMillis?.(),
            0
          ) ||
          readNumber(
            (priData.createdAt as { toMillis?: () => number })?.toMillis?.(),
            0
          );
        if (curMs > priMs) primaryDoc = doc;
      }

      if (allNormalizedItems.length === 0) {
        res.status(400).json({ success: false, message: "Cannot finalize empty order" });
        return;
      }

      // Recompute subtotal as the sum of all normalised item.totalPrice to match frontend live total
      const subtotalFromItems = allNormalizedItems.reduce((sum, it) => sum + readNumber(it.totalPrice, 0), 0);
      // Fallback: if no item-level totals exist, fall back to summing order-level totals
      const subtotalFromOrders = candidateDocs.reduce(
        (s, doc) => s + getOrderTotal(doc.data() as Record<string, unknown>),
        0
      );
      // ── 4. Pricing — mirrors frontend handleGenerateBill exactly ──────────
      const subtotal = Math.round(subtotalFromItems || subtotalFromOrders);
      const discount = Math.round(grandDiscount);
      // Show Grand Total as the live subtotal (sum of item totals) — frontend's "Live Total"
      const discountedPrice = subtotal;
      const tax = Math.round(discountedPrice * 0.05); // 5% GST
      const total = discountedPrice + tax;

      const pricing = { subtotal, discount, discountedPrice, tax, total };

      // ── 5. Offer grouping — same bucket logic as frontend ─────────────────
      const buckets = buildOfferBuckets(allNormalizedItems);
      const displayBillGroups = Array.from(buckets.values()).map((bucket) => ({
        offerId: bucket.offerId,
        offerType: bucket.offerType,
        offerTitle: bucket.offerTitle,
        items: bucket.items,
        groupDiscountedPrice: bucket.items.reduce(
          (sum, item) => sum + readNumber(item.totalPrice, 0),
          0
        ),
      }));

      const appliedOffers = displayBillGroups.map((g) => ({
        offerId: g.offerId,
        title: g.offerTitle,
        type: g.offerType,
        offerType: g.offerType,
        amount: 0, // discount already baked into item.totalPrice via getItemTotal
      }));

      const primaryData = primaryDoc.data() as Record<string, unknown>;

      console.info(
        `[generateBill] subtotal=${subtotal} discount=${discount} discountedPrice=${discountedPrice} tax=${tax} total=${total} items=${allNormalizedItems.length}`
      );

      res.status(200).json({
        success: true,
        orderId: primaryDoc.id,
        sessionId: primaryData.sessionId || null,
        tableId: primaryData.tableId || null,
        items: allNormalizedItems,
        pricing,
        displayBillGroups,
        appliedOffers,
        appliedOfferLogs: displayBillGroups, // kept for any legacy consumers
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