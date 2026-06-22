// shared/utilities/offers/orderPricing.ts
//
// Canonical pricing model:
//
//   unitPrice   = base price of 1 item (no add-ons, qty = 1)  — sourced from products collection
//   addOnsTotal = sum of all add-on prices for this item line
//   totalPrice  = (unitPrice + addOnsTotal) * qty              — per order-item
//   subTotal    = sum of all items' totalPrice
//
//   discount    = depends on orderType (see applyOffer.ts)
//   discountedPrice = max(subTotal - discount, 0)
//   tax         = 0  (calculated only during final bill generation)
//   grandTotal  = discountedPrice
//
// The Firestore order document stores exactly these keys — nothing else for money.


export type OrderType = "BASIC" | "B1G1" | "COMBO" | "DISCOUNT" | "NEW_USER";

// ---------------------------------------------------------------------------
// Item normalisation
// ---------------------------------------------------------------------------

export interface RawInputItem {
	productId?: string;
	id?: string;
	qty?: number;
	quantity?: number;
	unitPrice?: number;
	price?: number;
	originalPrice?: number;
	finalPrice?: number;
	discountAmount?: number;
	dealPrice?: number;
	addOns?: Array<{ name?: string; price?: number }>;
	addons?: Array<{ name?: string; price?: number }>;
	offerId?: string;
	variation?: unknown;
	name?: string;
	[key: string]: unknown;
}

export interface NormalisedOrderItem {
	productId: string;
	name: string;
	category: string | null;
	subcategory: string | null;
	qty: number;
	unitPrice: number;
	addOns: Array<{ name: string; price: number }>;
	totalPrice: number;
	originalPrice?: number | null;
	finalPrice?: number | null;
	discountAmount?: number | null;
	dealPrice?: number | null;
	price?: number | null;
	variation: unknown | null;
	offerId: string | null;
	offerType?: OrderType | null;
	offerTitle?: string | null;
	isOfferItem?: boolean;
	isCombo?: boolean;
	isManualB1G1?: boolean;
	isDiscount?: boolean;
	isBirthday?: boolean;
	isFree?: boolean;
	status: string;
	createdBy: string | null;
	addedAt: Date | null;
	items?: NormalisedOrderItem[];
	comboBaseTotal?: number;
	comboPrice?: number | null;
	discount: number;
	discountedPrice: number;
	tax: number;
}

export interface BillDisplayItem {
	id: string;
	productId: string;
	name: string;
	qty: number;
	unitPrice: number;
	totalPrice: number;
	addOns: Array<{ name: string; price: number }>;
	variations: unknown[];
	customizations: unknown[];
	items: BillDisplayItem[];
	isCombo: boolean;
	isManualB1G1: boolean;
	isDiscount: boolean;
	isBirthday: boolean;
	isFree: boolean;
	offerTitle: string;
	category?: string | null;
	subcategory?: string | null;
}

const readNumber = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const readString = (v: unknown): string => String(v ?? "").trim();

const readOfferType = (value: unknown): OrderType | null => {
  let str = readString(value).toUpperCase();
  if (str === "REGISTRATION") str = "DISCOUNT";
  switch (str) {
  case "B1G1":
  case "COMBO":
  case "DISCOUNT":
  case "NEW_USER":
    return readString(value).toUpperCase() as OrderType;
  default:
    return null;
  }
};

const resolveOfferMeta = (raw: RawInputItem): {
	offerType: OrderType | null;
	offerTitle: string | null;
	isCombo: boolean;
	isManualB1G1: boolean;
	isDiscount: boolean;
	isBirthday: boolean;
} => {
  const offerType = readOfferType(raw.offerType) || (raw.isCombo ? "COMBO" : raw.isManualB1G1 ? "B1G1" : raw.isDiscount ? "DISCOUNT" : raw.isNewUser ? "NEW_USER" : null);
  return {
    offerType,
    offerTitle: readString(raw.offerTitle) || null,
    isCombo: Boolean(raw.isCombo || offerType === "COMBO"),
    isManualB1G1: Boolean(raw.isManualB1G1 || offerType === "B1G1"),
    isDiscount: Boolean(raw.isDiscount || offerType === "DISCOUNT" || offerType === "NEW_USER"),
    isBirthday: Boolean(raw.isBirthday),
  };
};

const isSyntheticOfferWrapperId = (value: unknown): boolean => {
  const id = readString(value).toLowerCase();
  return id.startsWith("discount_") || id.startsWith("combo_") || id.startsWith("b1g1_") || id.startsWith("birthday_");
};

export const normalizeOrderItemsForPricing = async (
  rawItems: unknown[],
  resolveProductPrice?: (productId: string) => Promise<number | null>,
): Promise<NormalisedOrderItem[]> => {
  const results: NormalisedOrderItem[] = [];

  for (const rawItem of rawItems) {
    const raw = (rawItem || {}) as RawInputItem;
    const nestedItems = Array.isArray((raw as { items?: unknown[] }).items) ? (raw as { items?: unknown[] }).items || [] : [];
    const hasOfferWrapperShape =
			Boolean(raw.offerType === "NEW_USER") ||
			(
			  nestedItems.length > 0 &&
				(
				  Boolean(raw.offerId) ||
					Boolean(raw.offerType) ||
					Boolean(raw.isCombo) ||
					Boolean(raw.isManualB1G1) ||
					Boolean(raw.isDiscount) ||
					Boolean(raw.isBirthday) ||
					isSyntheticOfferWrapperId(raw.id)
				)
			);
    const offerMeta = resolveOfferMeta(raw);
    const productId = readString(raw.productId || (hasOfferWrapperShape ? "" : raw.id));

    if (nestedItems.length > 0 && (hasOfferWrapperShape || !productId)) {
      const nestedResults = await normalizeOrderItemsForPricing(nestedItems, resolveProductPrice);
      const inheritedOfferId = readString(raw.offerId) || null;

      if (offerMeta.isCombo) {
        const comboPrice = readNumber((raw as any).comboPrice ?? (raw as any).config?.combo?.comboPrice ?? 0);
        const wrapperTotalPrice = readNumber((raw as any).discountedPrice ?? raw.totalPrice ?? raw.price, NaN);
        const fallbackTotalPrice = nestedResults.reduce((s, it) => s + (it.totalPrice || 0), 0);
        const normalizedTotalPrice = Number.isFinite(wrapperTotalPrice) ? wrapperTotalPrice : fallbackTotalPrice;
        const comboBaseTotal = readNumber((raw as any).comboBaseTotal, NaN);
        const resolvedComboBaseTotal = Number.isFinite(comboBaseTotal) ? comboBaseTotal : Math.max(0, normalizedTotalPrice - comboPrice);

        results.push({
          productId: readString(raw.productId) || readString(raw.id) || `combo_${inheritedOfferId || "anon"}`,
          name: readString(raw.name) || readString(raw.offerTitle) || "Combo Offer",
          category: null,
          subcategory: null,
          qty: Math.max(Math.floor(readNumber(raw.qty ?? raw.quantity, 1)), 1),
          unitPrice: comboPrice,
          addOns: [],
          totalPrice: normalizedTotalPrice,
          originalPrice: readNumber(raw.originalPrice ?? raw.price, NaN),
          finalPrice: readNumber(raw.finalPrice ?? raw.dealPrice ?? normalizedTotalPrice, NaN),
          discountAmount: readNumber(raw.discountAmount ?? (Number.isFinite(resolvedComboBaseTotal) ? resolvedComboBaseTotal : 0), NaN),
          dealPrice: readNumber(raw.dealPrice ?? raw.finalPrice, NaN),
          price: readNumber(raw.price, NaN),
          variation: raw.variation ?? null,
          offerId: inheritedOfferId,
          offerType: offerMeta.offerType,
          offerTitle: offerMeta.offerTitle,
          isOfferItem: true,
          isCombo: true,
          isManualB1G1: false,
          isDiscount: false,
          isBirthday: false,
          status: readString(raw.status) || "in-progress",
          createdBy: readString(raw.createdBy) || null,
          addedAt: null,
          items: nestedResults,
          comboBaseTotal: resolvedComboBaseTotal,
          comboPrice: comboPrice || null,
          discount: readNumber(raw.discount ?? raw.discountAmount ?? Math.max(0, resolvedComboBaseTotal - comboPrice), 0),
          discountedPrice: normalizedTotalPrice,
          tax: 0,
        });
        continue;
      }

      for (const nested of nestedResults) {
        results.push({
          ...nested,
          offerId: nested.offerId || inheritedOfferId,
          offerType: nested.offerType || offerMeta.offerType,
          offerTitle: nested.offerTitle || offerMeta.offerTitle,
          isOfferItem: nested.isOfferItem || offerMeta.isCombo || offerMeta.isManualB1G1 || offerMeta.isDiscount || offerMeta.isBirthday || Boolean(inheritedOfferId),
          isCombo: nested.isCombo || offerMeta.isCombo,
          isManualB1G1: nested.isManualB1G1 || offerMeta.isManualB1G1,
          isDiscount: nested.isDiscount || offerMeta.isDiscount,
          isBirthday: nested.isBirthday || offerMeta.isBirthday,
          discount: nested.discount ?? 0,
          discountedPrice: nested.discountedPrice ?? nested.totalPrice,
          tax: 0,
        });
      }
      continue;
    }

    // Skip NEW_USER wrapper items — they are order-level, not product-level
    if (
      offerMeta.offerType === "NEW_USER" ||
			raw.offerType === "NEW_USER"
    ) {
      continue;
    }

    if (!productId) {
      throw new Error("INVALID_ITEM_PAYLOAD");
    }

    const qty = Math.max(Math.floor(readNumber(raw.qty ?? raw.quantity, 1)), 1);

    const resolvedPrice = resolveProductPrice ? await resolveProductPrice(productId) : null;
    if (resolvedPrice === null) {
      throw new Error(`PRODUCT_NOT_FOUND:${productId}`);
    }
    const unitPrice = resolvedPrice;

    const rawAddOns: Array<{ name?: string; price?: number }> =
			Array.isArray(raw.addOns) ? raw.addOns : Array.isArray(raw.addons) ? raw.addons : [];

    const addOns = rawAddOns.map((a) => ({
      name: readString(a.name),
      price: readNumber(a.price, 0),
    }));

    const addOnsTotal = addOns.reduce((s, a) => s + a.price, 0);
    const totalPrice = (unitPrice + addOnsTotal) * qty;

    results.push({
      productId,
      name: readString(raw.name) || "Unknown Product",
      category: null,
      subcategory: null,
      qty,
      unitPrice,
      addOns,
      totalPrice,
      originalPrice: readNumber(raw.originalPrice ?? raw.price, NaN),
      finalPrice: readNumber(raw.finalPrice ?? raw.dealPrice, NaN),
      discountAmount: readNumber(raw.discountAmount, NaN),
      dealPrice: readNumber(raw.dealPrice ?? raw.finalPrice, NaN),
      price: readNumber(raw.price, NaN),
      variation: raw.variation ?? null,
      offerId: readString(raw.offerId) || null,
      offerType: offerMeta.offerType,
      offerTitle: offerMeta.offerTitle,
      isOfferItem: offerMeta.isCombo || offerMeta.isManualB1G1 || offerMeta.isDiscount || offerMeta.isBirthday || Boolean(readString(raw.offerId)),
      isCombo: offerMeta.isCombo,
      isManualB1G1: offerMeta.isManualB1G1,
      isDiscount: offerMeta.isDiscount,
      isBirthday: offerMeta.isBirthday,
      status: readString(raw.status) || "in-progress",
      createdBy: readString(raw.createdBy) || null,
      addedAt: null,
      discount: 0,
      discountedPrice: totalPrice,
      tax: 0,
    });
  }

  return results;
};

const readQty = (item: Record<string, unknown>): number => {
  const qty = readNumber(item.qty ?? item.quantity, 1);
  return Math.max(Math.floor(qty), 1);
};

const readMoney = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const normalizeBillItemsForDisplay = (rawItems: unknown[]): BillDisplayItem[] => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];

  return rawItems.map((rawItem, index) => {
    const raw = (rawItem || {}) as Record<string, unknown>;
    const nestedItems = Array.isArray(raw.items) ? normalizeBillItemsForDisplay(raw.items) : [];
    const qty = readQty(raw);
    const storedTotal = readMoney(raw.totalPrice ?? raw.totalAmount ?? raw.itemTotal);
    const storedUnit = readMoney(raw.unitPrice ?? raw.finalUnitPrice ?? raw.price);
    const totalPrice = storedTotal !== null ?
      Math.max(storedTotal, 0) :
      nestedItems.length > 0 ?
        nestedItems.reduce((sum, item) => sum + item.totalPrice, 0) :
        Math.max((storedUnit ?? 0) * qty, 0);
    const unitPrice = storedUnit !== null ?
      Math.max(storedUnit, 0) :
      qty > 0 ?
        Math.max(totalPrice / qty, 0) :
        0;
    const addOns = Array.isArray(raw.addOns) ?
      raw.addOns :
      Array.isArray(raw.addons) ?
        raw.addons :
        [];
    const items = Array.isArray(raw.items) ? normalizeBillItemsForDisplay(raw.items) : [];

    return {
      id: readString(raw.id) || readString(raw.productId) || readString(raw.name) || `item-${index}`,
      productId: readString(raw.productId) || readString(raw.id),
      name: readString(raw.name) || readString(raw.title) || "Item",
      qty,
      unitPrice,
      totalPrice,
      addOns: addOns.map((a: { name?: string; price?: number }) => ({name: readString(a?.name), price: readNumber(a?.price, 0)})),
      variations: Array.isArray(raw.variations) ? raw.variations : [],
      customizations: Array.isArray(raw.customizations) ? raw.customizations : [],
      items,
      isCombo: Boolean(raw.isCombo),
      isManualB1G1: Boolean(raw.isManualB1G1),
      isDiscount: Boolean(raw.isDiscount),
      isBirthday: Boolean(raw.isBirthday),
      isFree: Boolean(raw.isFree),
      offerTitle: readString(raw.offerTitle),
      category: raw.category ? String(raw.category).trim() : null,
      subcategory: raw.subcategory ? String(raw.subcategory).trim() : null,
    };
  });
};

// ---------------------------------------------------------------------------
// Order type inference
// ---------------------------------------------------------------------------

export const inferOrderType = (offerType: string | null | undefined): OrderType => {
  switch (readString(offerType).toUpperCase()) {
  case "B1G1": return "B1G1";
  case "COMBO": return "COMBO";
  case "DISCOUNT": return "DISCOUNT";
  case "NEW_USER": return "NEW_USER";
  default: return "BASIC";
  }
};

// ---------------------------------------------------------------------------
// Grand-total builder
// ---------------------------------------------------------------------------

export interface PricingSummary {
	subTotal: number;
	discount: number;
	discountedPrice: number;
	tax: number; // always 0 at order time
	grandTotal: number; // = discountedPrice
}

export const buildPricingSummary = (
  subTotal: number,
  discount: number,
  _applyTaxFn?: (amount: number) => number, // kept for signature compatibility, unused
): PricingSummary => {
  const discountedPrice = Math.max(subTotal - discount, 0);
  const tax = 0;
  const grandTotal = discountedPrice;
  return {subTotal, discount, discountedPrice, tax, grandTotal};
};

// ---------------------------------------------------------------------------
// Per-item discount calculation
// ---------------------------------------------------------------------------

export interface OfferDocForPricing {
	id?: string;
	offerType?: string;
	type?: string;
	title?: string;
	config?: {
		combo?: { comboPrice?: number };
		discount?: {
			discountValue?: number;
			mode?: string;
			type?: string;
			productIds?: string[];
			categoryName?: string | null;
			category?: string | null;
		};
		discountValue?: number;
	};
	comboPrice?: number;
	discountPercent?: number;
	discountValue?: number;
	applicableProductIds?: string[];
	products?: Array<{ productId?: string; name?: string }>;
	applicableCategory?: string;
	category?: string;
}

// ---------------------------------------------------------------------------
// NEW_USER: apply order-level discount proportionally across eligible items
// ---------------------------------------------------------------------------

const applyNewUserDiscount = (
  items: NormalisedOrderItem[],
  offerDoc: OfferDocForPricing,
): NormalisedOrderItem[] => {
  const discountPercent = readNumber(
    offerDoc.config?.discount?.discountValue ??
		offerDoc.config?.discountValue ??
		offerDoc.discountPercent ??
		offerDoc.discountValue,
    0
  );

  if (discountPercent <= 0) return items;

  // Only regular items are eligible
  const eligibleItems = items.filter(
    (it) => !it.isCombo && !it.isManualB1G1 && !it.isBirthday && !it.isFree
  );

  const eligibleTotal = eligibleItems.reduce((s, it) => s + it.totalPrice, 0);
  if (eligibleTotal <= 0) return items;

  const totalDiscount = Math.floor((eligibleTotal * discountPercent) / 100);
  if (totalDiscount <= 0) return items;

  return items.map((item) => {
    if (item.isCombo || item.isManualB1G1 || item.isBirthday || item.isFree) {
      return item;
    }
    const itemShare = item.totalPrice / eligibleTotal;
    const itemDiscount = Math.floor(totalDiscount * itemShare);
    const newDiscount = (item.discount ?? 0) + itemDiscount;
    const discountedPrice = Math.max(item.totalPrice - newDiscount, 0);
    return {
      ...item,
      discount: newDiscount,
      discountedPrice,
      tax: 0,
    };
  });
};

export const applyOfferToItems = (
  items: NormalisedOrderItem[],
  offerDoc: OfferDocForPricing | null,
  _applyTaxFn?: (amount: number) => number, // kept for signature compatibility, unused
): NormalisedOrderItem[] => {
  if (!offerDoc) {
    return items.map((item) => ({
      ...item,
      discount: 0,
      discountedPrice: item.totalPrice,
      tax: 0,
    }));
  }

  let offerType = (offerDoc.offerType ?? offerDoc.type ?? "BASIC").toUpperCase();
  if (offerType === "REGISTRATION") {
    offerType = "DISCOUNT";
  }

  // NEW_USER is handled separately after all other offers
  if (offerType === "NEW_USER") {
    const baseItems = items.map((item) => ({
      ...item,
      discount: item.discount ?? 0,
      discountedPrice: item.discountedPrice ?? item.totalPrice,
      tax: 0,
    }));
    return applyNewUserDiscount(baseItems, offerDoc);
  }

  const results: NormalisedOrderItem[] = [];

  switch (offerType) {
  case "B1G1": {
    const offerItems = items.filter((it) => it.offerId === offerDoc.id);
    if (offerItems.length === 2) {
      const sorted = [...offerItems].sort((a, b) => a.unitPrice - b.unitPrice);
      const cheapest = sorted[0];
      for (const item of items) {
        let discount = 0;
        if (item === cheapest) {
          // Discount only unitPrice — add-ons are still charged
          discount = item.unitPrice;
        }
        const discountedPrice = Math.max(item.totalPrice - discount, 0);
        results.push({...item, discount, discountedPrice, tax: 0});
      }
    } else {
      return items.map((item) => ({
        ...item,
        discount: 0,
        discountedPrice: item.totalPrice,
        tax: 0,
      }));
    }
    break;
  }

  case "COMBO": {
    const offerItems = items.filter((it) => {
      if (it.offerId === offerDoc.id) return true;
      if (Array.isArray(offerDoc.products) && offerDoc.products.length > 0) {
        return offerDoc.products.some((p: any) => String(p?.productId || "").trim() === String(it.productId).trim());
      }
      return false;
    });

    if (offerItems.length === 0) {
      return items.map((item) => ({
        ...item,
        discount: 0,
        discountedPrice: item.totalPrice,
        tax: 0,
      }));
    }

    const wrapper = offerItems.find(
      (it) => it.isCombo && Array.isArray((it as any).items) && (it as any).items.length > 0
    ) as NormalisedOrderItem | undefined;

    const comboPriceFromOffer = readNumber(offerDoc.config?.combo?.comboPrice ?? offerDoc.comboPrice, 0);

    if (wrapper) {
      const nested = (wrapper as any).items as NormalisedOrderItem[];
      const comboBaseTotal = wrapper.comboBaseTotal ?? nested.reduce((s, it) => s + (it.unitPrice * it.qty), 0);
      const comboPrice = wrapper.comboPrice ?? comboPriceFromOffer;
      const totalComboDiscount = Math.max(comboBaseTotal - (comboPrice || 0), 0);

      for (const item of items) {
        if (item === wrapper) {
          const discount = totalComboDiscount;
          const discountedPrice = Math.max(item.totalPrice - discount, 0);
          results.push({...item, discount, discountedPrice, tax: 0});
        } else {
          results.push({...item, discount: 0, discountedPrice: item.totalPrice, tax: 0});
        }
      }
    } else {
      const comboBaseTotal = offerItems.reduce((s, it) => s + (it.unitPrice * it.qty), 0);
      const nestedAddOnsTotal = offerItems.reduce((s, it) => s + (it.totalPrice - (it.unitPrice * it.qty)), 0);
      const comboPrice = comboPriceFromOffer;
      const totalComboDiscount = Math.max(comboBaseTotal - (comboPrice || 0), 0);

      for (const item of items) {
        if (!offerItems.includes(item)) {
          results.push({...item, discount: 0, discountedPrice: item.totalPrice, tax: 0});
        }
      }

      const wrapperTotalPrice = comboBaseTotal + nestedAddOnsTotal;
      const wrapperDiscountedPrice = Math.max(wrapperTotalPrice - totalComboDiscount, 0);
      results.push({
        productId: `combo_${offerDoc.id}`,
        name: readString(offerDoc.title ?? "Combo Offer"),
        category: null,
        subcategory: null,
        qty: 1,
        unitPrice: comboPrice,
        addOns: [],
        totalPrice: wrapperTotalPrice,
        originalPrice: null,
        finalPrice: null,
        discountAmount: null,
        dealPrice: null,
        price: null,
        variation: null,
        offerId: offerDoc.id || null,
        offerType: "COMBO",
        offerTitle: readString(offerDoc.title ?? "Combo Offer"),
        isOfferItem: true,
        isCombo: true,
        isManualB1G1: false,
        isDiscount: false,
        isBirthday: false,
        status: "in-progress",
        createdBy: null,
        addedAt: null,
        comboBaseTotal,
        comboPrice: comboPrice || null,
        items: offerItems,
        discount: totalComboDiscount,
        discountedPrice: wrapperDiscountedPrice,
        tax: 0,
      });
    }
    break;
  }

  case "DISCOUNT": {
    const discountConfig = offerDoc.config?.discount || {};
    const discountMode = String(discountConfig.mode || discountConfig.type || "").toUpperCase();
    const discountPercent = readNumber(
      discountConfig.discountValue ?? offerDoc.config?.discountValue ?? offerDoc.discountPercent ?? offerDoc.discountValue,
      0
    );

    const allowedIds: string[] = [];
    if (Array.isArray(discountConfig.productIds)) {
      allowedIds.push(...discountConfig.productIds.map((id: any) => String(id || "").trim()));
    } else if (Array.isArray(offerDoc.applicableProductIds)) {
      allowedIds.push(...offerDoc.applicableProductIds.map((id: any) => String(id || "").trim()));
    }
    if (Array.isArray(offerDoc.products)) {
      offerDoc.products.forEach((p: any) => {
        if (p && p.productId) allowedIds.push(String(p.productId).trim());
      });
    }
    const allowedNames = Array.isArray(offerDoc.products) ?
      offerDoc.products.map((p: any) => String(p?.name || "").trim().toLowerCase()).filter(Boolean) :
      [];
    const categoryName = String(discountConfig.categoryName || discountConfig.category || offerDoc.applicableCategory || offerDoc.category || "").trim().toLowerCase();

    for (const item of items) {
      let discount = 0;

      const isSpecial = item.isFree || item.isCombo || item.isManualB1G1 || item.isBirthday;
      const hasConflictingOffer = item.offerId && item.offerId !== offerDoc.id;

      if (!isSpecial && !hasConflictingOffer) {
        let isEligible = false;

        if (discountMode === "CATEGORY" && categoryName) {
          const itemCat = String(item.category || "").trim().toLowerCase();
          const itemSubCat = String(item.subcategory || "").trim().toLowerCase();
          if (itemCat === categoryName || itemSubCat === categoryName) {
            isEligible = true;
          } else if (Array.isArray(offerDoc.products) && offerDoc.products.length > 0) {
            isEligible = offerDoc.products.some((p: any) => String(p?.productId || "").trim() === String(item.productId).trim());
          }
        } else if (discountMode === "PRODUCT" && (allowedIds.length > 0 || allowedNames.length > 0)) {
          const itemId = String(item.productId).trim();
          const itemName = String(item.name).trim().toLowerCase();
          isEligible = allowedIds.includes(itemId) || allowedNames.includes(itemName);
        } else if (allowedIds.length > 0 || allowedNames.length > 0) {
          const itemId = String(item.productId).trim();
          const itemName = String(item.name).trim().toLowerCase();
          isEligible = allowedIds.includes(itemId) || allowedNames.includes(itemName);
        } else if (
          offerDoc.offerType?.toUpperCase() === "REGISTRATION" ||
						offerDoc.type?.toUpperCase() === "REGISTRATION" ||
						readString(offerDoc.category).toLowerCase() === "registration"
        ) {
          isEligible = true;
        } else if (categoryName && categoryName !== "all") {
          const itemCat = String(item.category || "").trim().toLowerCase();
          const itemSubCat = String(item.subcategory || "").trim().toLowerCase();
          isEligible = itemCat === categoryName || itemSubCat === categoryName;
        } else {
          isEligible = true;
        }

        if (isEligible) {
          const itemBaseTotal = item.unitPrice * item.qty;
          discount = Math.round((itemBaseTotal * discountPercent) / 100);
        }
      }

      const discountedPrice = Math.max(item.totalPrice - discount, 0);
      results.push({...item, discount, discountedPrice, tax: 0});
    }
    break;
  }

  case "BIRTHDAY": {
    for (const item of items) {
      let discount = 0;
      if (item.isBirthday && item.offerId === offerDoc.id) {
        discount = item.totalPrice;
      }
      const discountedPrice = Math.max(item.totalPrice - discount, 0);
      results.push({...item, discount, discountedPrice, tax: 0});
    }
    break;
  }

  default: {
    return items.map((item) => ({
      ...item,
      discount: 0,
      discountedPrice: item.totalPrice,
      tax: 0,
    }));
  }
  }

  return results;
};

export const applyOfferPricingByGroup = (
  items: NormalisedOrderItem[],
  offerDocsById: Map<string, OfferDocForPricing>,
  _applyTaxFn?: (amount: number) => number,
  primaryOfferDoc?: OfferDocForPricing | null,
  // ✅ NEW: NEW_USER offer passed explicitly, never mixed with primary
  newUserOfferDoc?: OfferDocForPricing | null,
): NormalisedOrderItem[] => {
  const groupedItems = new Map<string, NormalisedOrderItem[]>();

  for (const item of items) {
    const groupKey = readString(item.offerId) || "__basic__";
    if (!groupedItems.has(groupKey)) groupedItems.set(groupKey, []);
		groupedItems.get(groupKey)!.push(item);
  }

  let results: NormalisedOrderItem[] = [];

  // First pass: apply COMBO / B1G1 / DISCOUNT / BIRTHDAY per offerId group
  for (const [groupKey, groupItems] of groupedItems.entries()) {
    const offerDoc = groupKey === "__basic__" ?
      (primaryOfferDoc || null) :
      (offerDocsById.get(groupKey) || null);

    const offerType = offerDoc ?
      (offerDoc.offerType ?? offerDoc.type ?? "BASIC").toUpperCase() :
      "BASIC";

    // Skip NEW_USER here — handled in second pass
    if (offerType === "NEW_USER") {
      results.push(...groupItems.map((item) => ({
        ...item,
        discount: item.discount ?? 0,
        discountedPrice: item.discountedPrice ?? item.totalPrice,
        tax: 0,
      })));
      continue;
    }

    if (offerDoc) {
      results.push(...applyOfferToItems(groupItems, offerDoc));
      continue;
    }

    results.push(...groupItems.map((item) => ({
      ...item,
      discount: 0,
      discountedPrice: item.totalPrice,
      tax: 0,
    })));
  }

  // Second pass: apply NEW_USER globally across all items
  // Use explicitly passed newUserOfferDoc, or fall back to scanning offerDocsById
  const resolvedNewUserOfferDoc = newUserOfferDoc || (() => {
    for (const [, doc] of offerDocsById) {
      if ((doc.offerType ?? doc.type ?? "").toUpperCase() === "NEW_USER") return doc;
    }
    return null;
  })();

  if (resolvedNewUserOfferDoc) {
    results = applyNewUserDiscount(results, resolvedNewUserOfferDoc);
  }

  return results;
};

export const buildPricingSummaryFromItems = (items: NormalisedOrderItem[]): PricingSummary => {
  let subTotal = 0;
  let discount = 0;
  let discountedPrice = 0;

  for (const item of items) {
    subTotal += item.totalPrice;
    discount += item.discount;
    discountedPrice += item.discountedPrice;
  }

  subTotal = Math.max(0, subTotal);
  discount = Math.max(0, discount);
  discountedPrice = Math.max(0, discountedPrice);

  const tax = 0;
  const grandTotal = discountedPrice;

  return {subTotal, discount, discountedPrice, tax, grandTotal};
};

export const decorateOrderItemsWithOfferMeta = (
  items: NormalisedOrderItem[],
  offerMeta: {
		offerId: string | null;
		offerType: OrderType | null;
		offerTitle: string | null;
	},
): NormalisedOrderItem[] => {
  const hasOffer = Boolean(offerMeta.offerId || offerMeta.offerType);
  return items.map((item) => ({
    ...item,
    offerId: item.offerId || offerMeta.offerId,
    offerType: item.offerType || offerMeta.offerType,
    offerTitle: item.offerTitle || offerMeta.offerTitle,
    isOfferItem: item.isOfferItem || hasOffer,
    isCombo: item.isCombo || offerMeta.offerType === "COMBO",
    isManualB1G1: item.isManualB1G1 || offerMeta.offerType === "B1G1",
    isDiscount: item.isDiscount || offerMeta.offerType === "DISCOUNT" || offerMeta.offerType === "NEW_USER",
    isBirthday: item.isBirthday,
  }));
};
