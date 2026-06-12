import * as admin from "firebase-admin";
import { OfferDocument } from "./offers/applyOffer";

const db = admin.firestore();

const readString = (value: unknown): string => String(value ?? "").trim();
const readNumber = (value: unknown, fallback = 0): number => {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : fallback;
};

export interface CatalogProductDoc {
	id: string;
	price: number;
	name: string;
	category: string;
	subcategory: string;
	data: FirebaseFirestore.DocumentData;
}

const productCache = new Map<string, CatalogProductDoc | null>();
const offerCache = new Map<string, OfferDocument | null>();

export const getProductDoc = async (productId: string): Promise<CatalogProductDoc | null> => {
	const id = readString(productId);
	if (!id) return null;
	if (productCache.has(id)) return productCache.get(id) || null;

	const snapshot = await db.collection("products").doc(id).get();
	if (!snapshot.exists) {
		productCache.set(id, null);
		return null;
	}

	const data = snapshot.data() || {};
	const record: CatalogProductDoc = {
		id,
		price: readNumber(data.price, Number.NaN),
		name: readString(data.name),
		category: readString(data.category),
		subcategory: readString(data.subcategory),
		data,
	};
	productCache.set(id, record);
	return record;
};

export const getProductDocs = async (productIds: Iterable<string>): Promise<Map<string, CatalogProductDoc>> => {
	const uniqueIds = Array.from(new Set(Array.from(productIds).map(readString).filter(Boolean)));
	const entries = await Promise.all(uniqueIds.map(async (id) => {
		const doc = await getProductDoc(id);
		return doc ? ([id, doc] as const) : null;
	}));
	return new Map(entries.filter((entry): entry is readonly [string, CatalogProductDoc] => Boolean(entry)) as Array<[string, CatalogProductDoc]>);
};

export const getOfferDoc = async (offerId: string): Promise<OfferDocument | null> => {
	const id = readString(offerId);
	if (!id) return null;
	if (offerCache.has(id)) return offerCache.get(id) || null;

	const snapshot = await db.collection("offers").doc(id).get();
	if (!snapshot.exists) {
		offerCache.set(id, null);
		return null;
	}

	const data = { id: snapshot.id, ...(snapshot.data() || {}) } as OfferDocument;
	offerCache.set(id, data);
	return data;
};

export const getOfferDocs = async (offerIds: Iterable<string>): Promise<Map<string, OfferDocument>> => {
	const uniqueIds = Array.from(new Set(Array.from(offerIds).map(readString).filter(Boolean)));
	const entries = await Promise.all(uniqueIds.map(async (id) => {
		const doc = await getOfferDoc(id);
		return doc ? ([id, doc] as const) : null;
	}));
	return new Map(entries.filter((entry): entry is readonly [string, OfferDocument] => Boolean(entry)) as Array<[string, OfferDocument]>);
};
