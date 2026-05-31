import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import { earnPoints } from "../../customer/loyalty/earnPoints";
import { createOrGetSession } from "../../shared/session/sessionUtils";
import { calculateSubtotal } from "../../shared/utilities/billing/pricing";
import { applyTax } from "../../shared/utilities/billing/tax";
import {
	normalizeOrderItemsForPricing,
	applyOfferPricingByGroup,
	buildPricingSummaryFromItems,
} from "../../shared/utilities/offers/orderPricing";
import { applyOffer, OfferDocument } from "../../shared/utilities/offers/applyOffer";

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
				res.status(405).json({ success: false, message: "Method not allowed" });
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
				res.status(400).json({ success: false, message: "outletId and items array are required" });
				return;
			}
			if (items.length === 0) {
				res.status(400).json({ success: false, message: "Order must contain at least one item" });
				return;
			}

			let activeSessionId = null;
			if (tableId) {
				try {
					const sessionResult = await createOrGetSession(outletId, String(tableId), { uid: customerId || null, name: customerName || null });
					activeSessionId = sessionResult.sessionId;
				} catch (err) {
					console.error("Failed to create/get session for order:", err);
				}
			}

			const resolveProductPrice = async (productId: string): Promise<number | null> => {
				const id = readString(productId);
				if (!id) return null;
				try {
					const snap = await db.collection("products").doc(id).get();
					if (!snap.exists) return null;
					const price = readNumber((snap.data() || {}).price, Number.NaN);
					return Number.isFinite(price) ? price : null;
				} catch {
					return null;
				}
			};

			const normalizedItems = await normalizeOrderItemsForPricing(items, resolveProductPrice);

			for (const item of normalizedItems) {
				try {
					const snap = await db.collection("products").doc(item.productId).get();
					if (!snap.exists) continue;
					const pd = snap.data() || {};
					item.name = readString(pd.name) || item.name;
					item.category = readString(pd.category) || null;
					item.subcategory = readString(pd.subcategory) || null;
				} catch {
					// Ignore enrichment failures; canonical pricing is already resolved.
				}
			}

			const requestedOfferId = readString(autoAppliedOfferId) || readString(offerId) || null;
			const uniqueOfferIds = new Set<string>();
			if (requestedOfferId) uniqueOfferIds.add(requestedOfferId);
			for (const item of normalizedItems) {
				const itemOfferId = readString(item.offerId);
				if (itemOfferId) uniqueOfferIds.add(itemOfferId);
			}

			const offerDocsById = new Map<string, OfferDocument>();
			await Promise.all(Array.from(uniqueOfferIds).map(async (offerDocId) => {
				const offerSnap = await db.collection("offers").doc(offerDocId).get();
				if (offerSnap.exists) {
					offerDocsById.set(offerDocId, { id: offerSnap.id, ...(offerSnap.data() || {}) } as OfferDocument);
				}
			}));

			const subTotal = calculateSubtotal(normalizedItems);
			const itemsWithPricing = applyOfferPricingByGroup(normalizedItems, offerDocsById as any, applyTax);
			const primaryOfferDoc = requestedOfferId ? (offerDocsById.get(requestedOfferId) || null) : null;
			const { orderType: appliedOrderType } = applyOffer({ subTotal, items: itemsWithPricing }, primaryOfferDoc);
			const resolvedOrderType = readString(requestedOrderType).toUpperCase() || appliedOrderType;
			const pricing = buildPricingSummaryFromItems(itemsWithPricing);
			const computedTotalAmount = readNumber(totalAmount, Number.NaN);
			const finalTotalAmount = Number.isFinite(computedTotalAmount) ? computedTotalAmount : pricing.grandTotal;

			const orderRef = db.collection("orders").doc();

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
				orderStatus: req.body.orderStatus || "in-progress",
				totalAmount: finalTotalAmount,
				timeOfOrder: FieldValue.serverTimestamp(),
				createdAt: FieldValue.serverTimestamp(),
				updatedAt: FieldValue.serverTimestamp(),
			};

			await orderRef.set(orderData);
			if (customerId) {
				earnPoints(customerId, customerName, finalTotalAmount, itemsWithPricing, orderRef.id);
			}

			res.status(201).json({ success: true, id: orderRef.id, message: "Order created successfully" });
		} catch (error) {
			console.error("Error creating order:", error);
			res.status(500).json({ success: false, message: "Internal server error", error: String(error) });
		}
	}
);
