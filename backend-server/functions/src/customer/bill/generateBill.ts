import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { Request, Response } from "express";
import { calculateSubtotal } from "../../shared/utilities/billing/pricing";
import { applyTax } from "../../shared/utilities/billing/tax";
import { applyOffer } from "../../shared/utilities/offers/applyOffer";
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

			const allItems: any[] = []; let outletId = ""; let primaryOrderDoc = candidates[0];
			for (const doc of candidates) { const data = doc.data(); if (!outletId) outletId = String(data.outletId || ""); allItems.push(...normalizeBillItemsForDisplay(Array.isArray(data.items) ? data.items : [])); const curTime = readNumber((data.updatedAt as { toMillis?: () => number })?.toMillis?.(), 0) || readNumber((data.createdAt as { toMillis?: () => number })?.toMillis?.(), 0); const priTime = readNumber((primaryOrderDoc.data().updatedAt as { toMillis?: () => number })?.toMillis?.(), 0) || readNumber((primaryOrderDoc.data().createdAt as { toMillis?: () => number })?.toMillis?.(), 0); if (curTime > priTime) primaryOrderDoc = doc; }

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

			let rawTotalPrice = 0;
			for (const doc of candidates) {
				const data = doc.data() || {};
				rawTotalPrice += readNumber(data.subTotal, 0);
			}
			rawTotalPrice = Math.round(rawTotalPrice);

			const primaryData = primaryOrderDoc.data();
			let offerDoc: FirebaseFirestore.DocumentData | null = null;
			const offerId = String(primaryData.offerId || primaryData.autoAppliedOfferId || "");
			if (offerId) {
				const offerSnap = await tx.get(db.collection("offers").doc(offerId));
				offerDoc = offerSnap.exists ? { id: offerSnap.id, ...(offerSnap.data() || {}) } : null;
			}
			const orderType = offerDoc?.offerType || offerDoc?.type ? String(offerDoc.offerType || offerDoc.type).toUpperCase() : "BASIC";
			let subtotal = calculateSubtotal(allItems);
			subtotal = Math.round(subtotal);
			const offerResult = applyOffer({ outletId, items: allItems, subTotal: subtotal }, offerDoc as any);
			const discount = offerResult.discount;
			const pricing = {
				subTotal: subtotal,
				discount,
				discountedPrice: Math.max(subtotal - discount, 0),
				tax: applyTax(Math.max(subtotal - discount, 0)),
				grandTotal: Math.max(subtotal - discount, 0) + applyTax(Math.max(subtotal - discount, 0)),
			};

			const overallDiscount = Math.max(rawTotalPrice - pricing.grandTotal, 0);

			const pricingResponse = {
				subtotal: pricing.subTotal,
				discount: pricing.discount,
				discountedPrice: pricing.discountedPrice,
				tax: pricing.tax,
				total: pricing.grandTotal,
				rawTotalPrice,
				overallDiscount,
			};

			// ── Descriptive Offer Grouping & Logging ─────────────────────────
			interface FlatOfferItem {
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
				offerId: string | null;
				offerTitle: string;
				category: string | null;
				subcategory: string | null;
				comboPrice: number | null;
			}

			const getFlatOfferItems = (
				itemsList: any[],
				inheritedOfferId: string | null = null,
				inheritedOfferTitle: string = '',
				inheritedComboPrice: number | null = null
			): FlatOfferItem[] => {
				const flatList: FlatOfferItem[] = [];
				for (const item of itemsList) {
					if (!item) continue;
					const nested = Array.isArray(item.items) ? item.items : [];
					const currentOfferId = item.offerId || inheritedOfferId || null;
					const currentOfferTitle = item.offerTitle || inheritedOfferTitle || '';
					const currentComboPrice = item.comboPrice ?? inheritedComboPrice ?? null;
					if (nested.length > 0) {
						flatList.push(...getFlatOfferItems(nested, currentOfferId, currentOfferTitle, currentComboPrice));
					} else {
						flatList.push({
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
							offerId: currentOfferId,
							offerTitle: currentOfferTitle,
							category: item.category ? String(item.category).trim() : null,
							subcategory: item.subcategory ? String(item.subcategory).trim() : null,
							comboPrice: currentComboPrice,
						});
					}
				}
				return flatList;
			};

			const flatOfferItems = getFlatOfferItems(allItems);
			const offerGroups = new Map<string, {
				offerId: string;
				offerTitle: string;
				offerType: string;
				items: FlatOfferItem[];
				description: string;
			}>();

			let checkoutDiscountDesc = '';
			const checkoutDiscountItems: FlatOfferItem[] = [];

			if (offerDoc && orderType === 'DISCOUNT') {
				const discountConfig = offerDoc.config?.discount || {};
				const discountMode = String(discountConfig.mode || discountConfig.type || '').toUpperCase();
				const percent = readNumber(discountConfig.discountValue ?? offerDoc.config?.discountValue ?? offerDoc.discountPercent ?? offerDoc.discountValue, 0);

				const allowedIds: string[] = [];
				if (Array.isArray(discountConfig.productIds)) {
					allowedIds.push(...discountConfig.productIds.map((id: any) => String(id || '').trim()));
				} else if (Array.isArray(offerDoc.applicableProductIds)) {
					allowedIds.push(...offerDoc.applicableProductIds.map((id: any) => String(id || '').trim()));
				}
				if (Array.isArray(offerDoc.products)) {
					offerDoc.products.forEach((p: any) => {
						if (p && p.productId) {
							allowedIds.push(String(p.productId).trim());
						}
					});
				}
				const allowedNames = Array.isArray(offerDoc.products)
					? offerDoc.products.map((p: any) => String(p?.name || '').trim().toLowerCase()).filter(Boolean)
					: [];

				const categoryName = String(discountConfig.categoryName || discountConfig.category || offerDoc.applicableCategory || offerDoc.category || '').trim().toLowerCase();

				for (const item of flatOfferItems) {
					if (item.isFree || item.isCombo || item.isManualB1G1 || item.isBirthday) {
						continue;
					}
					if (item.offerId && item.offerId !== offerDoc.id) {
						continue;
					}

					let matches = false;
					if (discountMode === 'CATEGORY' && categoryName) {
						const itemCat = String(item.category || '').trim().toLowerCase();
						const itemSubCat = String(item.subcategory || '').trim().toLowerCase();
						matches = itemCat === categoryName || itemSubCat === categoryName;
					} else if (discountMode === 'PRODUCT' && (allowedIds.length > 0 || allowedNames.length > 0)) {
						const itemId = String(item.productId).trim();
						const itemName = String(item.name).trim().toLowerCase();
						matches = allowedIds.includes(itemId) || allowedNames.includes(itemName);
					} else if (allowedIds.length > 0 || allowedNames.length > 0) {
						const itemId = String(item.productId).trim();
						const itemName = String(item.name).trim().toLowerCase();
						matches = allowedIds.includes(itemId) || allowedNames.includes(itemName);
					} else if (categoryName && categoryName !== 'all') {
						const itemCat = String(item.category || '').trim().toLowerCase();
						const itemSubCat = String(item.subcategory || '').trim().toLowerCase();
						matches = itemCat === categoryName || itemSubCat === categoryName;
					} else {
						matches = true;
					}

					if (matches) {
						checkoutDiscountItems.push(item);
					}
				}

				if (checkoutDiscountItems.length > 0) {
					checkoutDiscountDesc = `Applied ${percent}% discount on eligible items: ${checkoutDiscountItems.map(i => `${i.name} (Qty: ${i.qty})`).join(', ')}. Total discount saved: ₹${discount}.`;
				}
			}

			for (const item of flatOfferItems) {
				const oid = item.offerId;
				if (oid) {
					if (!offerGroups.has(oid)) {
						let offerType = 'SPECIAL';
						if (item.isCombo) offerType = 'COMBO';
						else if (item.isManualB1G1) offerType = 'B1G1';
						else if (item.isDiscount) offerType = 'DISCOUNT';
						else if (item.isBirthday) offerType = 'BIRTHDAY';

						offerGroups.set(oid, {
							offerId: oid,
							offerTitle: item.offerTitle || `Offer #${oid}`,
							offerType,
							items: [],
							description: '',
						});
					}
					offerGroups.get(oid)!.items.push(item);
				}
			}

			for (const group of offerGroups.values()) {
				if (group.offerType === 'B1G1') {
					const freeItem = group.items.find(i => i.isFree);
					const paidItem = group.items.find(i => !i.isFree);
					if (freeItem && paidItem) {
						group.description = `Buy 1 Get 1 Free applied: cheapest item '${freeItem.name}' (base price ₹${freeItem.unitPrice}) is FREE! Paid item is '${paidItem.name}' (price ₹${paidItem.unitPrice}).`;
					} else {
						group.description = `B1G1 Pair Offer applied to items: ${group.items.map(i => i.name).join(', ')}.`;
					}
				} else if (group.offerType === 'COMBO') {
					const cPrice = group.items[0]?.comboPrice ?? 0;
					group.description = `Combo Deal applied: Bundled items [${group.items.map(i => `${i.name} (Qty: ${i.qty})`).join(', ')}] for a fixed price of ₹${cPrice}.`;
				} else if (group.offerType === 'BIRTHDAY') {
					const freeItem = group.items[0];
					if (freeItem) {
						group.description = `Birthday Special Treat claimed: '${freeItem.name}' (base price ₹${freeItem.unitPrice}) is 100% FREE! 🎂`;
					}
				} else if (group.offerType === 'DISCOUNT') {
					group.description = `Interactive discount offer applied to items: ${group.items.map(i => i.name).join(', ')}.`;
				}
			}

			const summarizeGroupPricing = (
				offerTypeValue: string,
				groupItems: FlatOfferItem[],
				groupOfferId: string
			): { groupSubtotal: number; groupDiscount: number; groupDiscountedPrice: number } => {
				const groupSubtotal = Math.round(groupItems.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0));
				let groupDiscount = 0;

				if (orderType === 'DISCOUNT' && offerDoc?.id && groupOfferId === offerDoc.id) {
					groupDiscount = Math.round(discount);
				} else if (offerTypeValue === 'COMBO') {
					const baseTotal = groupItems.reduce((sum, item) => sum + (Number(item.unitPrice || 0) * Number(item.qty || 0)), 0);
					const comboPrice = Number(groupItems.find((item) => Number.isFinite(Number(item.comboPrice)))?.comboPrice ?? 0);
					groupDiscount = Math.round(Math.max(baseTotal - comboPrice, 0));
				} else if (offerTypeValue === 'B1G1') {
					const freeItem = groupItems.find((item) => item.isFree);
					if (freeItem) {
						groupDiscount = Math.round(Number(freeItem.unitPrice || 0) * Number(freeItem.qty || 1));
					} else {
						const sorted = [...groupItems].sort((a, b) => Number(a.unitPrice || 0) - Number(b.unitPrice || 0));
						if (sorted.length > 0) groupDiscount = Math.round(Number(sorted[0].unitPrice || 0) * Number(sorted[0].qty || 1));
					}
				} else if (offerTypeValue === 'BIRTHDAY' && groupItems.every((item) => item.isFree)) {
					groupDiscount = groupSubtotal;
				}

				groupDiscount = Math.max(0, Math.min(groupDiscount, groupSubtotal));
				return {
					groupSubtotal,
					groupDiscount,
					groupDiscountedPrice: Math.max(groupSubtotal - groupDiscount, 0),
				};
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

			const seenOfferIds = new Set<string>();

			if (offerDoc && orderType === 'DISCOUNT' && checkoutDiscountItems.length > 0) {
				const pricingSummary = summarizeGroupPricing('DISCOUNT', checkoutDiscountItems, offerDoc.id);
				appliedOfferLogs.push({
					offerId: offerDoc.id,
					offerTitle: offerDoc.title || offerDoc.id,
					offerType: 'DISCOUNT',
					description: checkoutDiscountDesc,
					groupSubtotal: pricingSummary.groupSubtotal,
					groupDiscount: pricingSummary.groupDiscount,
					groupDiscountedPrice: pricingSummary.groupDiscountedPrice,
					items: checkoutDiscountItems.map(i => ({
						name: i.name,
						productId: i.productId,
						qty: i.qty,
						unitPrice: i.unitPrice,
						totalPrice: i.totalPrice,
						isFree: i.isFree,
					})),
				});
				seenOfferIds.add(offerDoc.id);
			}

			for (const group of offerGroups.values()) {
				if (seenOfferIds.has(group.offerId)) continue;
				const pricingSummary = summarizeGroupPricing(group.offerType, group.items, group.offerId);
				appliedOfferLogs.push({
					offerId: group.offerId,
					offerTitle: group.offerTitle,
					offerType: group.offerType,
					description: group.description,
					groupSubtotal: pricingSummary.groupSubtotal,
					groupDiscount: pricingSummary.groupDiscount,
					groupDiscountedPrice: pricingSummary.groupDiscountedPrice,
					items: group.items.map(i => ({
						name: i.name,
						productId: i.productId,
						qty: i.qty,
						unitPrice: i.unitPrice,
						totalPrice: i.totalPrice,
						isFree: i.isFree,
					})),
				});
				seenOfferIds.add(group.offerId);
			}

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
				appliedOffers: offerResult.appliedOffers,
				appliedOfferLogs,
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