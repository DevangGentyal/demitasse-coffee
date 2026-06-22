import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {Request, Response} from "express";
import {FieldValue} from "firebase-admin/firestore";
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
const normalizeOrderStatus = (value: unknown): "pending" | "in-progress" | "ready" | "completed" => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "in-progress" || raw === "in progress" || raw === "working" || raw === "preparing") return "in-progress";
  if (raw === "ready") return "ready";
  if (raw === "completed" || raw === "complete" || raw === "delivered" || raw === "finalized") return "completed";
  return "pending";
};

const readString = (value: unknown): string => String(value ?? "").trim();
export const updateOrder = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(200).send(""); return;
  }

  try {
    if (req.method !== "PUT") {
      res.status(405).json({success: false, message: "Method not allowed"}); return;
    }
    const {outletId, orderId, orderStatus, status, items, offerId, autoAppliedOfferId, orderType: requestedOrderType} = req.body;
    if (!outletId || !orderId) {
      res.status(400).json({success: false, message: "outletId and orderId are required"}); return;
    }
    const nextStatusSource = orderStatus ?? status;
    const hasStatusUpdate = !(typeof nextStatusSource === "undefined" || nextStatusSource === null || String(nextStatusSource).trim() === "");
    const hasItemsUpdate = Array.isArray(items);
    if (!hasStatusUpdate && !hasItemsUpdate) {
      res.status(400).json({success: false, message: "Provide status/orderStatus and/or items to update"});
      return;
    }

    const orderRef = db.collection("outlets").doc(outletId).collection("orders").doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists) {
      res.status(404).json({success: false, message: "Order not found"}); return;
    }
    const orderData = orderSnap.data() || {};
    if (orderData?.outletId !== outletId) {
      res.status(403).json({success: false, message: "Order does not belong to this outlet"}); return;
    }

    const updateData: any = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (hasStatusUpdate) {
      const normalizedOrderStatus = normalizeOrderStatus(nextStatusSource);
      updateData.status = normalizedOrderStatus;
    }

    if (hasItemsUpdate) {
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

      const effectiveOfferId =
				readString(autoAppliedOfferId) ||
				readString(offerId) ||
				readString(orderData.autoAppliedOfferId) ||
				readString(orderData.offerId) ||
				null;

      const uniqueOfferIds = new Set<string>();
      if (effectiveOfferId) uniqueOfferIds.add(effectiveOfferId);
      for (const item of normalizedItems) {
        const itemOfferId = readString(item.offerId);
        if (itemOfferId) uniqueOfferIds.add(itemOfferId);
      }

      const offerDocsById = await getOfferDocs(uniqueOfferIds, outletId);

      const subTotal = calculateSubtotal(normalizedItems);
      const itemsWithPricing = applyOfferPricingByGroup(normalizedItems, offerDocsById as any, applyTax);
      const primaryOfferDoc = effectiveOfferId ? (offerDocsById.get(effectiveOfferId) || null) : null;
      const {orderType: appliedOrderType} = applyOffer({subTotal, items: itemsWithPricing}, primaryOfferDoc);
      const resolvedOrderType = readString(requestedOrderType).toUpperCase() || readString(orderData.orderType).toUpperCase() || appliedOrderType;
      const pricing = buildPricingSummaryFromItems(itemsWithPricing);

      updateData.items = itemsWithPricing;
      updateData.orderType = resolvedOrderType;
      updateData.offerId = effectiveOfferId;
      updateData.autoAppliedOfferId = effectiveOfferId;
      updateData.subTotal = pricing.subTotal;
      updateData.discount = pricing.discount;
      updateData.discountedPrice = pricing.discountedPrice;
      updateData.tax = pricing.tax;
      updateData.totalAmount = pricing.grandTotal;
    }

    await orderRef.update(updateData);
    res.status(200).json({success: true, id: orderId, message: "Order updated successfully"});
  } catch (error) {
    console.error("Error updating order:", error);
    res.status(500).json({success: false, message: "Internal server error", error: String(error)});
  }
});
