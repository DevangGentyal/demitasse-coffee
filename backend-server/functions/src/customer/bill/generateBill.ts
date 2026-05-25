import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { applyTax } from "../../shared/utilities/billing/tax";
import { normalizeBillItemsForDisplay } from "../../shared/utilities/offers/orderPricing";
import { handleCustomerPreflight } from "../../shared/utilities/security/cors";

const db = admin.firestore();
const readNumber = (value: unknown, fallback = 0): number => { const numeric = Number(value); return Number.isFinite(numeric) ? numeric : fallback; };
export const generateBill = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	if (handleCustomerPreflight(req, res)) return;
	if (req.method !== "POST") { res.status(405).json({ success: false, message: "Method not allowed" }); return; }

	try {
		const { sessionId, tableId } = req.body as { sessionId?: string; tableId?: string };
		console.info('[customerBillingGenerateBill] request', {
			method: req.method,
			sessionId: sessionId || null,
			tableId: tableId || null,
		});
		if (!sessionId && !tableId) { res.status(400).json({ success: false, message: "sessionId or tableId is required" }); return; }

		const result = await db.runTransaction(async (tx) => {
			let candidates: FirebaseFirestore.QueryDocumentSnapshot[] = [];
			if (sessionId && tableId) {
				const [sessionSnap, tableSnap] = await Promise.all([tx.get(db.collection("orders").where("sessionId", "==", sessionId)), tx.get(db.collection("orders").where("tableId", "==", tableId.toString()))]);
				const map = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
				sessionSnap.docs.forEach(d => map.set(d.id, d)); tableSnap.docs.forEach(d => map.set(d.id, d)); candidates = Array.from(map.values());
			} else if (sessionId) { candidates = (await tx.get(db.collection("orders").where("sessionId", "==", sessionId))).docs; }
			else if (tableId) { candidates = (await tx.get(db.collection("orders").where("tableId", "==", tableId.toString()))).docs; }
			console.info('[customerBillingGenerateBill] candidate count before filter', {
				sessionId: sessionId || null,
				tableId: tableId || null,
				count: candidates.length,
				ids: candidates.map(doc => doc.id),
			});

			candidates = candidates.filter(doc => { const data = doc.data(); const status = String(data.status || "").toUpperCase(); const oStatus = String(data.orderStatus || "").toLowerCase(); return status !== "ARCHIVED" && oStatus !== "archived"; });
			console.info('[customerBillingGenerateBill] candidate count after filter', {
				sessionId: sessionId || null,
				tableId: tableId || null,
				count: candidates.length,
				ids: candidates.map(doc => doc.id),
			});
			if (candidates.length === 0) throw new Error("ORDER_NOT_FOUND");

			type OrderSummary = {
				orderId: string;
				subTotal: number;
				discount: number;
				discountedPrice: number;
				items: any[];
			};

			const allItems: any[] = [];
			const orderSummaries: OrderSummary[] = [];
			let outletId = "";
			let primaryOrderDoc = candidates[0];

			for (const doc of candidates) {
				const data = doc.data();
				if (!outletId) outletId = String(data.outletId || "");

				const normalizedItems = normalizeBillItemsForDisplay(Array.isArray(data.items) ? data.items : []);
				const itemFallbackSubtotal = Math.round(
					normalizedItems.reduce((sum, item) => sum + readNumber(item.totalPrice, 0), 0)
				);

				const rawSubTotal = readNumber(
					data.subTotal ?? data.pricing?.subtotal ?? data.itemTotal,
					Number.NaN
				);
				const rawDiscount = readNumber(
					data.discount ?? data.pricing?.discount,
					Number.NaN
				);
				const rawDiscounted = readNumber(
					data.discountedPrice ?? data.pricing?.discountedPrice ?? data.totalAmount ?? data.subTotal ?? data.itemTotal,
					Number.NaN
				);

				const resolvedSubTotal = Number.isFinite(rawSubTotal) ? Math.round(rawSubTotal) : itemFallbackSubtotal;
				const resolvedDiscounted = Number.isFinite(rawDiscounted)
					? Math.round(rawDiscounted)
					: Math.max(
						resolvedSubTotal - (Number.isFinite(rawDiscount) ? Math.round(rawDiscount) : 0),
						0
					);
				const resolvedDiscount = Number.isFinite(rawDiscount)
					? Math.round(rawDiscount)
					: Math.max(resolvedSubTotal - resolvedDiscounted, 0);

				const annotateItemsTree = (itemsList: any[]): any[] => {
					return itemsList.map((item) => {
						const nested = Array.isArray(item.items) ? annotateItemsTree(item.items) : item.items;
						return {
							...item,
							orderId: doc.id,
							orderSubTotal: resolvedDiscounted,
							orderDiscount: resolvedDiscount,
							orderDiscountedPrice: resolvedDiscounted,
							items: nested,
						};
					});
				};

				const enrichedOrderItems = annotateItemsTree(normalizedItems);
				allItems.push(...enrichedOrderItems);
				orderSummaries.push({
					orderId: doc.id,
					subTotal: resolvedSubTotal,
					discount: resolvedDiscount,
					discountedPrice: resolvedDiscounted,
					items: enrichedOrderItems,
				});

				const curTime = readNumber((data.updatedAt as { toMillis?: () => number })?.toMillis?.(), 0) || readNumber((data.createdAt as { toMillis?: () => number })?.toMillis?.(), 0);
				const priTime = readNumber((primaryOrderDoc.data().updatedAt as { toMillis?: () => number })?.toMillis?.(), 0) || readNumber((primaryOrderDoc.data().createdAt as { toMillis?: () => number })?.toMillis?.(), 0);
				if (curTime > priTime) primaryOrderDoc = doc;
			}

			// ── Enrich item categories from Firestore products collection (safeguard inside transaction) ────────
			const getUniqueProductIds = (itemsList: any[]): Set<string> => {
				const ids = new Set<string>();
				for (const item of itemsList) {
					const pid = String(item.productId || item.id || '').trim();
					if (pid && !pid.startsWith('discount_') && !pid.startsWith('combo_') && !pid.startsWith('b1g1_') && !pid.startsWith('birthday_')) {
						ids.add(pid);
					}
					if (Array.isArray(item.items)) {
						getUniqueProductIds(item.items).forEach(id => ids.add(id));
					}
				}
				return ids;
			};

			const uniqueProductIds = Array.from(getUniqueProductIds(allItems));
			const productDataMap = new Map<string, { category: string; subcategory: string; name?: string }>();

			if (uniqueProductIds.length > 0) {
				await Promise.all(uniqueProductIds.map(async (pid) => {
					try {
						const snap = await tx.get(db.collection('products').doc(pid));
						if (snap.exists) {
							const data = snap.data() || {};
							productDataMap.set(pid, {
								category: String(data.category || '').trim(),
								subcategory: String(data.subcategory || '').trim(),
								name: String(data.name || '').trim(),
							});
						}
					} catch (err) {
						console.warn(`Failed to fetch product metadata for ${pid}`, err);
					}
				}));
			}

			const enrichItemsTree = (itemsList: any[]) => {
				for (const item of itemsList) {
					const pid = String(item.productId || item.id || '').trim();
					const meta = productDataMap.get(pid);
					if (meta) {
						item.category = meta.category || null;
						item.subcategory = meta.subcategory || null;
						if (!item.name) item.name = meta.name;
					} else {
						item.category = item.category || null;
						item.subcategory = item.subcategory || null;
					}
					if (Array.isArray(item.items)) {
						enrichItemsTree(item.items);
					}
				}
			};

			enrichItemsTree(allItems);

			if (allItems.length === 0) throw new Error("EMPTY_CART");

			const primaryData = primaryOrderDoc.data();

			const subtotal = Math.round(orderSummaries.reduce((sum, order) => sum + readNumber(order.subTotal, 0), 0));
			const discount = Math.round(orderSummaries.reduce((sum, order) => sum + readNumber(order.discount, 0), 0));
			const discountedPrice = Math.round(orderSummaries.reduce((sum, order) => sum + readNumber(order.discountedPrice, 0), 0));
			const tax = applyTax(Math.max(discountedPrice, 0));
			const grandTotal = Math.max(discountedPrice, 0) + tax;
			const pricing = {
				subTotal: subtotal,
				discount,
				discountedPrice: Math.max(discountedPrice, 0),
				tax,
				grandTotal,
			};

			const rawTotalPrice = subtotal;

			const overallDiscount = Math.max(pricing.discount, 0);

			const pricingResponse = {
				subtotal: pricing.subTotal,
				discount: pricing.discount,
				discountedPrice: pricing.discountedPrice,
				tax: pricing.tax,
				total: pricing.grandTotal,
				rawTotalPrice,
				overallDiscount,
			};

			// ── Offer grouping: mirror OrderViewModal computation per order ─────────────────────────
			type FlatOfferItem = {
				productId: string;
				name: string;
				qty: number;
				unitPrice: number;
				totalPrice: number;
				isFree: boolean;
				isCombo: boolean;
				isManualB1G1: boolean;
				isDiscount: boolean;
				isBirthday: boolean;
				offerId: string;
				offerType: string;
				offerTitle: string;
			};

			const flattenOfferItemsForOrder = (itemsList: any[], inheritedOfferMeta?: { offerId?: string; offerType?: string; offerTitle?: string }): FlatOfferItem[] => {
				const flat: FlatOfferItem[] = [];
				for (const item of itemsList) {
					if (!item) continue;
					const nested = Array.isArray(item.items) ? item.items : [];
					const offerId = String(item.offerId || inheritedOfferMeta?.offerId || '').trim();
					const offerType = String(item.offerType || inheritedOfferMeta?.offerType || '').trim();
					const offerTitle = String(item.offerTitle || inheritedOfferMeta?.offerTitle || '').trim();
					if (nested.length > 0) {
						flat.push(...flattenOfferItemsForOrder(nested, { offerId, offerType, offerTitle }));
						continue;
					}
					flat.push({
						productId: String(item.productId || item.id || '').trim(),
						name: String(item.name || '').trim(),
						qty: Number(item.qty ?? item.quantity ?? 1),
						unitPrice: Number(item.unitPrice ?? item.price ?? 0),
						totalPrice: Number(item.totalPrice ?? 0),
						isFree: Boolean(item.isFree),
						isCombo: Boolean(item.isCombo),
						isManualB1G1: Boolean(item.isManualB1G1),
						isDiscount: Boolean(item.isDiscount),
						isBirthday: Boolean(item.isBirthday),
						offerId,
						offerType,
						offerTitle,
					});
				}
				return flat;
			};

			const appliedOfferLogs: Array<{
				offerId: string;
				offerTitle: string;
				offerType: string;
				description: string;
				groupSubtotal: number;
				groupDiscount: number;
				groupDiscountedPrice: number;
				items: Array<{
					name: string;
					productId: string;
					qty: number;
					unitPrice: number;
					totalPrice: number;
					isFree: boolean;
				}>;
			}> = [];

			for (const order of orderSummaries) {
				const flatItems = flattenOfferItemsForOrder(order.items);
				const offerBuckets = new Map<string, { offerId: string; offerType: string; offerTitle: string; items: FlatOfferItem[] }>();
				const regularItems: FlatOfferItem[] = [];

				for (const item of flatItems) {
					const rawOfferId = String(item.offerId || '').trim();
					const rawOfferTitle = String(item.offerTitle || '').trim();
					const rawOfferType = String(item.offerType || '').trim();
					const isOffer = item.isCombo || item.isManualB1G1 || item.isDiscount || item.isBirthday || item.isFree;
					const fallbackOfferId = `${rawOfferType || 'offer'}::${rawOfferTitle || 'group'}`;
					const bucketId = rawOfferId || (isOffer ? fallbackOfferId : '');

					if (!bucketId) {
						regularItems.push(item);
						continue;
					}

					if (!offerBuckets.has(bucketId)) {
						offerBuckets.set(bucketId, {
							offerId: bucketId,
							offerType: rawOfferType || (item.isCombo ? 'COMBO' : item.isManualB1G1 ? 'B1G1' : item.isDiscount ? 'DISCOUNT' : item.isBirthday ? 'BIRTHDAY' : 'OFFER'),
							offerTitle: rawOfferTitle || 'Offer Group',
							items: [],
						});
					}
					offerBuckets.get(bucketId)!.items.push(item);
				}

				const offerBucketList = Array.from(offerBuckets.values());
				const basicSubtotal = regularItems.reduce((sum, item) => sum + readNumber(item.totalPrice, 0), 0);
				const totalOfferSubtotal = offerBucketList.reduce(
					(sum, bucket) => sum + bucket.items.reduce((bucketSum, bucketItem) => bucketSum + readNumber(bucketItem.totalPrice, 0), 0),
					0
				);

				for (const bucket of offerBucketList) {
					const bucketSubtotal = Math.round(bucket.items.reduce((sum, bucketItem) => sum + readNumber(bucketItem.totalPrice, 0), 0));
					let orderBasedPrice = Number.NaN;
					if (Number.isFinite(order.discountedPrice)) {
						if (offerBucketList.length === 1) {
							orderBasedPrice = Math.max(Math.round(order.discountedPrice - basicSubtotal), 0);
						} else if (totalOfferSubtotal > 0) {
							const bucketDiscountShare = (order.discount * bucketSubtotal) / totalOfferSubtotal;
							orderBasedPrice = Math.max(Math.round(bucketSubtotal - bucketDiscountShare), 0);
						}
					}

					const groupDiscountedPrice = Number.isFinite(orderBasedPrice) ? Math.round(orderBasedPrice) : bucketSubtotal;
					const groupDiscount = Math.max(bucketSubtotal - groupDiscountedPrice, 0);

					appliedOfferLogs.push({
						offerId: bucket.offerId,
						offerTitle: bucket.offerTitle,
						offerType: bucket.offerType,
						description: `${bucket.offerType} offer applied in order ${order.orderId.slice(0, 8)}.`,
						groupSubtotal: bucketSubtotal,
						groupDiscount,
						groupDiscountedPrice,
						items: bucket.items.map((i) => ({
							name: i.name,
							productId: i.productId,
							qty: i.qty,
							unitPrice: i.unitPrice,
							totalPrice: i.totalPrice,
							isFree: i.isFree,
						})),
					});
				}
			}

			const appliedOffers = appliedOfferLogs.map((log) => ({
				offerId: log.offerId,
				title: log.offerTitle,
				type: log.offerType,
				offerType: log.offerType,
				amount: log.groupDiscount,
			}));

			const uniqueOfferTypes = Array.from(new Set(appliedOfferLogs.map((log) => String(log.offerType || '').toUpperCase()).filter(Boolean)));
			const orderType = uniqueOfferTypes.length === 0 ? 'BASIC' : uniqueOfferTypes.length === 1 ? uniqueOfferTypes[0] : 'MIXED';

			const displayBillGroups = appliedOfferLogs.map((log) => ({
				offerId: log.offerId,
				offerTitle: log.offerTitle,
				offerType: log.offerType,
				groupSubtotal: log.groupSubtotal,
				groupDiscount: log.groupDiscount,
				groupDiscountedPrice: log.groupDiscountedPrice,
				items: log.items,
			}));

			// ── Build a beautiful server-side log box ────────────────────────
			const logBorder = '┌────────────────────────────────────────────────────────┐';
			const logDivider = '├────────────────────────────────────────────────────────┤';
			const logBottom = '└────────────────────────────────────────────────────────┘';

			let logStr = `\n${logBorder}\n│               APPLIED OFFERS BILL SUMMARY              │\n${logDivider}\n`;
			logStr += `│ Raw Total Price:  ₹${rawTotalPrice.toString().padEnd(35)} │\n`;
			logStr += `│ Tax (5%):         ₹${pricing.tax.toString().padEnd(35)} │\n`;
			logStr += `│ Grand Total:      ₹${pricing.grandTotal.toString().padEnd(35)} │\n`;
			logStr += `│ Overall Discount: ₹${overallDiscount.toString().padEnd(35)} │\n`;

			if (appliedOfferLogs.length > 0) {
				logStr += `${logDivider}\n│ Applied Offers & Items Details:                        │\n`;
				for (const log of appliedOfferLogs) {
					logStr += `│  • Offer: ${log.offerTitle.padEnd(43)} │\n`;
					logStr += `│    Type:  ${log.offerType.padEnd(43)} │\n`;
					logStr += `│    Group Subtotal: ₹${String(log.groupSubtotal).padEnd(30)} │\n`;
					logStr += `│    Group Discount: ₹${String(log.groupDiscount).padEnd(30)} │\n`;
					logStr += `│    Group Net:      ₹${String(log.groupDiscountedPrice).padEnd(30)} │\n`;
					logStr += `│    Items:                                              │\n`;
					for (const item of log.items) {
						const details = `${item.name} (Qty: ${item.qty}, Price: ${item.isFree ? 'FREE' : `₹${item.totalPrice}`})`;
						logStr += `│      - ${details.padEnd(47)} │\n`;
					}
					const descWords = log.description.split(' ');
					let currentLine = '│    ';
					for (const word of descWords) {
						if (currentLine.length + word.length + 1 > 50) {
							logStr += `${currentLine.padEnd(56)} │\n`;
							currentLine = '│    ' + word;
						} else {
							currentLine += (currentLine === '│    ' ? '' : ' ') + word;
						}
					}
					if (currentLine.length > 5) {
						logStr += `${currentLine.padEnd(56)} │\n`;
					}
					logStr += `│                                                        │\n`;
				}
			} else {
				logStr += `${logDivider}\n│ No active offers applied to this bill.                  │\n`;
			}
			logStr += logBottom;
			console.info(logStr);

			return {
				orderId: primaryOrderDoc.id,
				orderType,
				sessionId: primaryData.sessionId || null,
				tableId: primaryData.tableId || null,
				items: allItems,
				...pricing,
				rawTotalPrice,
				overallDiscount,
				pricing: pricingResponse,
				appliedOffers,
				appliedOfferLogs,
				displayBillGroups,
				noteToCustomer: "Your calculated bill is ready."
			};
		});

		res.status(200).json({ success: true, ...result });
	} catch (error) {
		if (error instanceof Error) {
			if (error.message === "ORDER_NOT_FOUND") { res.status(404).json({ success: false, message: "Order not found" }); return; }
			if (error.message === "EMPTY_CART") { res.status(400).json({ success: false, message: "Cannot finalize empty order" }); return; }
		}
		console.error("generateBill error:", error);
		res.status(500).json({ success: false, message: "Internal server error", error: String(error) });
	}
});