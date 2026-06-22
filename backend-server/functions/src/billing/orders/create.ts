import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {Request, Response} from "express";
import {FieldValue} from "firebase-admin/firestore";
import {earnPoints} from "../../customer/loyalty/earnPoints";
import {createOrGetSession} from "../../shared/session/sessionUtils";
import {calculateSubtotal} from "../../shared/utilities/billing/pricing";
import {applyTax} from "../../shared/utilities/billing/tax";
import {getOfferDocs, getProductDoc} from "../../shared/utilities/firestoreCatalog";
import {
  normalizeOrderItemsForPricing,
  applyOfferPricingByGroup,
  buildPricingSummaryFromItems,
} from "../../shared/utilities/offers/orderPricing";
import {applyOffer} from "../../shared/utilities/offers/applyOffer";

const db = admin.firestore();

const resolvePlacedBy = (value: unknown): "billing" | "customer" => {
  return value === "customer" ? "customer" : "billing";
};

const readString = (value: unknown): string => String(value ?? "").trim();
const readNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const createOrder = functions.https.onRequest(
  async (req: Request, res: Response): Promise<void> => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.status(200).send("");
      return;
    }

    try {
      if (req.method !== "PUT") {
        res.status(405).json({success: false, message: "Method not allowed"});
        return;
      }

      const {
        outletId,
        customerName,
        customerId,
        customerPhone,
        placedBy,
        tableId,
        items,
        totalAmount,
        offerId,
        autoAppliedOfferId,
        orderType: requestedOrderType,
      } = req.body;
      if (!outletId || !items || !Array.isArray(items)) {
        res.status(400).json({success: false, message: "outletId and items array are required"});
        return;
      }
      if (items.length === 0) {
        res.status(400).json({success: false, message: "Order must contain at least one item"});
        return;
      }

      let activeSessionId = null;
      if (tableId) {
        try {
          const sessionResult = await createOrGetSession(outletId, String(tableId), {uid: customerId || null, name: customerName || null});
          activeSessionId = sessionResult.sessionId;
        } catch (err) {
          console.error("Failed to create/get session for order:", err);
        }
      }

      const resolveProductPrice = async (productId: string): Promise<number | null> => {
        const id = readString(productId);
        if (!id) return null;
        const productDoc = await getProductDoc(id, outletId);
        return productDoc && Number.isFinite(productDoc.price) ? productDoc.price : null;
      };

      const normalizedItems = await normalizeOrderItemsForPricing(items, resolveProductPrice);

      for (const item of normalizedItems) {
        const productDoc = await getProductDoc(item.productId, outletId);
        if (!productDoc) continue;
        item.name = productDoc.name || item.name;
        item.category = productDoc.category || null;
        item.subcategory = productDoc.subcategory || null;
      }

      const requestedOfferId = readString(autoAppliedOfferId) || readString(offerId) || null;
      const uniqueOfferIds = new Set<string>();
      if (requestedOfferId) uniqueOfferIds.add(requestedOfferId);
      for (const item of normalizedItems) {
        const itemOfferId = readString(item.offerId);
        if (itemOfferId) uniqueOfferIds.add(itemOfferId);
      }

      const offerDocsById = await getOfferDocs(uniqueOfferIds, outletId);

      // Pre-Validation: Validate global usage limit and active state
      for (const offerDoc of offerDocsById.values()) {
        if (!offerDoc) continue;
        const isActive = offerDoc.isActive !== false;
        const usageLimit = Number(offerDoc.usageLimit || 0);
        const usedCount = Number(offerDoc.usedCount || 0);

        if (!isActive || (usageLimit > 0 && usedCount >= usageLimit)) {
          throw new Error("OFFER_USAGE_LIMIT_REACHED");
        }
      }

      const subTotal = calculateSubtotal(normalizedItems);
      const itemsWithPricing = applyOfferPricingByGroup(normalizedItems, offerDocsById as any, applyTax);
      const primaryOfferDoc = requestedOfferId ? (offerDocsById.get(requestedOfferId) || null) : null;
      const {orderType: appliedOrderType} = applyOffer({subTotal, items: itemsWithPricing}, primaryOfferDoc);
      const resolvedOrderType = readString(requestedOrderType).toUpperCase() || appliedOrderType;
      const pricing = buildPricingSummaryFromItems(itemsWithPricing);
      const computedTotalAmount = readNumber(totalAmount, Number.NaN);
      const finalTotalAmount = Number.isFinite(computedTotalAmount) ? computedTotalAmount : pricing.grandTotal;

      const orderRef = db.collection("outlets").doc(outletId).collection("orders").doc();

      const orderData = {
        outletId,
        customerName: (customerName || "Walk-in Customer").trim(),
        customerId: customerId ? String(customerId).trim() : null,
        customerPhone: customerPhone ? String(customerPhone).trim() : "",
        placedBy: resolvePlacedBy(placedBy),
        orderType: resolvedOrderType,
        tableId: tableId || null,
        sessionId: activeSessionId,
        items: itemsWithPricing,
        offerId: requestedOfferId,
        autoAppliedOfferId: requestedOfferId,
        subTotal: pricing.subTotal,
        discount: pricing.discount,
        discountedPrice: pricing.discountedPrice,
        tax: pricing.tax,
        status: req.body.status || req.body.orderStatus || "in-progress",
        totalAmount: finalTotalAmount,
        timeOfOrder: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      // Run Firestore transaction to atomically validate offers, increment counts/deactivate, and create the order
      await db.runTransaction(async (tx) => {
        const uniqueOfferIdsList = Array.from(uniqueOfferIds);
        const offersMap = new Map<string, { ref: FirebaseFirestore.DocumentReference, snap: FirebaseFirestore.DocumentSnapshot }>();

        // 1. Reads: Get and validate offer documents inside the transaction
        for (const offId of uniqueOfferIdsList) {
          let offerRef = db.collection("outlets").doc(outletId).collection("offers").doc(offId);
          let offerSnap = await tx.get(offerRef);
          if (!offerSnap.exists) {
            offerRef = db.collection("offers").doc(offId);
            offerSnap = await tx.get(offerRef);
          }
          offersMap.set(offId, {ref: offerRef, snap: offerSnap});

          if (offerSnap.exists) {
            const offerData = offerSnap.data() || {};
            const usageLimit = Number(offerData.usageLimit || 0);
            const usedCount = Number(offerData.usedCount || 0);
            const isActive = offerData.isActive !== false;

            if (!isActive || (usageLimit > 0 && usedCount >= usageLimit)) {
              throw new Error("OFFER_USAGE_LIMIT_REACHED");
            }
          }
        }

        // 2. Writes: Update offer documents
        for (const offId of uniqueOfferIdsList) {
          const entry = offersMap.get(offId);
          if (entry && entry.snap.exists) {
            const offerData = entry.snap.data() || {};
            const usageLimit = Number(offerData.usageLimit || 0);
            const usedCount = Number(offerData.usedCount || 0);

            const nextUsedCount = usedCount + 1;
            const offerUpdate: Record<string, any> = {
              usedCount: nextUsedCount,
            };
            if (usageLimit > 0 && nextUsedCount >= usageLimit) {
              offerUpdate.isActive = false;
            }
            tx.update(entry.ref, offerUpdate);
          }
        }

        // 3. Writes: Set the order document
        tx.set(orderRef, orderData);
      });

      if (customerId) {
        earnPoints(customerId, customerName, finalTotalAmount, itemsWithPricing, orderRef.id);
      }

      res.status(201).json({success: true, id: orderRef.id, message: "Order created successfully"});
    } catch (error) {
      console.error("Error creating order:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      if (message === "OFFER_USAGE_LIMIT_REACHED") {
        res.status(409).json({success: false, message: "Offer usage limit reached. Please remove the offer and try again."});
        return;
      }
      res.status(500).json({success: false, message, error: String(error)});
    }
  }
);
