import * as admin from "firebase-admin";
import * as functions from "firebase-functions";
import { Request, Response } from "express";
import {
	setCors,
	verifyAdminToken,
	parseDateInput,
	readString,
	readNumber,
	resolveLifecycleStatus,
	resolveRestaurantName,
	fetchDocById,
} from "./helpers";
import { getOfferDocs } from "../../shared/utilities/firestoreCatalog";

const db = admin.firestore();

export const getOfferUsageReport = functions.https.onRequest(async (req: Request, res: Response): Promise<void> => {
	setCors(res);
	if (req.method === "OPTIONS") { res.status(204).send(""); return; }
	if (req.method !== "GET") { res.status(405).json({ success: false, message: "Method not allowed" }); return; }

	const decodedToken = await verifyAdminToken(req, res);
	if (!decodedToken) return;

	try {
		const outletId = readString(req.query.outletId);
		const startDate = readString(req.query.startDate);
		const endDate = readString(req.query.endDate);

		const startTimestamp = parseDateInput(startDate, "start");
		const endTimestamp = parseDateInput(endDate, "end");

		let query: admin.firestore.Query;
		if (outletId) {
			query = db.collection("outlets").doc(outletId).collection("ordersHistory");
		} else {
			query = db.collectionGroup("ordersHistory");
		}
		if (startTimestamp) {
			query = query.where("archivedAt", ">=", startTimestamp);
		}
		if (endTimestamp) {
			query = query.where("archivedAt", "<=", endTimestamp);
		}

		const snap = await query.get();
		const orders = snap.docs.map((doc) => doc.data() as any);

		// Filter successful orders only and filter by outletId in-memory
		const successOrders = orders.filter((order) => {
			if (outletId && order.outletId !== outletId) return false;
			return resolveLifecycleStatus(order) === "success";
		});

		const offerIds = new Set<string>();
		for (const order of successOrders) {
			if (order.offerId) offerIds.add(readString(order.offerId));
			if (Array.isArray(order.appliedOffers)) {
				for (const applied of order.appliedOffers) {
					if (applied?.offerId) offerIds.add(readString(applied.offerId));
				}
			}
			for (const item of Array.isArray(order.items) ? order.items : []) {
				if (item?.offerId) offerIds.add(readString(item.offerId));
			}
		}
		const offerDocs = await getOfferDocs(offerIds);
		const offersMap = new Map<string, string>();
		offerDocs.forEach((doc, id) => {
			offersMap.set(id, readString(doc.title || doc.name || id));
		});

		// Grouping key: `${offerId}__${outletId}`
		const groupMap = new Map<string, {
			offerId: string;
			offerName: string;
			usageCount: number;
			totalDiscount: number;
			outletName: string;
		}>();

		const outletsCache = new Map<string, any>();

		for (const order of successOrders) {
			const oId = readString(order.outletId || "unknown");

			if (!outletsCache.has(oId) && oId !== "unknown") {
				const outletDoc = await fetchDocById("outlets", oId);
				outletsCache.set(oId, outletDoc);
			}

			const outletData = outletsCache.get(oId) || null;
			const outletName = resolveRestaurantName(outletData, order);

			const orderDiscount = readNumber(order.pricing?.discount || order.discount, 0);

			// Extract applied offers
			const appliedOffers: Array<{ offerId: string; title?: string; amount?: number }> = [];

			if (Array.isArray(order.appliedOffers) && order.appliedOffers.length > 0) {
				order.appliedOffers.forEach((o: any) => {
					if (o && o.offerId) {
						appliedOffers.push({
							offerId: readString(o.offerId),
							title: readString(o.title || o.name),
							amount: readNumber(o.amount || o.discountAmount, orderDiscount / order.appliedOffers.length),
						});
					}
				});
			} else if (order.offerId) {
				// Single fallback offerId at the order level
				appliedOffers.push({
					offerId: readString(order.offerId),
					amount: orderDiscount,
				});
			} else {
				// Check item level offerId values
				const items = Array.isArray(order.items) ? order.items : [];
				const itemOfferIds = new Set<string>();
				items.forEach((item: any) => {
					if (item.offerId) itemOfferIds.add(readString(item.offerId));
				});
				if (itemOfferIds.size > 0) {
					itemOfferIds.forEach((offId) => {
						appliedOffers.push({
							offerId: offId,
							amount: orderDiscount / itemOfferIds.size, // split discount across applied item offers
						});
					});
				}
			}

			// Add to grouping map
			appliedOffers.forEach((applied) => {
				const offerId = applied.offerId;
				const offerName = applied.title || offersMap.get(offerId) || `Offer (${offerId})`;
				const discountAmt = readNumber(applied.amount, 0);

				const mapKey = `${offerId}__${oId}`;
				const existing = groupMap.get(mapKey) || {
					offerId,
					offerName,
					usageCount: 0,
					totalDiscount: 0,
					outletName,
				};

				existing.usageCount += 1;
				existing.totalDiscount += discountAmt;

				groupMap.set(mapKey, existing);
			});
		}

		const rows = Array.from(groupMap.values()).map((row) => ({
			offerId: row.offerId,
			offerName: row.offerName,
			usageCount: row.usageCount,
			totalDiscount: Math.round(row.totalDiscount * 100) / 100,
			outlet: row.outletName,
		})).sort((a, b) => b.usageCount - a.usageCount || a.offerName.localeCompare(b.offerName));

		let totalUsage = 0;
		let totalDiscountAmount = 0;

		rows.forEach((row) => {
			totalUsage += row.usageCount;
			totalDiscountAmount += row.totalDiscount;
		});

		res.status(200).json({
			success: true,
			metadata: {
				generatedAt: new Date().toISOString(),
			},
			filters: {
				outletId,
				startDate,
				endDate,
			},
			summary: {
				totalUsage,
				totalDiscount: Math.round(totalDiscountAmount * 100) / 100,
			},
			columns: [
				{ header: "Offer Code / ID", key: "offerId" },
				{ header: "Offer Name", key: "offerName" },
				{ header: "Usage Count", key: "usageCount" },
				{ header: "Total Discount Given", key: "totalDiscount" },
				{ header: "Outlet Name", key: "outlet" },
			],
			rows,
		});
	} catch (error) {
		console.error("getOfferUsageReport error:", error);
		res.status(500).json({ success: false, message: "Internal server error", error: String(error) });
	}
});
